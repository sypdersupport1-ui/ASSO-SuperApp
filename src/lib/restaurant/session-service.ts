import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  restaurantTables,
  restaurantTableSessions,
  type RestaurantTableSession,
} from "@/db/schema/restaurant";
import { businessContexts } from "@/db/schema/context";
import { recordAuditEvent } from "@/lib/audit";
import { realtimeHub } from "@/lib/realtime/sse";
import { NotFoundError, BusinessRuleError, ValidationError } from "@/lib/api/errors";
import { assertTableStatusTransition } from "./state-machine";

export interface OpenTableSessionInput {
  tableId: string;
  guestCount?: number;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

export interface CloseTableSessionInput {
  notes?: string;
  nextTableStatus?: "CLEANING" | "AVAILABLE";
}

/**
 * Generates a unique, human-readable session reference number.
 * Format: TS-YYYYMMDD-XXXX
 */
function generateSessionNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `TS-${dateStr}-${rand}`;
}

/**
 * Opens a dining session at a physical table.
 * 
 * Rules:
 * 1. Table must exist, belong to tenant/outlet, and be active.
 * 2. Table cannot be in OCCUPIED, CLEANING, or OUT_OF_SERVICE state.
 * 3. Only ONE active session allowed per physical table (also enforced by DB partial unique index).
 * 4. Automatically transitions table status to OCCUPIED.
 */
export async function openTableSession(
  tenantId: string,
  outletId: string,
  input: OpenTableSessionInput,
  userId?: string
): Promise<RestaurantTableSession> {
  const db = getDb();

  // 1. Fetch table and verify ownership
  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tableId, input.tableId),
        eq(restaurantTables.tenantId, tenantId),
        eq(restaurantTables.outletId, outletId)
      )
    )
    .limit(1);

  if (!table) {
    throw new NotFoundError("Restaurant Table", `Table with ID '${input.tableId}' not found.`);
  }

  if (!table.isActive) {
    throw new BusinessRuleError(`Table ${table.tableNumber} is currently inactive.`);
  }

  // 2. Validate current table status
  if (table.status === "OCCUPIED") {
    throw new BusinessRuleError(`Table ${table.tableNumber} is already OCCUPIED.`);
  }

  if (table.status === "CLEANING") {
    throw new BusinessRuleError(`Table ${table.tableNumber} is currently CLEANING and must be marked AVAILABLE before seating.`);
  }

  if (table.status === "OUT_OF_SERVICE") {
    throw new BusinessRuleError(`Table ${table.tableNumber} is OUT_OF_SERVICE.`);
  }

  // 3. Verify no existing active session
  const [activeSession] = await db
    .select()
    .from(restaurantTableSessions)
    .where(
      and(
        eq(restaurantTableSessions.tableId, table.tableId),
        eq(restaurantTableSessions.status, "ACTIVE")
      )
    )
    .limit(1);

  if (activeSession) {
    throw new BusinessRuleError(
      `Table ${table.tableNumber} already has an active dining session (${activeSession.sessionNumber}).`
    );
  }

  // 4. Validate guest count
  const guestCount = input.guestCount ?? 1;
  if (guestCount < 1) {
    throw new ValidationError("Guest count must be at least 1.");
  }

  // 5. Check state machine transition
  assertTableStatusTransition(table.status as any, "OCCUPIED", table.tableNumber);

  // 6. Generate session number and insert session
  const isValidUuid = (val?: string): boolean =>
    typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  const sessionNumber = generateSessionNumber();
  const [session] = await db
    .insert(restaurantTableSessions)
    .values({
      tenantId,
      outletId,
      tableId: table.tableId,
      sessionNumber,
      status: "ACTIVE",
      guestCount,
      customerName: input.customerName?.trim() || null,
      customerPhone: input.customerPhone?.trim() || null,
      notes: input.notes?.trim() || null,
      openedByUserId: isValidUuid(userId) ? userId! : null,
    })
    .returning();

  // 7. Update table status to OCCUPIED
  await db
    .update(restaurantTables)
    .set({
      status: "OCCUPIED",
      updatedAt: new Date(),
    })
    .where(eq(restaurantTables.tableId, table.tableId));

  // Sync business context status
  await db
    .update(businessContexts)
    .set({
      status: "OCCUPIED",
      updatedAt: new Date(),
    })
    .where(eq(businessContexts.contextId, table.contextId));

  // 8. Audit event
  await recordAuditEvent({
    tenantId,
    userId,
    action: "restaurant.session.opened",
    resourceType: "restaurant_table_session",
    resourceId: session.sessionId,
    payload: {
      tableId: table.tableId,
      tableNumber: table.tableNumber,
      sessionNumber: session.sessionNumber,
      guestCount,
      customerName: session.customerName,
    },
  });

  // 9. Realtime broadcast
  await realtimeHub.broadcastToTenant(tenantId, "restaurant:table_updated", {
    tableId: table.tableId,
    tableNumber: table.tableNumber,
    status: "OCCUPIED",
    activeSession: {
      sessionId: session.sessionId,
      sessionNumber: session.sessionNumber,
      guestCount: session.guestCount,
      customerName: session.customerName,
      openedAt: session.openedAt,
    },
  });

  return session;
}

/**
 * Closes an active dining session.
 * 
 * Rules:
 * 1. Session must exist and be currently ACTIVE.
 * 2. Sets session status to COMPLETED and closedAt timestamp.
 * 3. Transitions table status to CLEANING (or AVAILABLE if requested).
 */
export async function closeTableSession(
  tenantId: string,
  outletId: string,
  sessionId: string,
  input?: CloseTableSessionInput,
  userId?: string
): Promise<RestaurantTableSession> {
  const db = getDb();

  // 1. Fetch session
  const [session] = await db
    .select()
    .from(restaurantTableSessions)
    .where(
      and(
        eq(restaurantTableSessions.sessionId, sessionId),
        eq(restaurantTableSessions.tenantId, tenantId),
        eq(restaurantTableSessions.outletId, outletId)
      )
    )
    .limit(1);

  if (!session) {
    throw new NotFoundError("Restaurant Table Session", `Session with ID '${sessionId}' not found.`);
  }

  if (session.status !== "ACTIVE") {
    throw new BusinessRuleError(
      `Session '${session.sessionNumber}' is already ${session.status} and cannot be closed again.`
    );
  }

  // 2. Fetch associated table
  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(eq(restaurantTables.tableId, session.tableId))
    .limit(1);

  if (!table) {
    throw new NotFoundError("Restaurant Table", `Associated table not found.`);
  }

  const nextStatus = input?.nextTableStatus || "CLEANING";
  assertTableStatusTransition(table.status as any, nextStatus, table.tableNumber);

  // 3. Mark session COMPLETED
  const now = new Date();
  const updatedNotes = input?.notes
    ? session.notes
      ? `${session.notes}\n${input.notes}`
      : input.notes
    : session.notes;

  const [closedSession] = await db
    .update(restaurantTableSessions)
    .set({
      status: "COMPLETED",
      closedAt: now,
      notes: updatedNotes,
      updatedAt: now,
    })
    .where(eq(restaurantTableSessions.sessionId, session.sessionId))
    .returning();

  // 4. Update table status
  await db
    .update(restaurantTables)
    .set({
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(restaurantTables.tableId, table.tableId));

  // Sync context status
  await db
    .update(businessContexts)
    .set({
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(businessContexts.contextId, table.contextId));

  // 5. Audit event
  await recordAuditEvent({
    tenantId,
    userId,
    action: "restaurant.session.closed",
    resourceType: "restaurant_table_session",
    resourceId: closedSession.sessionId,
    payload: {
      tableId: table.tableId,
      tableNumber: table.tableNumber,
      sessionNumber: closedSession.sessionNumber,
      closedAt: closedSession.closedAt,
      nextTableStatus: nextStatus,
    },
  });

  // 6. Realtime broadcast
  await realtimeHub.broadcastToTenant(tenantId, "restaurant:table_updated", {
    tableId: table.tableId,
    tableNumber: table.tableNumber,
    status: nextStatus,
    activeSession: null,
  });

  return closedSession;
}

/**
 * Retrieves the currently active session for a table (if any).
 */
export async function getActiveSessionForTable(
  tenantId: string,
  outletId: string,
  tableId: string
): Promise<RestaurantTableSession | null> {
  const db = getDb();

  const [session] = await db
    .select()
    .from(restaurantTableSessions)
    .where(
      and(
        eq(restaurantTableSessions.tableId, tableId),
        eq(restaurantTableSessions.tenantId, tenantId),
        eq(restaurantTableSessions.outletId, outletId),
        eq(restaurantTableSessions.status, "ACTIVE")
      )
    )
    .limit(1);

  return session || null;
}

/**
 * Lists table sessions for an outlet with optional filters.
 */
export async function listTableSessions(
  tenantId: string,
  outletId: string,
  filters?: {
    tableId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }
) {
  const db = getDb();

  const conditions = [
    eq(restaurantTableSessions.tenantId, tenantId),
    eq(restaurantTableSessions.outletId, outletId),
  ];

  if (filters?.tableId) {
    conditions.push(eq(restaurantTableSessions.tableId, filters.tableId));
  }
  if (filters?.status) {
    conditions.push(eq(restaurantTableSessions.status, filters.status));
  }

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;

  const rows = await db
    .select({
      session: restaurantTableSessions,
      tableNumber: restaurantTables.tableNumber,
      displayLabel: restaurantTables.displayLabel,
    })
    .from(restaurantTableSessions)
    .innerJoin(restaurantTables, eq(restaurantTableSessions.tableId, restaurantTables.tableId))
    .where(and(...conditions))
    .orderBy(desc(restaurantTableSessions.openedAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    ...r.session,
    tableNumber: r.tableNumber,
    displayLabel: r.displayLabel,
  }));
}
