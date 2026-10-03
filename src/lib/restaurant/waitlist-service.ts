import { eq, and, or, inArray, asc, desc, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  restaurantWaitlist,
  restaurantTables,
  restaurantSections,
  restaurantTableSessions,
  type RestaurantWaitlistItem,
  type RestaurantWaitlistStatus,
  RESTAURANT_WAITLIST_STATUSES,
} from "@/db/schema/restaurant";
import { customers } from "@/db/schema/core";
import { ValidationError, NotFoundError, BusinessRuleError, InvalidStateTransitionError } from "@/lib/api/errors";
import { recordAuditEvent } from "@/lib/audit";
import { createDomainEvent, recordOutboxEvent } from "@/lib/events/outbox";
import { DOMAIN_EVENT_TYPES } from "@/lib/events/types";
import { findOrCreateCustomer, isValidUuid } from "./reservation-service";

export interface AddToWaitlistInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  partySize: number;
  preferredSectionId?: string;
  estimatedWaitMinutes?: number;
  notes?: string;
}

export interface ListWaitlistFilters {
  status?: RestaurantWaitlistStatus | RestaurantWaitlistStatus[];
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Re-indexes queue positions for all active ('WAITING', 'CALLED') parties in an outlet
 */
async function reindexActiveQueue(tx: any, tenantId: string, outletId: string) {
  const activeEntries = await tx
    .select({ waitlistId: restaurantWaitlist.waitlistId })
    .from(restaurantWaitlist)
    .where(
      and(
        eq(restaurantWaitlist.tenantId, tenantId),
        eq(restaurantWaitlist.outletId, outletId),
        inArray(restaurantWaitlist.status, ["WAITING", "CALLED"])
      )
    )
    .orderBy(asc(restaurantWaitlist.createdAt));

  for (let i = 0; i < activeEntries.length; i++) {
    await tx
      .update(restaurantWaitlist)
      .set({ queuePosition: i + 1, updatedAt: new Date() })
      .where(eq(restaurantWaitlist.waitlistId, activeEntries[i].waitlistId));
  }
}

/**
 * List waitlist entries with filtering
 */
export async function listWaitlist(
  tenantId: string,
  outletId: string,
  filters: ListWaitlistFilters = {}
) {
  const db = getDb();
  const limit = Math.min(Math.max(1, filters.limit || 50), 100);
  const offset = Math.max(0, filters.offset || 0);

  const conditions = [
    eq(restaurantWaitlist.tenantId, tenantId),
    eq(restaurantWaitlist.outletId, outletId),
  ];

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      conditions.push(inArray(restaurantWaitlist.status, filters.status));
    } else {
      conditions.push(eq(restaurantWaitlist.status, filters.status));
    }
  }

  if (filters.search) {
    const s = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        sql`${restaurantWaitlist.customerName} ILIKE ${s}`,
        sql`${restaurantWaitlist.customerPhone} ILIKE ${s}`
      )!
    );
  }

  const rows = await db
    .select({
      waitlistId: restaurantWaitlist.waitlistId,
      tenantId: restaurantWaitlist.tenantId,
      outletId: restaurantWaitlist.outletId,
      customerId: restaurantWaitlist.customerId,
      customerName: restaurantWaitlist.customerName,
      customerPhone: restaurantWaitlist.customerPhone,
      partySize: restaurantWaitlist.partySize,
      preferredSectionId: restaurantWaitlist.preferredSectionId,
      preferredSectionName: restaurantSections.name,
      queuePosition: restaurantWaitlist.queuePosition,
      estimatedWaitMinutes: restaurantWaitlist.estimatedWaitMinutes,
      status: restaurantWaitlist.status,
      assignedTableId: restaurantWaitlist.assignedTableId,
      tableNumber: restaurantTables.tableNumber,
      seatedSessionId: restaurantWaitlist.seatedSessionId,
      notes: restaurantWaitlist.notes,
      calledAt: restaurantWaitlist.calledAt,
      seatedAt: restaurantWaitlist.seatedAt,
      cancelledAt: restaurantWaitlist.cancelledAt,
      createdAt: restaurantWaitlist.createdAt,
      updatedAt: restaurantWaitlist.updatedAt,
    })
    .from(restaurantWaitlist)
    .leftJoin(restaurantSections, eq(restaurantWaitlist.preferredSectionId, restaurantSections.sectionId))
    .leftJoin(restaurantTables, eq(restaurantWaitlist.assignedTableId, restaurantTables.tableId))
    .where(and(...conditions))
    .orderBy(
      sql`CASE WHEN ${restaurantWaitlist.status} IN ('WAITING', 'CALLED') THEN 0 ELSE 1 END`,
      asc(restaurantWaitlist.queuePosition),
      desc(restaurantWaitlist.createdAt)
    )
    .limit(limit)
    .offset(offset);

  return rows;
}

/**
 * Get single waitlist entry by ID
 */
export async function getWaitlistById(
  tenantId: string,
  outletId: string,
  waitlistId: string
) {
  const db = getDb();
  const [row] = await db
    .select({
      waitlistId: restaurantWaitlist.waitlistId,
      tenantId: restaurantWaitlist.tenantId,
      outletId: restaurantWaitlist.outletId,
      customerId: restaurantWaitlist.customerId,
      customerName: restaurantWaitlist.customerName,
      customerPhone: restaurantWaitlist.customerPhone,
      partySize: restaurantWaitlist.partySize,
      preferredSectionId: restaurantWaitlist.preferredSectionId,
      preferredSectionName: restaurantSections.name,
      queuePosition: restaurantWaitlist.queuePosition,
      estimatedWaitMinutes: restaurantWaitlist.estimatedWaitMinutes,
      status: restaurantWaitlist.status,
      assignedTableId: restaurantWaitlist.assignedTableId,
      tableNumber: restaurantTables.tableNumber,
      seatedSessionId: restaurantWaitlist.seatedSessionId,
      notes: restaurantWaitlist.notes,
      calledAt: restaurantWaitlist.calledAt,
      seatedAt: restaurantWaitlist.seatedAt,
      cancelledAt: restaurantWaitlist.cancelledAt,
      createdAt: restaurantWaitlist.createdAt,
      updatedAt: restaurantWaitlist.updatedAt,
    })
    .from(restaurantWaitlist)
    .leftJoin(restaurantSections, eq(restaurantWaitlist.preferredSectionId, restaurantSections.sectionId))
    .leftJoin(restaurantTables, eq(restaurantWaitlist.assignedTableId, restaurantTables.tableId))
    .where(
      and(
        eq(restaurantWaitlist.waitlistId, waitlistId),
        eq(restaurantWaitlist.tenantId, tenantId),
        eq(restaurantWaitlist.outletId, outletId)
      )
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Restaurant Waitlist", `Waitlist entry with ID '${waitlistId}' not found.`);
  }

  return row;
}

/**
 * Add a party to the restaurant walk-in waitlist
 */
export async function addToWaitlist(
  tenantId: string,
  outletId: string,
  input: AddToWaitlistInput,
  userId?: string
) {
  const db = getDb();

  // Validations
  if (!input.customerName || input.customerName.trim().length < 2) {
    throw new ValidationError("Customer name is required (minimum 2 characters).");
  }
  if (!input.customerPhone || input.customerPhone.trim().length < 7) {
    throw new ValidationError("Customer phone number is required (minimum 7 digits).");
  }
  if (!input.partySize || input.partySize < 1) {
    throw new ValidationError("Party size must be at least 1.");
  }

  // Connect to shared customer profile
  const customerId = await findOrCreateCustomer(
    tenantId,
    input.customerName,
    input.customerPhone,
    input.customerEmail
  );

  const created = await db.transaction(async (tx) => {
    // Determine authoritative queue position
    const [posRow] = await tx
      .select({
        maxPos: sql<number>`COALESCE(MAX(${restaurantWaitlist.queuePosition}), 0)`,
      })
      .from(restaurantWaitlist)
      .where(
        and(
          eq(restaurantWaitlist.tenantId, tenantId),
          eq(restaurantWaitlist.outletId, outletId),
          inArray(restaurantWaitlist.status, ["WAITING", "CALLED"])
        )
      );

    const queuePosition = (posRow?.maxPos || 0) + 1;
    const estWait = input.estimatedWaitMinutes || Math.max(10, queuePosition * 12);

    const [entry] = await tx
      .insert(restaurantWaitlist)
      .values({
        tenantId,
        outletId,
        customerId,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim(),
        partySize: input.partySize,
        preferredSectionId: input.preferredSectionId || null,
        queuePosition,
        estimatedWaitMinutes: estWait,
        status: "WAITING",
        notes: input.notes?.trim() || null,
      })
      .returning();

    return entry;
  });

  await recordAuditEvent({
    tenantId,
    userId: userId || "SYSTEM",
    action: "restaurant.waitlist.added",
    resourceType: "RESTAURANT_WAITLIST",
    resourceId: created.waitlistId,
    payload: {
      partySize: created.partySize,
      queuePosition: created.queuePosition,
      estimatedWaitMinutes: created.estimatedWaitMinutes,
    },
  });

  return getWaitlistById(tenantId, outletId, created.waitlistId);
}

/**
 * Update waitlist party status (CALLED, CANCELLED, EXPIRED)
 */
export async function updateWaitlistStatus(
  tenantId: string,
  outletId: string,
  waitlistId: string,
  newStatus: RestaurantWaitlistStatus,
  userId?: string
) {
  const db = getDb();
  const current = await getWaitlistById(tenantId, outletId, waitlistId);

  if (current.status === newStatus) {
    return current;
  }

  // Allowed transitions
  const ALLOWED: Record<RestaurantWaitlistStatus, RestaurantWaitlistStatus[]> = {
    WAITING: ["CALLED", "SEATED", "CANCELLED", "EXPIRED"],
    CALLED: ["SEATED", "CANCELLED", "EXPIRED"],
    SEATED: [],
    CANCELLED: [],
    EXPIRED: [],
  };

  const allowedTransitions = ALLOWED[current.status as RestaurantWaitlistStatus] || [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new InvalidStateTransitionError(
      `Cannot transition waitlist entry from '${current.status}' to '${newStatus}'.`
    );
  }

  await db.transaction(async (tx) => {
    const updateData: any = {
      status: newStatus,
      updatedAt: new Date(),
    };

    if (newStatus === "CALLED") {
      updateData.calledAt = new Date();

      const domainEvent = createDomainEvent({
        tenantId,
        outletId,
        vertical: "RESTAURANT",
        eventType: DOMAIN_EVENT_TYPES.RESTAURANT_WAITLIST_CALLED,
        aggregateType: "WAITLIST",
        aggregateId: waitlistId,
        payload: {
          waitlistId,
          tenantId,
          outletId,
          customerName: current.customerName,
          customerPhone: current.customerPhone,
          partySize: current.partySize,
        },
      });

      await recordOutboxEvent(tx, domainEvent);
    } else if (newStatus === "CANCELLED" || newStatus === "EXPIRED") {
      updateData.cancelledAt = new Date();
      updateData.queuePosition = 0; // Removed from active queue
    }

    await tx
      .update(restaurantWaitlist)
      .set(updateData)
      .where(eq(restaurantWaitlist.waitlistId, waitlistId));

    // Re-index remaining active queue if entry left the queue
    if (["CANCELLED", "EXPIRED"].includes(newStatus)) {
      await reindexActiveQueue(tx, tenantId, outletId);
    }
  });

  await recordAuditEvent({
    tenantId,
    userId: userId || "SYSTEM",
    action: `restaurant.waitlist.${newStatus.toLowerCase()}`,
    resourceType: "RESTAURANT_WAITLIST",
    resourceId: waitlistId,
    payload: { previousStatus: current.status, newStatus },
  });

  return getWaitlistById(tenantId, outletId, waitlistId);
}

/**
 * Seat a waitlist party at a table:
 * 1. Validates table is AVAILABLE and capacity is sufficient
 * 2. Creates active dining session
 * 3. Transitions table to OCCUPIED
 * 4. Marks waitlist entry as SEATED
 * 5. Re-indexes remaining active queue
 */
export async function seatWaitlistParty(
  tenantId: string,
  outletId: string,
  waitlistId: string,
  targetTableId: string,
  userId?: string
) {
  const db = getDb();
  const waitlist = await getWaitlistById(tenantId, outletId, waitlistId);

  if (waitlist.status === "SEATED") {
    throw new BusinessRuleError("Waitlist party has already been seated.");
  }
  if (["CANCELLED", "EXPIRED"].includes(waitlist.status)) {
    throw new BusinessRuleError(`Cannot seat a ${waitlist.status.toLowerCase()} waitlist party.`);
  }

  // Atomic database transaction with row locks
  const result = await db.transaction(async (tx) => {
    // 1. Lock table row
    const [table] = await tx
      .select()
      .from(restaurantTables)
      .where(
        and(
          eq(restaurantTables.tableId, targetTableId),
          eq(restaurantTables.tenantId, tenantId),
          eq(restaurantTables.outletId, outletId)
        )
      )
      .for("update");

    if (!table) {
      throw new NotFoundError("Restaurant Table", `Table with ID '${targetTableId}' not found.`);
    }

    if (!table.isActive || table.status === "OUT_OF_SERVICE") {
      throw new BusinessRuleError(`Table ${table.tableNumber} is inactive or out of service.`);
    }

    // 2. Check active session on table
    const [existingSession] = await tx
      .select({ sessionId: restaurantTableSessions.sessionId })
      .from(restaurantTableSessions)
      .where(
        and(
          eq(restaurantTableSessions.tableId, targetTableId),
          eq(restaurantTableSessions.tenantId, tenantId),
          eq(restaurantTableSessions.status, "ACTIVE")
        )
      )
      .limit(1);

    if (existingSession || table.status === "OCCUPIED") {
      throw new BusinessRuleError(
        `Table ${table.tableNumber} already has an active dining session. Please clear or select another table.`
      );
    }

    if (table.capacity < waitlist.partySize) {
      throw new BusinessRuleError(
        `Table ${table.tableNumber} capacity (${table.capacity}) is less than waitlist party size (${waitlist.partySize}).`
      );
    }

    // 3. Create active dining session
    const sessionNumber = `TS-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
    const [session] = await tx
      .insert(restaurantTableSessions)
      .values({
        tenantId,
        outletId,
        tableId: targetTableId,
        sessionNumber,
        status: "ACTIVE",
        guestCount: waitlist.partySize,
        customerName: waitlist.customerName,
        customerPhone: waitlist.customerPhone,
        openedByUserId: isValidUuid(userId) ? userId! : null,
        notes: waitlist.notes ? `Waitlist: ${waitlist.notes}` : "Seated from Walk-in Waitlist",
      })
      .returning();

    // 4. Update table status to OCCUPIED
    await tx
      .update(restaurantTables)
      .set({
        status: "OCCUPIED",
        updatedAt: new Date(),
      })
      .where(eq(restaurantTables.tableId, targetTableId));

    // 5. Update waitlist to SEATED
    await tx
      .update(restaurantWaitlist)
      .set({
        status: "SEATED",
        assignedTableId: targetTableId,
        seatedSessionId: session.sessionId,
        seatedAt: new Date(),
        queuePosition: 0,
        updatedAt: new Date(),
      })
      .where(eq(restaurantWaitlist.waitlistId, waitlistId));

    // 6. Re-index remaining active queue
    await reindexActiveQueue(tx, tenantId, outletId);

    return { session, table: { ...table, status: "OCCUPIED" as const } };
  });

  await recordAuditEvent({
    tenantId,
    userId: userId || "SYSTEM",
    action: "restaurant.waitlist.seated",
    resourceType: "RESTAURANT_WAITLIST",
    resourceId: waitlistId,
    payload: {
      tableId: targetTableId,
      tableNumber: result.table.tableNumber,
      sessionId: result.session.sessionId,
      sessionNumber: result.session.sessionNumber,
    },
  });

  return {
    waitlist: await getWaitlistById(tenantId, outletId, waitlistId),
    session: result.session,
    table: result.table,
  };
}
