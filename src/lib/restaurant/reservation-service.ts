import { eq, and, or, inArray, gte, lte, desc, asc, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  restaurantReservations,
  restaurantTables,
  restaurantSections,
  restaurantTableSessions,
  type RestaurantReservation,
  type RestaurantReservationStatus,
  type RestaurantReservationSource,
  RESTAURANT_RESERVATION_STATUSES,
} from "@/db/schema/restaurant";
import { customers } from "@/db/schema/core";
import { ValidationError, NotFoundError, BusinessRuleError, InvalidStateTransitionError } from "@/lib/api/errors";
import { recordAuditEvent } from "@/lib/audit";
import { createDomainEvent, recordOutboxEvent } from "@/lib/events/outbox";
import { DOMAIN_EVENT_TYPES } from "@/lib/events/types";

export interface CreateReservationInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  partySize: number;
  reservationDate: string; // YYYY-MM-DD
  reservationTime: string; // HH:MM
  durationMinutes?: number;
  assignedTableId?: string;
  sectionId?: string;
  notes?: string;
  source?: RestaurantReservationSource;
}

export interface UpdateReservationInput {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  partySize?: number;
  reservationDate?: string;
  reservationTime?: string;
  durationMinutes?: number;
  assignedTableId?: string | null;
  sectionId?: string | null;
  notes?: string;
}

export interface ListReservationsFilters {
  date?: string;
  startDate?: string;
  endDate?: string;
  status?: RestaurantReservationStatus | RestaurantReservationStatus[];
  assignedTableId?: string;
  sectionId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// Convert "HH:MM" to minutes from 00:00
export function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":");
  if (parts.length !== 2) return 0;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

// Check time overlap between two intervals [start1, end1] and [start2, end2]
export function isTimeOverlapping(
  start1: number,
  duration1: number,
  start2: number,
  duration2: number
): boolean {
  const end1 = start1 + duration1;
  const end2 = start2 + duration2;
  return Math.max(start1, start2) < Math.min(end1, end2);
}

export const isValidUuid = (val?: string | null): boolean =>
  !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

/**
 * Finds existing customer by phone or creates a new customer profile atomically
 */
export async function findOrCreateCustomer(
  tenantId: string,
  fullName: string,
  phone: string,
  email?: string
): Promise<string> {
  const db = getDb();
  const trimmedPhone = phone.trim();
  const trimmedEmail = email ? email.trim().toLowerCase() : undefined;

  // 1. Search existing by phone
  const [existingByPhone] = await db
    .select({ customerId: customers.customerId })
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.phone, trimmedPhone)))
    .limit(1);

  if (existingByPhone) {
    return existingByPhone.customerId;
  }

  // 2. Search existing by email if provided
  if (trimmedEmail) {
    const [existingByEmail] = await db
      .select({ customerId: customers.customerId })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.email, trimmedEmail)))
      .limit(1);

    if (existingByEmail) {
      return existingByEmail.customerId;
    }
  }

  // 3. Create new customer
  const [newCustomer] = await db
    .insert(customers)
    .values({
      tenantId,
      fullName: fullName.trim(),
      phone: trimmedPhone,
      email: trimmedEmail || null,
    })
    .returning({ customerId: customers.customerId });

  return newCustomer.customerId;
}

/**
 * Check table availability for a specific reservation date, time, and party size
 */
export async function checkTableAvailability(
  tenantId: string,
  outletId: string,
  date: string,
  time: string,
  durationMinutes: number = 90,
  partySize: number = 2,
  excludeReservationId?: string
) {
  const db = getDb();
  const reqStart = parseTimeToMinutes(time);

  // 1. Fetch all active tables for this outlet
  const allTables = await db
    .select({
      tableId: restaurantTables.tableId,
      tableNumber: restaurantTables.tableNumber,
      displayLabel: restaurantTables.displayLabel,
      capacity: restaurantTables.capacity,
      section: restaurantTables.section,
      sectionId: restaurantTables.sectionId,
      status: restaurantTables.status,
      isActive: restaurantTables.isActive,
    })
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tenantId, tenantId),
        eq(restaurantTables.outletId, outletId),
        eq(restaurantTables.isActive, true)
      )
    )
    .orderBy(asc(restaurantTables.tableNumber));

  // 2. Fetch all active/confirmed reservations for this date
  const activeReservationConditions = [
    eq(restaurantReservations.tenantId, tenantId),
    eq(restaurantReservations.outletId, outletId),
    eq(restaurantReservations.reservationDate, date),
    inArray(restaurantReservations.status, ["PENDING", "CONFIRMED", "SEATED"]),
  ];

  if (excludeReservationId) {
    activeReservationConditions.push(sql`${restaurantReservations.reservationId} != ${excludeReservationId}::uuid`);
  }

  const existingReservations = await db
    .select({
      reservationId: restaurantReservations.reservationId,
      assignedTableId: restaurantReservations.assignedTableId,
      reservationTime: restaurantReservations.reservationTime,
      durationMinutes: restaurantReservations.durationMinutes,
      status: restaurantReservations.status,
    })
    .from(restaurantReservations)
    .where(and(...activeReservationConditions));

  // 3. Evaluate availability per table
  return allTables.map((t) => {
    let isAvailable = true;
    let conflictReason: string | undefined;

    if (t.status === "OUT_OF_SERVICE") {
      isAvailable = false;
      conflictReason = "Table is currently marked out of service.";
    } else if (t.capacity < partySize) {
      isAvailable = false;
      conflictReason = `Table capacity (${t.capacity}) is less than required party size (${partySize}).`;
    } else {
      // Check for reservation overlap
      const conflicts = existingReservations.filter((r) => {
        if (!r.assignedTableId || r.assignedTableId !== t.tableId) return false;
        const resStart = parseTimeToMinutes(r.reservationTime);
        return isTimeOverlapping(reqStart, durationMinutes, resStart, r.durationMinutes);
      });

      if (conflicts.length > 0) {
        isAvailable = false;
        conflictReason = "Table is already reserved for an overlapping time slot.";
      }
    }

    return {
      tableId: t.tableId,
      tableNumber: t.tableNumber,
      displayLabel: t.displayLabel,
      capacity: t.capacity,
      section: t.section,
      sectionId: t.sectionId,
      isAvailable,
      conflictReason,
    };
  });
}

/**
 * List reservations with comprehensive filters
 */
export async function listReservations(
  tenantId: string,
  outletId: string,
  filters: ListReservationsFilters = {}
) {
  const db = getDb();
  const limit = Math.min(Math.max(1, filters.limit || 50), 100);
  const offset = Math.max(0, filters.offset || 0);

  const conditions = [
    eq(restaurantReservations.tenantId, tenantId),
    eq(restaurantReservations.outletId, outletId),
  ];

  if (filters.date) {
    conditions.push(eq(restaurantReservations.reservationDate, filters.date));
  }
  if (filters.startDate) {
    conditions.push(gte(restaurantReservations.reservationDate, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(restaurantReservations.reservationDate, filters.endDate));
  }

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      conditions.push(inArray(restaurantReservations.status, filters.status));
    } else {
      conditions.push(eq(restaurantReservations.status, filters.status));
    }
  }

  if (filters.assignedTableId) {
    conditions.push(eq(restaurantReservations.assignedTableId, filters.assignedTableId));
  }
  if (filters.sectionId) {
    conditions.push(eq(restaurantReservations.sectionId, filters.sectionId));
  }

  if (filters.search) {
    const s = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        sql`${restaurantReservations.customerName} ILIKE ${s}`,
        sql`${restaurantReservations.customerPhone} ILIKE ${s}`
      )!
    );
  }

  const rows = await db
    .select({
      reservationId: restaurantReservations.reservationId,
      tenantId: restaurantReservations.tenantId,
      outletId: restaurantReservations.outletId,
      customerId: restaurantReservations.customerId,
      customerName: restaurantReservations.customerName,
      customerPhone: restaurantReservations.customerPhone,
      customerEmail: restaurantReservations.customerEmail,
      partySize: restaurantReservations.partySize,
      reservationDate: restaurantReservations.reservationDate,
      reservationTime: restaurantReservations.reservationTime,
      durationMinutes: restaurantReservations.durationMinutes,
      status: restaurantReservations.status,
      assignedTableId: restaurantReservations.assignedTableId,
      tableNumber: restaurantTables.tableNumber,
      tableDisplayLabel: restaurantTables.displayLabel,
      sectionId: restaurantReservations.sectionId,
      sectionName: restaurantSections.name,
      notes: restaurantReservations.notes,
      specialRequests: restaurantReservations.notes,
      source: restaurantReservations.source,
      seatedSessionId: restaurantReservations.seatedSessionId,
      createdAt: restaurantReservations.createdAt,
      updatedAt: restaurantReservations.updatedAt,
    })
    .from(restaurantReservations)
    .leftJoin(restaurantTables, eq(restaurantReservations.assignedTableId, restaurantTables.tableId))
    .leftJoin(restaurantSections, eq(restaurantReservations.sectionId, restaurantSections.sectionId))
    .where(and(...conditions))
    .orderBy(asc(restaurantReservations.reservationDate), asc(restaurantReservations.reservationTime))
    .limit(limit)
    .offset(offset);

  return rows;
}

/**
 * Get single reservation by ID
 */
export async function getReservationById(
  tenantId: string,
  outletId: string,
  reservationId: string
) {
  const db = getDb();
  const [row] = await db
    .select({
      reservationId: restaurantReservations.reservationId,
      tenantId: restaurantReservations.tenantId,
      outletId: restaurantReservations.outletId,
      customerId: restaurantReservations.customerId,
      customerName: restaurantReservations.customerName,
      customerPhone: restaurantReservations.customerPhone,
      customerEmail: restaurantReservations.customerEmail,
      partySize: restaurantReservations.partySize,
      reservationDate: restaurantReservations.reservationDate,
      reservationTime: restaurantReservations.reservationTime,
      durationMinutes: restaurantReservations.durationMinutes,
      status: restaurantReservations.status,
      assignedTableId: restaurantReservations.assignedTableId,
      tableNumber: restaurantTables.tableNumber,
      tableDisplayLabel: restaurantTables.displayLabel,
      sectionId: restaurantReservations.sectionId,
      sectionName: restaurantSections.name,
      notes: restaurantReservations.notes,
      specialRequests: restaurantReservations.notes,
      source: restaurantReservations.source,
      seatedSessionId: restaurantReservations.seatedSessionId,
      createdAt: restaurantReservations.createdAt,
      updatedAt: restaurantReservations.updatedAt,
    })
    .from(restaurantReservations)
    .leftJoin(restaurantTables, eq(restaurantReservations.assignedTableId, restaurantTables.tableId))
    .leftJoin(restaurantSections, eq(restaurantReservations.sectionId, restaurantSections.sectionId))
    .where(
      and(
        eq(restaurantReservations.reservationId, reservationId),
        eq(restaurantReservations.tenantId, tenantId),
        eq(restaurantReservations.outletId, outletId)
      )
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Restaurant Reservation", `Reservation with ID '${reservationId}' not found.`);
  }

  return row;
}

/**
 * Create a new restaurant reservation with conflict checks & atomic transaction
 */
export async function createReservation(
  tenantId: string,
  outletId: string,
  input: CreateReservationInput,
  userId?: string
) {
  const db = getDb();

  // 1. Validation
  if (!input.customerName || input.customerName.trim().length < 2) {
    throw new ValidationError("Customer name is required (minimum 2 characters).");
  }
  if (!input.customerPhone || input.customerPhone.trim().length < 7) {
    throw new ValidationError("Valid customer phone number is required (minimum 7 digits).");
  }
  if (!input.partySize || input.partySize < 1) {
    throw new ValidationError("Party size must be at least 1.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reservationDate)) {
    throw new ValidationError("reservationDate must be formatted as YYYY-MM-DD.");
  }
  if (!/^\d{2}:\d{2}$/.test(input.reservationTime)) {
    throw new ValidationError("reservationTime must be formatted as HH:MM.");
  }

  const duration = input.durationMinutes || 90;
  const reqStart = parseTimeToMinutes(input.reservationTime);

  // 2. Validate table assignment if provided
  let assignedTable: any = null;
  if (input.assignedTableId) {
    const [table] = await db
      .select()
      .from(restaurantTables)
      .where(
        and(
          eq(restaurantTables.tableId, input.assignedTableId),
          eq(restaurantTables.tenantId, tenantId),
          eq(restaurantTables.outletId, outletId)
        )
      )
      .limit(1);

    if (!table) {
      throw new NotFoundError("Restaurant Table", `Table '${input.assignedTableId}' not found.`);
    }

    if (!table.isActive || table.status === "OUT_OF_SERVICE") {
      throw new BusinessRuleError(`Table ${table.tableNumber} is inactive or out of service.`);
    }

    if (table.capacity < input.partySize) {
      throw new BusinessRuleError(
        `Table ${table.tableNumber} capacity (${table.capacity}) cannot accommodate party size (${input.partySize}).`
      );
    }

    // Check for conflicting reservations on the same table
    const overlapping = await db
      .select()
      .from(restaurantReservations)
      .where(
        and(
          eq(restaurantReservations.tenantId, tenantId),
          eq(restaurantReservations.outletId, outletId),
          eq(restaurantReservations.assignedTableId, table.tableId),
          eq(restaurantReservations.reservationDate, input.reservationDate),
          inArray(restaurantReservations.status, ["PENDING", "CONFIRMED", "SEATED"])
        )
      );

    const hasConflict = overlapping.some((r) => {
      const resStart = parseTimeToMinutes(r.reservationTime);
      return isTimeOverlapping(reqStart, duration, resStart, r.durationMinutes);
    });

    if (hasConflict) {
      throw new BusinessRuleError(
        `Table ${table.tableNumber} already has a conflicting reservation for this time window.`
      );
    }

    assignedTable = table;
  }

  // 3. Connect to Customer identity
  const customerId = await findOrCreateCustomer(
    tenantId,
    input.customerName,
    input.customerPhone,
    input.customerEmail
  );

  // 4. Create reservation in single database transaction
  const created = await db.transaction(async (tx) => {
    const [res] = await tx
      .insert(restaurantReservations)
      .values({
        tenantId,
        outletId,
        customerId,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim(),
        customerEmail: input.customerEmail ? input.customerEmail.trim().toLowerCase() : null,
        partySize: input.partySize,
        reservationDate: input.reservationDate,
        reservationTime: input.reservationTime,
        durationMinutes: duration,
        status: "CONFIRMED",
        assignedTableId: input.assignedTableId || null,
        sectionId: input.sectionId || (assignedTable?.sectionId ?? null),
        notes: input.notes?.trim() || null,
        source: input.source || "CUSTOMER_WEB",
        createdByUserId: isValidUuid(userId) ? userId! : null,
      })
      .returning();

    // Record outbox event
    const domainEvent = createDomainEvent({
      tenantId,
      outletId,
      vertical: "RESTAURANT",
      eventType: DOMAIN_EVENT_TYPES.RESTAURANT_RESERVATION_CONFIRMED,
      aggregateType: "RESERVATION",
      aggregateId: res.reservationId,
      payload: {
        reservationId: res.reservationId,
        tenantId,
        outletId,
        customerName: res.customerName,
        customerPhone: res.customerPhone,
        customerEmail: res.customerEmail,
        partySize: res.partySize,
        reservationDate: res.reservationDate,
        reservationTime: res.reservationTime,
        tableNumber: assignedTable?.tableNumber || null,
      },
    });

    await recordOutboxEvent(tx, domainEvent);

    return res;
  });

  await recordAuditEvent({
    tenantId,
    userId: userId || "SYSTEM",
    action: "restaurant.reservation.created",
    resourceType: "RESTAURANT_RESERVATION",
    resourceId: created.reservationId,
    payload: {
      partySize: created.partySize,
      date: created.reservationDate,
      time: created.reservationTime,
      assignedTableId: created.assignedTableId,
    },
  });

  return getReservationById(tenantId, outletId, created.reservationId);
}

/**
 * Assign or reassign a table to an existing reservation
 */
export async function assignTableToReservation(
  tenantId: string,
  outletId: string,
  reservationId: string,
  tableId: string | null,
  userId?: string
) {
  const db = getDb();
  const reservation = await getReservationById(tenantId, outletId, reservationId);

  if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(reservation.status)) {
    throw new BusinessRuleError(`Cannot assign table to a ${reservation.status} reservation.`);
  }

  if (tableId === null) {
    // Unassign table
    const [updated] = await db
      .update(restaurantReservations)
      .set({ assignedTableId: null, updatedAt: new Date() })
      .where(and(eq(restaurantReservations.reservationId, reservationId), eq(restaurantReservations.tenantId, tenantId)))
      .returning();

    await recordAuditEvent({
      tenantId,
      userId: userId || "SYSTEM",
      action: "restaurant.reservation.table_unassigned",
      resourceType: "RESTAURANT_RESERVATION",
      resourceId: reservationId,
      payload: { previousTableId: reservation.assignedTableId },
    });

    return getReservationById(tenantId, outletId, reservationId);
  }

  // Validate table
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

  if (!table.isActive || table.status === "OUT_OF_SERVICE") {
    throw new BusinessRuleError(`Table ${table.tableNumber} is inactive or out of service.`);
  }

  if (table.capacity < reservation.partySize) {
    throw new BusinessRuleError(
      `Table ${table.tableNumber} capacity (${table.capacity}) is less than reservation party size (${reservation.partySize}).`
    );
  }

  // Check conflicts
  const reqStart = parseTimeToMinutes(reservation.reservationTime);
  const overlapping = await db
    .select()
    .from(restaurantReservations)
    .where(
      and(
        eq(restaurantReservations.tenantId, tenantId),
        eq(restaurantReservations.outletId, outletId),
        eq(restaurantReservations.assignedTableId, table.tableId),
        eq(restaurantReservations.reservationDate, reservation.reservationDate),
        inArray(restaurantReservations.status, ["PENDING", "CONFIRMED", "SEATED"]),
        sql`${restaurantReservations.reservationId} != ${reservationId}::uuid`
      )
    );

  const hasConflict = overlapping.some((r) => {
    const resStart = parseTimeToMinutes(r.reservationTime);
    return isTimeOverlapping(reqStart, reservation.durationMinutes, resStart, r.durationMinutes);
  });

  if (hasConflict) {
    throw new BusinessRuleError(
      `Table ${table.tableNumber} already has a conflicting reservation for this time window.`
    );
  }

  await db
    .update(restaurantReservations)
    .set({
      assignedTableId: table.tableId,
      sectionId: table.sectionId ?? reservation.sectionId,
      updatedAt: new Date(),
    })
    .where(and(eq(restaurantReservations.reservationId, reservationId), eq(restaurantReservations.tenantId, tenantId)));

  await recordAuditEvent({
    tenantId,
    userId: userId || "SYSTEM",
    action: "restaurant.reservation.table_assigned",
    resourceType: "RESTAURANT_RESERVATION",
    resourceId: reservationId,
    payload: {
      previousTableId: reservation.assignedTableId,
      newTableId: table.tableId,
      tableNumber: table.tableNumber,
    },
  });

  return getReservationById(tenantId, outletId, reservationId);
}

/**
 * Update reservation details (notes, party size, guest info)
 */
export async function updateReservation(
  tenantId: string,
  outletId: string,
  reservationId: string,
  input: UpdateReservationInput,
  userId?: string
) {
  const db = getDb();
  const existing = await getReservationById(tenantId, outletId, reservationId);

  if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(existing.status)) {
    throw new BusinessRuleError(`Cannot update a ${existing.status} reservation.`);
  }

  const updates: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (input.customerName !== undefined) updates.customerName = input.customerName.trim();
  if (input.customerPhone !== undefined) updates.customerPhone = input.customerPhone.trim();
  if (input.customerEmail !== undefined) {
    updates.customerEmail = input.customerEmail ? input.customerEmail.trim().toLowerCase() : null;
  }
  if (input.partySize !== undefined) {
    if (existing.assignedTableId) {
      const [table] = await db
        .select()
        .from(restaurantTables)
        .where(eq(restaurantTables.tableId, existing.assignedTableId));
      if (table && table.capacity < input.partySize) {
        throw new BusinessRuleError(
          `Assigned Table ${table.tableNumber} capacity (${table.capacity}) is less than updated party size (${input.partySize}). Reassign table first.`
        );
      }
    }
    updates.partySize = input.partySize;
  }
  if (input.reservationDate !== undefined) updates.reservationDate = input.reservationDate;
  if (input.reservationTime !== undefined) updates.reservationTime = input.reservationTime;
  if (input.durationMinutes !== undefined) updates.durationMinutes = input.durationMinutes;
  if (input.notes !== undefined) updates.notes = input.notes?.trim() || null;
  if ((input as any).specialRequests !== undefined) {
    updates.notes = (input as any).specialRequests?.trim() || updates.notes;
  }

  await db
    .update(restaurantReservations)
    .set(updates)
    .where(
      and(
        eq(restaurantReservations.reservationId, reservationId),
        eq(restaurantReservations.tenantId, tenantId),
        eq(restaurantReservations.outletId, outletId)
      )
    );

  await recordAuditEvent({
    tenantId,
    userId: userId || "SYSTEM",
    action: "restaurant.reservation.updated",
    resourceType: "RESTAURANT_RESERVATION",
    resourceId: reservationId,
    payload: updates,
  });

  return getReservationById(tenantId, outletId, reservationId);
}

/**
 * Update reservation status with strict state-transition enforcement
 */
export async function updateReservationStatus(
  tenantId: string,
  outletId: string,
  reservationId: string,
  newStatus: RestaurantReservationStatus,
  userId?: string,
  reason?: string
) {
  const db = getDb();
  const current = await getReservationById(tenantId, outletId, reservationId);

  if (current.status === newStatus) {
    return current;
  }

  // Allowed transitions
  const ALLOWED_TRANSITIONS: Record<RestaurantReservationStatus, RestaurantReservationStatus[]> = {
    PENDING: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["SEATED", "CANCELLED", "NO_SHOW"],
    SEATED: ["COMPLETED"],
    COMPLETED: [],
    CANCELLED: [],
    NO_SHOW: [],
  };

  const allowed = ALLOWED_TRANSITIONS[current.status as RestaurantReservationStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new InvalidStateTransitionError(
      `Cannot transition reservation from '${current.status}' to '${newStatus}'.`
    );
  }

  // Special cancellation handling
  if (newStatus === "CANCELLED") {
    await db.transaction(async (tx) => {
      await tx
        .update(restaurantReservations)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(
          and(
            eq(restaurantReservations.reservationId, reservationId),
            eq(restaurantReservations.tenantId, tenantId)
          )
        );

      const domainEvent = createDomainEvent({
        tenantId,
        outletId,
        vertical: "RESTAURANT",
        eventType: DOMAIN_EVENT_TYPES.RESTAURANT_RESERVATION_CANCELLED,
        aggregateType: "RESERVATION",
        aggregateId: reservationId,
        payload: {
          reservationId,
          tenantId,
          outletId,
          customerName: current.customerName,
          customerPhone: current.customerPhone,
          reason: reason || "Cancelled by guest/staff",
        },
      });

      await recordOutboxEvent(tx, domainEvent);
    });

    await recordAuditEvent({
      tenantId,
      userId: userId || "SYSTEM",
      action: "restaurant.reservation.cancelled",
      resourceType: "RESTAURANT_RESERVATION",
      resourceId: reservationId,
      payload: { reason },
    });

    return getReservationById(tenantId, outletId, reservationId);
  }

  // Simple status update for CONFIRMED, COMPLETED, NO_SHOW
  await db
    .update(restaurantReservations)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(
      and(
        eq(restaurantReservations.reservationId, reservationId),
        eq(restaurantReservations.tenantId, tenantId)
      )
    );

  await recordAuditEvent({
    tenantId,
    userId: userId || "SYSTEM",
    action: `restaurant.reservation.${newStatus.toLowerCase()}`,
    resourceType: "RESTAURANT_RESERVATION",
    resourceId: reservationId,
    payload: { previousStatus: current.status, newStatus, reason },
  });

  return getReservationById(tenantId, outletId, reservationId);
}

/**
 * Seat Reservation: transitions party to SEATED, creates dining session, sets table to OCCUPIED
 */
export async function seatReservation(
  tenantId: string,
  outletId: string,
  reservationId: string,
  tableIdOverride?: string,
  userId?: string
) {
  const db = getDb();
  const reservation = await getReservationById(tenantId, outletId, reservationId);

  if (reservation.status === "SEATED") {
    throw new BusinessRuleError("Reservation is already seated.");
  }
  if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(reservation.status)) {
    throw new BusinessRuleError(`Cannot seat a ${reservation.status} reservation.`);
  }

  const targetTableId = tableIdOverride || reservation.assignedTableId;
  if (!targetTableId) {
    throw new BusinessRuleError("Cannot seat reservation without an assigned table. Please specify a table.");
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

    // 2. Check for active session collision on target table
    const [existingSession] = await tx
      .select({ sessionId: restaurantTableSessions.sessionId, status: restaurantTableSessions.status })
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
        `Table ${table.tableNumber} already has an active dining session. Please clear or transfer the table before seating.`
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
        guestCount: reservation.partySize,
        customerName: reservation.customerName,
        customerPhone: reservation.customerPhone,
        openedByUserId: isValidUuid(userId) ? userId! : null,
        notes: reservation.notes ? `Reservation (${reservation.reservationTime}): ${reservation.notes}` : `Reservation: ${reservation.reservationTime}`,
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

    // 5. Update reservation to SEATED
    const [updatedReservation] = await tx
      .update(restaurantReservations)
      .set({
        status: "SEATED",
        assignedTableId: targetTableId,
        seatedSessionId: session.sessionId,
        updatedAt: new Date(),
      })
      .where(eq(restaurantReservations.reservationId, reservationId))
      .returning();

    return { session, updatedReservation, table: { ...table, status: "OCCUPIED" as const } };
  });

  await recordAuditEvent({
    tenantId,
    userId: userId || "SYSTEM",
    action: "restaurant.reservation.seated",
    resourceType: "RESTAURANT_RESERVATION",
    resourceId: reservationId,
    payload: {
      tableId: targetTableId,
      tableNumber: result.table.tableNumber,
      sessionId: result.session.sessionId,
      sessionNumber: result.session.sessionNumber,
    },
  });

  return {
    reservation: await getReservationById(tenantId, outletId, reservationId),
    session: result.session,
    table: result.table,
  };
}
