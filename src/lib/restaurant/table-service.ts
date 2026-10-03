import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  restaurantTables,
  restaurantTableSessions,
  restaurantSections,
  type RestaurantTable,
  type RestaurantTableStatus,
  type RestaurantTableShape,
} from "@/db/schema/restaurant";
import { businessContexts, qrTokens } from "@/db/schema/context";
import { outlets } from "@/db/schema/core";
import { recordAuditEvent } from "@/lib/audit";
import { realtimeHub } from "@/lib/realtime/sse";
import { NotFoundError, BusinessRuleError, ValidationError } from "@/lib/api/errors";
import { assertTableStatusTransition, isValidTableStatus } from "./state-machine";
import { generateOrGetTableQr } from "./qr-service";

export interface CreateTableInput {
  tableNumber: string;
  displayLabel?: string;
  capacity?: number;
  section?: string;
  sectionId?: string | null;
  status?: RestaurantTableStatus;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  shape?: RestaurantTableShape;
  rotation?: number;
}

export interface UpdateTableInput {
  displayLabel?: string;
  capacity?: number;
  section?: string;
  sectionId?: string | null;
  isActive?: boolean;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  shape?: RestaurantTableShape;
  rotation?: number;
}

export interface UpdateTableLayoutInput {
  posX: number;
  posY: number;
  width?: number;
  height?: number;
  shape?: RestaurantTableShape;
  rotation?: number;
  sectionId?: string | null;
}

export interface BatchTableLayoutItem {
  tableId: string;
  posX: number;
  posY: number;
  width?: number;
  height?: number;
  shape?: RestaurantTableShape;
  rotation?: number;
  sectionId?: string | null;
}

export interface RestaurantOutletSummary {
  outletId: string;
  name: string;
  code: string;
  verticalType: string;
  timezone: string;
  currency: string;
  isActive: boolean;
  createdAt: Date;
}

export interface CreateRestaurantOutletInput {
  name: string;
  code: string;
  timezone?: string;
  currency?: string;
}

export interface TableSummaryMetrics {
  totalTables: number;
  availableTables: number;
  occupiedTables: number;
  reservedTables: number;
  cleaningTables: number;
  outOfServiceTables: number;
  totalCapacity: number;
  activeSessionsCount: number;
  occupancyRatePct: number;
  sectionBreakdown: Array<{
    section: string;
    total: number;
    available: number;
    occupied: number;
  }>;
}

/**
 * Lists all Restaurant Outlets for a tenant (verticalType = 'RESTAURANT').
 */
export async function listRestaurantOutlets(tenantId: string): Promise<RestaurantOutletSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      outletId: outlets.outletId,
      name: outlets.name,
      code: outlets.code,
      verticalType: outlets.verticalType,
      timezone: outlets.timezone,
      currency: outlets.currency,
      isActive: outlets.isActive,
      createdAt: outlets.createdAt,
    })
    .from(outlets)
    .where(and(eq(outlets.tenantId, tenantId), eq(outlets.verticalType, "RESTAURANT")))
    .orderBy(outlets.name);

  return rows;
}

/**
 * Creates a new Restaurant Outlet.
 */
export async function createRestaurantOutlet(
  tenantId: string,
  input: CreateRestaurantOutletInput,
  userId?: string
): Promise<RestaurantOutletSummary> {
  const db = getDb();

  const code = input.code.trim().toUpperCase();
  const existing = await db
    .select({ outletId: outlets.outletId })
    .from(outlets)
    .where(and(eq(outlets.tenantId, tenantId), eq(outlets.code, code)))
    .limit(1);

  if (existing.length > 0) {
    throw new BusinessRuleError(`Outlet with code '${code}' already exists.`);
  }

  const [created] = await db
    .insert(outlets)
    .values({
      tenantId,
      name: input.name.trim(),
      code,
      verticalType: "RESTAURANT",
      timezone: input.timezone || "Asia/Kolkata",
      currency: input.currency || "INR",
      isActive: true,
    })
    .returning();

  await recordAuditEvent({
    tenantId,
    userId,
    action: "restaurant.outlet.created",
    resourceType: "outlet",
    resourceId: created.outletId,
    payload: { name: created.name, code: created.code, verticalType: created.verticalType },
  });

  return created;
}

/**
 * Lists restaurant tables for an outlet with active session and QR info.
 */
export async function listTables(
  tenantId: string,
  outletId: string,
  filters?: {
    section?: string;
    sectionId?: string;
    status?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }
) {
  const db = getDb();

  const conditions = [
    eq(restaurantTables.tenantId, tenantId),
    eq(restaurantTables.outletId, outletId),
  ];

  if (filters?.sectionId) {
    conditions.push(eq(restaurantTables.sectionId, filters.sectionId));
  }
  if (filters?.section) {
    conditions.push(eq(restaurantTables.section, filters.section));
  }
  if (filters?.status) {
    conditions.push(eq(restaurantTables.status, filters.status));
  }
  if (filters?.isActive !== undefined) {
    conditions.push(eq(restaurantTables.isActive, filters.isActive));
  }

  const safeLimit = Math.min(Math.max(1, filters?.limit || 100), 200);
  const safeOffset = Math.max(0, filters?.offset || 0);

  const tables = await db
    .select()
    .from(restaurantTables)
    .where(and(...conditions))
    .orderBy(restaurantTables.section, restaurantTables.tableNumber)
    .limit(safeLimit)
    .offset(safeOffset);

  if (tables.length === 0) {
    return [];
  }

  const tableIds = tables.map((t) => t.tableId);
  const contextIds = tables.map((t) => t.contextId);

  // Fetch active sessions scoped strictly to these table IDs
  const activeSessions = await db
    .select()
    .from(restaurantTableSessions)
    .where(
      and(
        eq(restaurantTableSessions.tenantId, tenantId),
        eq(restaurantTableSessions.outletId, outletId),
        inArray(restaurantTableSessions.tableId, tableIds),
        eq(restaurantTableSessions.status, "ACTIVE")
      )
    );

  const sessionMap = new Map(activeSessions.map((s) => [s.tableId, s]));

  // Fetch active QR tokens scoped strictly to these context IDs
  const activeTokens = await db
    .select({
      contextId: qrTokens.contextId,
      tokenId: qrTokens.tokenId,
      opaqueToken: qrTokens.opaqueToken,
      tokenStatus: qrTokens.tokenStatus,
    })
    .from(qrTokens)
    .where(
      and(
        eq(qrTokens.tenantId, tenantId),
        eq(qrTokens.outletId, outletId),
        inArray(qrTokens.contextId, contextIds),
        eq(qrTokens.tokenStatus, "ACTIVE")
      )
    );

  const tokenMap = new Map(activeTokens.map((t) => [t.contextId, t]));

  return tables.map((t) => {
    const session = sessionMap.get(t.tableId);
    const token = tokenMap.get(t.contextId);

    return {
      ...t,
      activeSession: session
        ? {
            sessionId: session.sessionId,
            sessionNumber: session.sessionNumber,
            guestCount: session.guestCount,
            customerName: session.customerName,
            customerPhone: session.customerPhone,
            openedAt: session.openedAt,
            notes: session.notes,
          }
        : null,
      hasActiveQr: !!token,
      qrTokenId: token?.tokenId || null,
      qrOpaqueToken: token?.opaqueToken || null,
    };
  });
}

/**
 * Retrieves a single restaurant table by ID.
 */
export async function getTableById(
  tenantId: string,
  outletId: string,
  tableId: string
) {
  const db = getDb();

  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tableId, tableId),
        eq(restaurantTables.tenantId, tenantId),
        eq(restaurantTables.outletId, outletId)
      )
    )
    .limit(1);

  if (!table) {
    throw new NotFoundError("Restaurant Table", `Table with ID '${tableId}' not found.`);
  }

  // Active session
  const [activeSession] = await db
    .select()
    .from(restaurantTableSessions)
    .where(
      and(
        eq(restaurantTableSessions.tableId, tableId),
        eq(restaurantTableSessions.status, "ACTIVE")
      )
    )
    .limit(1);

  // Active QR
  const [activeToken] = await db
    .select()
    .from(qrTokens)
    .where(
      and(
        eq(qrTokens.contextId, table.contextId),
        eq(qrTokens.tenantId, tenantId),
        eq(qrTokens.tokenStatus, "ACTIVE")
      )
    )
    .orderBy(desc(qrTokens.createdAt))
    .limit(1);

  return {
    ...table,
    activeSession: activeSession || null,
    hasActiveQr: !!activeToken,
    qrTokenId: activeToken?.tokenId || null,
    qrOpaqueToken: activeToken?.opaqueToken || null,
  };
}

/**
 * Creates a physical restaurant table.
 * Generates canonical BusinessContext, inserts table, and provisions initial active QR.
 */
export async function createTable(
  tenantId: string,
  outletId: string,
  input: CreateTableInput,
  userId?: string
) {
  const db = getDb();

  const tableNumber = input.tableNumber.trim();
  if (!tableNumber) {
    throw new ValidationError("Table number is required.");
  }

  // 1. Verify uniqueness within outlet
  const existing = await db
    .select({ tableId: restaurantTables.tableId })
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.outletId, outletId),
        eq(restaurantTables.tableNumber, tableNumber)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    throw new BusinessRuleError(`Table '${tableNumber}' already exists in this restaurant.`);
  }

  const capacity = input.capacity ?? 4;
  if (capacity < 1) {
    throw new ValidationError("Table capacity must be at least 1.");
  }

  let section = input.section?.trim() || "Main Dining";
  let sectionId = input.sectionId || null;

  if (sectionId) {
    const [sec] = await db
      .select()
      .from(restaurantSections)
      .where(
        and(
          eq(restaurantSections.sectionId, sectionId),
          eq(restaurantSections.tenantId, tenantId),
          eq(restaurantSections.outletId, outletId)
        )
      )
      .limit(1);
    if (sec) {
      section = sec.name;
    }
  } else if (input.section) {
    const [sec] = await db
      .select()
      .from(restaurantSections)
      .where(
        and(
          eq(restaurantSections.name, section),
          eq(restaurantSections.tenantId, tenantId),
          eq(restaurantSections.outletId, outletId)
        )
      )
      .limit(1);
    if (sec) {
      sectionId = sec.sectionId;
    }
  }

  const displayLabel = input.displayLabel?.trim() || `Table ${tableNumber}`;
  const initialStatus = input.status || "AVAILABLE";

  if (!isValidTableStatus(initialStatus)) {
    throw new ValidationError(`Invalid initial table status: '${initialStatus}'.`);
  }

  const posX = input.posX !== undefined ? Math.max(0, Math.round(input.posX)) : 0;
  const posY = input.posY !== undefined ? Math.max(0, Math.round(input.posY)) : 0;
  const width = input.width !== undefined ? Math.max(40, Math.min(400, Math.round(input.width))) : 90;
  const height = input.height !== undefined ? Math.max(40, Math.min(400, Math.round(input.height))) : 90;
  const shape = input.shape || "RECTANGLE";
  const rotation = input.rotation !== undefined ? ((input.rotation % 360) + 360) % 360 : 0;

  // 2. Create canonical Business Context record
  const [context] = await db
    .insert(businessContexts)
    .values({
      tenantId,
      outletId,
      contextType: "TABLE",
      identifier: tableNumber,
      displayLabel,
      status: initialStatus,
      metadata: { section, sectionId, capacity, posX, posY, shape },
      isActive: true,
    })
    .returning();

  // 3. Create Restaurant Table record
  const [table] = await db
    .insert(restaurantTables)
    .values({
      tenantId,
      outletId,
      contextId: context.contextId,
      sectionId,
      tableNumber,
      displayLabel,
      capacity,
      section,
      status: initialStatus,
      posX,
      posY,
      width,
      height,
      shape,
      rotation,
      isActive: true,
    })
    .returning();

  // 4. Provision initial active QR token
  const qr = await generateOrGetTableQr(tenantId, outletId, table.tableId, userId);

  // 5. Audit event
  await recordAuditEvent({
    tenantId,
    userId,
    action: "restaurant.table.created",
    resourceType: "restaurant_table",
    resourceId: table.tableId,
    payload: {
      tableNumber: table.tableNumber,
      displayLabel: table.displayLabel,
      capacity: table.capacity,
      section: table.section,
      sectionId: table.sectionId,
      status: table.status,
      posX: table.posX,
      posY: table.posY,
      shape: table.shape,
      contextId: context.contextId,
    },
  });

  // 6. Realtime broadcast
  await realtimeHub.broadcastToTenant(tenantId, "restaurant:table_created", {
    tableId: table.tableId,
    tableNumber: table.tableNumber,
    displayLabel: table.displayLabel,
    status: table.status,
    section: table.section,
    sectionId: table.sectionId,
    capacity: table.capacity,
    posX: table.posX,
    posY: table.posY,
    width: table.width,
    height: table.height,
    shape: table.shape,
    rotation: table.rotation,
  });

  return {
    ...table,
    activeSession: null,
    hasActiveQr: true,
    qrTokenId: qr.tokenId,
    qrOpaqueToken: qr.opaqueToken,
    qrSvgDataUri: qr.qrSvgDataUri,
  };
}

/**
 * Updates physical table properties (display label, capacity, section, isActive, layout).
 */
export async function updateTable(
  tenantId: string,
  outletId: string,
  tableId: string,
  input: UpdateTableInput,
  userId?: string
) {
  const db = getDb();

  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tableId, tableId),
        eq(restaurantTables.tenantId, tenantId),
        eq(restaurantTables.outletId, outletId)
      )
    )
    .limit(1);

  if (!table) {
    throw new NotFoundError("Restaurant Table", `Table with ID '${tableId}' not found.`);
  }

  const updates: Partial<typeof restaurantTables.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.displayLabel !== undefined) {
    const label = input.displayLabel.trim();
    if (!label) throw new ValidationError("Display label cannot be empty.");
    updates.displayLabel = label;
  }

  if (input.capacity !== undefined) {
    if (input.capacity < 1) throw new ValidationError("Capacity must be at least 1.");
    updates.capacity = input.capacity;
  }

  if (input.sectionId !== undefined) {
    if (input.sectionId) {
      const [sec] = await db
        .select()
        .from(restaurantSections)
        .where(
          and(
            eq(restaurantSections.sectionId, input.sectionId),
            eq(restaurantSections.tenantId, tenantId),
            eq(restaurantSections.outletId, outletId)
          )
        )
        .limit(1);
      if (!sec) {
        throw new NotFoundError("Restaurant Section", `Section with ID '${input.sectionId}' not found.`);
      }
      updates.sectionId = sec.sectionId;
      updates.section = sec.name;
    } else {
      updates.sectionId = null;
    }
  } else if (input.section !== undefined) {
    const secName = input.section.trim();
    if (!secName) throw new ValidationError("Section cannot be empty.");
    updates.section = secName;
    const [sec] = await db
      .select()
      .from(restaurantSections)
      .where(
        and(
          eq(restaurantSections.name, secName),
          eq(restaurantSections.tenantId, tenantId),
          eq(restaurantSections.outletId, outletId)
        )
      )
      .limit(1);
    if (sec) {
      updates.sectionId = sec.sectionId;
    }
  }

  if (input.posX !== undefined) updates.posX = Math.max(0, Math.round(input.posX));
  if (input.posY !== undefined) updates.posY = Math.max(0, Math.round(input.posY));
  if (input.width !== undefined) updates.width = Math.max(40, Math.min(400, Math.round(input.width)));
  if (input.height !== undefined) updates.height = Math.max(40, Math.min(400, Math.round(input.height)));
  if (input.shape !== undefined) {
    if (!["RECTANGLE", "ROUND", "SQUARE"].includes(input.shape)) {
      throw new ValidationError(`Invalid table shape '${input.shape}'.`);
    }
    updates.shape = input.shape;
  }
  if (input.rotation !== undefined) updates.rotation = ((input.rotation % 360) + 360) % 360;

  if (input.isActive !== undefined) {
    updates.isActive = input.isActive;
  }

  const [updated] = await db
    .update(restaurantTables)
    .set(updates)
    .where(eq(restaurantTables.tableId, tableId))
    .returning();

  // Sync context display label or metadata if changed
  if (updates.displayLabel || updates.section || updates.capacity || updates.posX !== undefined || updates.posY !== undefined) {
    await db
      .update(businessContexts)
      .set({
        displayLabel: updated.displayLabel,
        metadata: {
          section: updated.section,
          sectionId: updated.sectionId,
          capacity: updated.capacity,
          posX: updated.posX,
          posY: updated.posY,
          shape: updated.shape,
        },
        isActive: updated.isActive,
        updatedAt: new Date(),
      })
      .where(eq(businessContexts.contextId, updated.contextId));
  }

  // Audit event
  const isStatusToggle = input.isActive !== undefined && input.isActive !== table.isActive;
  await recordAuditEvent({
    tenantId,
    userId,
    action: isStatusToggle
      ? input.isActive
        ? "restaurant.table.activated"
        : "restaurant.table.deactivated"
      : "restaurant.table.updated",
    resourceType: "restaurant_table",
    resourceId: updated.tableId,
    payload: {
      tableNumber: updated.tableNumber,
      changes: updates,
    },
  });

  // Realtime broadcast
  await realtimeHub.broadcastToTenant(tenantId, "restaurant:table_updated", {
    tableId: updated.tableId,
    tableNumber: updated.tableNumber,
    displayLabel: updated.displayLabel,
    capacity: updated.capacity,
    section: updated.section,
    sectionId: updated.sectionId,
    posX: updated.posX,
    posY: updated.posY,
    width: updated.width,
    height: updated.height,
    shape: updated.shape,
    rotation: updated.rotation,
    isActive: updated.isActive,
    status: updated.status,
  });

  return updated;
}

/**
 * Updates spatial layout metadata for a table (coordinates, dimensions, shape, section).
 * GUARANTEE: Does NOT regenerate QR token, alter active session, or mutate orders.
 */
export async function updateTableLayout(
  tenantId: string,
  outletId: string,
  tableId: string,
  input: UpdateTableLayoutInput,
  userId?: string
) {
  const db = getDb();

  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tableId, tableId),
        eq(restaurantTables.tenantId, tenantId),
        eq(restaurantTables.outletId, outletId)
      )
    )
    .limit(1);

  if (!table) {
    throw new NotFoundError("Restaurant Table", `Table with ID '${tableId}' not found.`);
  }

  const updates: Partial<typeof restaurantTables.$inferInsert> = {
    posX: Math.max(0, Math.round(input.posX)),
    posY: Math.max(0, Math.round(input.posY)),
    updatedAt: new Date(),
  };

  if (input.width !== undefined) {
    updates.width = Math.max(40, Math.min(400, Math.round(input.width)));
  }
  if (input.height !== undefined) {
    updates.height = Math.max(40, Math.min(400, Math.round(input.height)));
  }
  if (input.shape !== undefined) {
    if (!["RECTANGLE", "ROUND", "SQUARE"].includes(input.shape)) {
      throw new ValidationError(`Invalid table shape '${input.shape}'.`);
    }
    updates.shape = input.shape;
  }
  if (input.rotation !== undefined) {
    updates.rotation = ((input.rotation % 360) + 360) % 360;
  }

  if (input.sectionId !== undefined) {
    if (input.sectionId) {
      const [sec] = await db
        .select()
        .from(restaurantSections)
        .where(
          and(
            eq(restaurantSections.sectionId, input.sectionId),
            eq(restaurantSections.tenantId, tenantId),
            eq(restaurantSections.outletId, outletId)
          )
        )
        .limit(1);
      if (!sec) {
        throw new NotFoundError("Restaurant Section", `Section '${input.sectionId}' not found.`);
      }
      updates.sectionId = sec.sectionId;
      updates.section = sec.name;
    } else {
      updates.sectionId = null;
    }
  }

  const [updated] = await db
    .update(restaurantTables)
    .set(updates)
    .where(eq(restaurantTables.tableId, tableId))
    .returning();

  await recordAuditEvent({
    tenantId,
    userId,
    action: "restaurant.table.layout_updated",
    resourceType: "restaurant_table",
    resourceId: updated.tableId,
    payload: {
      tableNumber: updated.tableNumber,
      posX: updated.posX,
      posY: updated.posY,
      width: updated.width,
      height: updated.height,
      shape: updated.shape,
      rotation: updated.rotation,
      sectionId: updated.sectionId,
    },
  });

  await realtimeHub.broadcastToTenant(tenantId, "restaurant:table_layout_updated", {
    tableId: updated.tableId,
    posX: updated.posX,
    posY: updated.posY,
    width: updated.width,
    height: updated.height,
    shape: updated.shape,
    rotation: updated.rotation,
    sectionId: updated.sectionId,
  });

  return updated;
}

/**
 * Batch updates spatial layout metadata for multiple tables on the floor plan.
 * GUARANTEE: Does NOT regenerate QR tokens, alter active sessions, or mutate orders.
 */
export async function batchUpdateTableLayout(
  tenantId: string,
  outletId: string,
  items: BatchTableLayoutItem[],
  userId?: string
) {
  const db = getDb();
  if (!items || items.length === 0) {
    return [];
  }

  const results: RestaurantTable[] = [];
  await db.transaction(async (tx) => {
    for (const item of items) {
      const [table] = await tx
        .select()
        .from(restaurantTables)
        .where(
          and(
            eq(restaurantTables.tableId, item.tableId),
            eq(restaurantTables.tenantId, tenantId),
            eq(restaurantTables.outletId, outletId)
          )
        )
        .limit(1);

      if (!table) continue;

      const updates: Partial<typeof restaurantTables.$inferInsert> = {
        posX: Math.max(0, Math.round(item.posX)),
        posY: Math.max(0, Math.round(item.posY)),
        updatedAt: new Date(),
      };

      if (item.width !== undefined) updates.width = Math.max(40, Math.min(400, Math.round(item.width)));
      if (item.height !== undefined) updates.height = Math.max(40, Math.min(400, Math.round(item.height)));
      if (item.shape !== undefined && ["RECTANGLE", "ROUND", "SQUARE"].includes(item.shape)) {
        updates.shape = item.shape;
      }
      if (item.rotation !== undefined) updates.rotation = ((item.rotation % 360) + 360) % 360;
      if (item.sectionId !== undefined) updates.sectionId = item.sectionId;

      const [updated] = await tx
        .update(restaurantTables)
        .set(updates)
        .where(eq(restaurantTables.tableId, item.tableId))
        .returning();

      results.push(updated);
    }
  });

  await recordAuditEvent({
    tenantId,
    userId,
    action: "restaurant.tables.batch_layout_updated",
    resourceType: "restaurant_table",
    payload: {
      count: results.length,
      tableIds: results.map((r) => r.tableId),
    },
  });

  await realtimeHub.broadcastToTenant(tenantId, "restaurant:tables_batch_layout_updated", {
    tables: results.map((r) => ({
      tableId: r.tableId,
      posX: r.posX,
      posY: r.posY,
      width: r.width,
      height: r.height,
      shape: r.shape,
      rotation: r.rotation,
      sectionId: r.sectionId,
    })),
  });

  return results;
}

/**
 * Changes table status through authorized state machine transition.
 */
export async function updateTableStatus(
  tenantId: string,
  outletId: string,
  tableId: string,
  nextStatus: RestaurantTableStatus,
  reason?: string,
  userId?: string
) {
  const db = getDb();

  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tableId, tableId),
        eq(restaurantTables.tenantId, tenantId),
        eq(restaurantTables.outletId, outletId)
      )
    )
    .limit(1);

  if (!table) {
    throw new NotFoundError("Restaurant Table", `Table with ID '${tableId}' not found.`);
  }

  if (!table.isActive) {
    throw new BusinessRuleError(`Cannot change status of inactive Table ${table.tableNumber}.`);
  }

  // Assert valid transition
  assertTableStatusTransition(table.status as RestaurantTableStatus, nextStatus, table.tableNumber);

  // If table is transitioning away from OCCUPIED to CLEANING/AVAILABLE, check active session
  let closedSessionId: string | null = null;
  if (table.status === "OCCUPIED" && (nextStatus === "CLEANING" || nextStatus === "AVAILABLE")) {
    const [activeSession] = await db
      .select()
      .from(restaurantTableSessions)
      .where(
        and(
          eq(restaurantTableSessions.tableId, tableId),
          eq(restaurantTableSessions.status, "ACTIVE")
        )
      )
      .limit(1);

    if (activeSession) {
      const now = new Date();
      await db
        .update(restaurantTableSessions)
        .set({
          status: "COMPLETED",
          closedAt: now,
          notes: reason ? `${activeSession.notes ? activeSession.notes + "\n" : ""}Closed by table status change: ${reason}` : activeSession.notes,
          updatedAt: now,
        })
        .where(eq(restaurantTableSessions.sessionId, activeSession.sessionId));

      closedSessionId = activeSession.sessionId;
    }
  }

  const now = new Date();
  const [updated] = await db
    .update(restaurantTables)
    .set({
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(restaurantTables.tableId, tableId))
    .returning();

  // Sync business context status
  await db
    .update(businessContexts)
    .set({
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(businessContexts.contextId, updated.contextId));

  // Audit event
  await recordAuditEvent({
    tenantId,
    userId,
    action: "restaurant.table.status_changed",
    resourceType: "restaurant_table",
    resourceId: updated.tableId,
    payload: {
      tableNumber: updated.tableNumber,
      fromStatus: table.status,
      toStatus: nextStatus,
      reason: reason || null,
      closedSessionId,
    },
  });

  // Realtime broadcast
  await realtimeHub.broadcastToTenant(tenantId, "restaurant:table_updated", {
    tableId: updated.tableId,
    tableNumber: updated.tableNumber,
    status: updated.status,
    activeSession: null,
  });

  return updated;
}

/**
 * Computes Restaurant operations overview metrics for the operations dashboard.
 */
export async function getTableSummaryMetrics(
  tenantId: string,
  outletId: string
): Promise<TableSummaryMetrics> {
  const db = getDb();

  // 1. Single database-side aggregation for table operational counts
  const [aggregates] = await db
    .select({
      totalTables: sql<number>`count(*)::int`,
      availableTables: sql<number>`count(*) filter (where ${restaurantTables.status} = 'AVAILABLE')::int`,
      occupiedTables: sql<number>`count(*) filter (where ${restaurantTables.status} = 'OCCUPIED')::int`,
      reservedTables: sql<number>`count(*) filter (where ${restaurantTables.status} = 'RESERVED')::int`,
      cleaningTables: sql<number>`count(*) filter (where ${restaurantTables.status} = 'CLEANING')::int`,
      outOfServiceTables: sql<number>`count(*) filter (where ${restaurantTables.status} = 'OUT_OF_SERVICE')::int`,
      totalCapacity: sql<number>`coalesce(sum(${restaurantTables.capacity}), 0)::int`,
    })
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tenantId, tenantId),
        eq(restaurantTables.outletId, outletId),
        eq(restaurantTables.isActive, true)
      )
    );

  const totalTables = aggregates?.totalTables ?? 0;
  const availableTables = aggregates?.availableTables ?? 0;
  const occupiedTables = aggregates?.occupiedTables ?? 0;
  const reservedTables = aggregates?.reservedTables ?? 0;
  const cleaningTables = aggregates?.cleaningTables ?? 0;
  const outOfServiceTables = aggregates?.outOfServiceTables ?? 0;
  const totalCapacity = aggregates?.totalCapacity ?? 0;

  // 2. Section breakdown via SQL group by
  const sectionRows = await db
    .select({
      section: restaurantTables.section,
      total: sql<number>`count(*)::int`,
      available: sql<number>`count(*) filter (where ${restaurantTables.status} = 'AVAILABLE')::int`,
      occupied: sql<number>`count(*) filter (where ${restaurantTables.status} = 'OCCUPIED')::int`,
    })
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tenantId, tenantId),
        eq(restaurantTables.outletId, outletId),
        eq(restaurantTables.isActive, true)
      )
    )
    .groupBy(restaurantTables.section)
    .orderBy(restaurantTables.section);

  // 3. Active dining sessions count
  const [sessionCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(restaurantTableSessions)
    .where(
      and(
        eq(restaurantTableSessions.tenantId, tenantId),
        eq(restaurantTableSessions.outletId, outletId),
        eq(restaurantTableSessions.status, "ACTIVE")
      )
    );

  const activeSessionsCount = sessionCount?.count ?? 0;
  const occupancyRatePct = totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0;

  return {
    totalTables,
    availableTables,
    occupiedTables,
    reservedTables,
    cleaningTables,
    outOfServiceTables,
    totalCapacity,
    activeSessionsCount,
    occupancyRatePct,
    sectionBreakdown: sectionRows,
  };
}
