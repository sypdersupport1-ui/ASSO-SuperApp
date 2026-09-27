import { eq, and, sql, desc, or, ilike } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  hotelStays,
  hotelReservations,
  hotelRooms,
  hotelRoomTypes,
  hotelGuests,
  type HotelStay,
  type HotelStayStatus,
  type HotelReservationStatus,
  type HotelOperationalStatus,
  type HotelHousekeepingStatus,
} from "@/db/schema/hotel";
import { customers } from "@/db/schema/core";
import { businessContexts } from "@/db/schema/context";
import { ValidationError, NotFoundError, BusinessRuleError } from "@/lib/api/errors";
import { validateStayStatusTransition } from "./stay-state-machines";
import { validateReservationStatusTransition } from "./reservation-state-machines";
import {
  validateOperationalStatusTransition,
  validateHousekeepingStatusTransition,
} from "./state-machines";
import { recordAuditEvent } from "@/lib/audit";
import { realtimeHub } from "@/lib/realtime/sse";

export interface StayDetail {
  stayId: string;
  tenantId: string;
  outletId: string;
  reservationId: string;
  reservationNumber: string;
  guestId: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  vipStatus: string;
  roomId: string;
  roomNumber: string;
  floorNumber: string | null;
  roomTypeId: string;
  roomTypeName: string;
  stayNumber: string;
  checkInAt: Date;
  expectedCheckOutAt: Date;
  actualCheckOutAt: Date | null;
  status: HotelStayStatus;
  adultCount: number;
  childrenCount: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CheckInInput {
  reservationId: string;
  roomId?: string;
  notes?: string;
}

export interface CheckOutInput {
  stayId: string;
  notes?: string;
}

export interface ListStaysFilters {
  outletId?: string;
  status?: HotelStayStatus;
  roomId?: string;
  guestId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Execute atomic Check-In transaction:
 * 1. Lock reservation row
 * 2. Validate eligibility (must be CONFIRMED, no active stay)
 * 3. Lock target room row
 * 4. Validate room (active, matches room type, AVAILABLE/RESERVED, not occupied, no active stay)
 * 5. Create HotelStay (ACTIVE)
 * 6. Update HotelRoom (OCCUPIED, isOccupied = true) & BusinessContext
 * 7. Update HotelReservation (CHECKED_IN)
 * 8. Audit & Realtime emission
 */
export async function executeCheckIn(
  tenantId: string,
  outletId?: string,
  input: CheckInInput = { reservationId: "" },
  userId?: string
): Promise<StayDetail> {
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    // 1. Lock reservation row FOR UPDATE
    const [reservation] = await tx
      .select()
      .from(hotelReservations)
      .where(
        outletId
          ? and(
              eq(hotelReservations.reservationId, input.reservationId),
              eq(hotelReservations.tenantId, tenantId),
              eq(hotelReservations.outletId, outletId)
            )
          : and(
              eq(hotelReservations.reservationId, input.reservationId),
              eq(hotelReservations.tenantId, tenantId)
            )
      )
      .for("update");

    if (!reservation) {
      throw new NotFoundError(`Reservation with ID '${input.reservationId}' not found.`);
    }

    // 2. Validate reservation state
    if (reservation.status === "CHECKED_IN") {
      throw new BusinessRuleError("Reservation is already checked in.");
    }
    if (reservation.status === "COMPLETED") {
      throw new BusinessRuleError("Reservation is already completed.");
    }
    if (reservation.status === "CANCELLED" || reservation.status === "NO_SHOW") {
      throw new BusinessRuleError(`Cannot check in reservation in '${reservation.status}' state.`);
    }
    if (reservation.status !== "CONFIRMED") {
      throw new BusinessRuleError(`Reservation must be in 'CONFIRMED' status to check in. Current status: '${reservation.status}'.`);
    }

    // 3. Ensure reservation does not already have an active stay
    const [existingStay] = await tx
      .select({ stayId: hotelStays.stayId })
      .from(hotelStays)
      .where(
        and(
          eq(hotelStays.reservationId, input.reservationId),
          eq(hotelStays.status, "ACTIVE")
        )
      )
      .limit(1);

    if (existingStay) {
      throw new BusinessRuleError("An active stay already exists for this reservation.");
    }

    // 4. Determine target room
    const targetRoomId = input.roomId || reservation.assignedRoomId;
    const effectiveOutletId = outletId || reservation.outletId;

    if (!targetRoomId) {
      throw new ValidationError("A physical room must be selected for check-in.");
    }

    // 5. Lock room row FOR UPDATE
    const [room] = await tx
      .select()
      .from(hotelRooms)
      .where(
        and(
          eq(hotelRooms.roomId, targetRoomId),
          eq(hotelRooms.tenantId, tenantId),
          eq(hotelRooms.outletId, effectiveOutletId)
        )
      )
      .for("update");

    if (!room) {
      throw new NotFoundError(`Selected room does not exist in this property.`);
    }
    if (!room.isActive) {
      throw new BusinessRuleError(`Selected room '${room.roomNumber}' is inactive.`);
    }
    if (room.roomTypeId !== reservation.roomTypeId) {
      throw new BusinessRuleError(
        `Selected room '${room.roomNumber}' does not match reservation room type.`
      );
    }
    if (room.operationalStatus === "OCCUPIED" || room.isOccupied) {
      throw new BusinessRuleError(`Room '${room.roomNumber}' is already occupied.`);
    }
    if (room.operationalStatus === "OUT_OF_SERVICE" || room.operationalStatus === "OUT_OF_ORDER") {
      throw new BusinessRuleError(
        `Room '${room.roomNumber}' is ${room.operationalStatus} and cannot be checked in.`
      );
    }

    // 6. Ensure no other active stay exists for this room
    const [roomActiveStay] = await tx
      .select({ stayId: hotelStays.stayId })
      .from(hotelStays)
      .where(
        and(
          eq(hotelStays.roomId, targetRoomId),
          eq(hotelStays.status, "ACTIVE")
        )
      )
      .limit(1);

    if (roomActiveStay) {
      throw new BusinessRuleError(`Room '${room.roomNumber}' already has an active stay.`);
    }

    // 7. Validate state transitions
    validateOperationalStatusTransition(room.operationalStatus as HotelOperationalStatus, "OCCUPIED");
    validateReservationStatusTransition(reservation.status as HotelReservationStatus, "CHECKED_IN");

    // 8. Generate unique stay number
    const stayNumber = `STY-${Date.now().toString().slice(-4)}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 9. Insert hotelStays record
    const [createdStay] = await tx
      .insert(hotelStays)
      .values({
        tenantId,
        outletId: effectiveOutletId,
        reservationId: reservation.reservationId,
        guestId: reservation.guestId,
        roomId: targetRoomId,
        stayNumber,
        checkInAt: new Date(),
        expectedCheckOutAt: reservation.departureDate,
        status: "ACTIVE",
        adultCount: reservation.adultCount,
        childrenCount: reservation.childrenCount,
        notes: input.notes?.trim() || null,
      })
      .returning();

    // 10. Update Hotel Room operational state to OCCUPIED
    await tx
      .update(hotelRooms)
      .set({
        operationalStatus: "OCCUPIED",
        isOccupied: true,
        updatedAt: new Date(),
      })
      .where(eq(hotelRooms.roomId, targetRoomId));

    // Mirror to business context
    await tx
      .update(businessContexts)
      .set({
        status: "OCCUPIED",
        updatedAt: new Date(),
      })
      .where(eq(businessContexts.contextId, room.contextId));

    // 11. Update Reservation state to CHECKED_IN
    await tx
      .update(hotelReservations)
      .set({
        status: "CHECKED_IN",
        assignedRoomId: targetRoomId,
        updatedAt: new Date(),
      })
      .where(eq(hotelReservations.reservationId, reservation.reservationId));

    // 12. Audit event
    await recordAuditEvent({
      tenantId,
      userId,
      action: "HOTEL_CHECK_IN_COMPLETED",
      resourceType: "HOTEL_STAY",
      resourceId: createdStay.stayId,
      payload: {
        stayNumber: createdStay.stayNumber,
        reservationId: reservation.reservationId,
        reservationNumber: reservation.reservationNumber,
        roomId: targetRoomId,
        roomNumber: room.roomNumber,
        expectedCheckOutAt: reservation.departureDate,
      },
    });

    return {
      stay: createdStay,
      roomNumber: room.roomNumber,
      floorNumber: room.floorNumber,
      reservationNumber: reservation.reservationNumber,
      guestId: reservation.guestId,
      roomTypeId: reservation.roomTypeId,
    };
  });

  // 13. Emit Realtime events post-commit
  realtimeHub.broadcastToTenant(tenantId, "stay.checked_in", {
    stayId: result.stay.stayId,
    stayNumber: result.stay.stayNumber,
    reservationId: result.stay.reservationId,
    roomId: result.stay.roomId,
    roomNumber: result.roomNumber,
  });

  realtimeHub.broadcastToTenant(tenantId, "room.occupied", {
    roomId: result.stay.roomId,
    roomNumber: result.roomNumber,
  });

  return getStayById(tenantId, result.stay.stayId);
}

/**
 * Execute atomic Check-Out transaction:
 * 1. Lock stay row
 * 2. Validate stay is ACTIVE
 * 3. Lock room and reservation rows
 * 4. Update HotelStay (CHECKED_OUT, actualCheckOutAt = now())
 * 5. Update HotelRoom (operationalStatus = AVAILABLE, isOccupied = false, housekeepingStatus = DIRTY)
 * 6. Update HotelReservation (COMPLETED)
 * 7. Audit & Realtime emission
 */
export async function executeCheckOut(
  tenantId: string,
  outletId?: string,
  input: CheckOutInput = { stayId: "" },
  userId?: string
): Promise<StayDetail> {
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    // 1. Lock stay row FOR UPDATE
    const [stay] = await tx
      .select()
      .from(hotelStays)
      .where(
        outletId
          ? and(
              eq(hotelStays.stayId, input.stayId),
              eq(hotelStays.tenantId, tenantId),
              eq(hotelStays.outletId, outletId)
            )
          : and(
              eq(hotelStays.stayId, input.stayId),
              eq(hotelStays.tenantId, tenantId)
            )
      )
      .for("update");

    if (!stay) {
      throw new NotFoundError(`Stay with ID '${input.stayId}' not found.`);
    }

    if (stay.status === "CHECKED_OUT") {
      throw new BusinessRuleError("Stay has already been checked out.");
    }
    if (stay.status !== "ACTIVE") {
      throw new BusinessRuleError(`Cannot check out stay in '${stay.status}' state.`);
    }

    // 2. Validate stay status transition
    validateStayStatusTransition(stay.status as HotelStayStatus, "CHECKED_OUT");

    // 3. Lock room row FOR UPDATE
    const [room] = await tx
      .select()
      .from(hotelRooms)
      .where(eq(hotelRooms.roomId, stay.roomId))
      .for("update");

    // 4. Lock reservation row FOR UPDATE
    const [reservation] = await tx
      .select()
      .from(hotelReservations)
      .where(eq(hotelReservations.reservationId, stay.reservationId))
      .for("update");

    // Validate room status transition if room exists
    if (room) {
      validateOperationalStatusTransition(room.operationalStatus as HotelOperationalStatus, "AVAILABLE");
      // Housekeeping transitions to DIRTY after checkout
      if (room.housekeepingStatus !== "DIRTY") {
        validateHousekeepingStatusTransition(room.housekeepingStatus as HotelHousekeepingStatus, "DIRTY");
      }
    }

    // Validate reservation status transition if reservation exists
    if (reservation) {
      validateReservationStatusTransition(reservation.status as HotelReservationStatus, "COMPLETED");
    }

    const now = new Date();
    const updatedNotes = input.notes?.trim()
      ? stay.notes
        ? `${stay.notes} | Checkout notes: ${input.notes.trim()}`
        : `Checkout notes: ${input.notes.trim()}`
      : stay.notes;

    // 5. Update Stay to CHECKED_OUT
    const [updatedStay] = await tx
      .update(hotelStays)
      .set({
        status: "CHECKED_OUT",
        actualCheckOutAt: now,
        notes: updatedNotes,
        updatedAt: now,
      })
      .where(eq(hotelStays.stayId, stay.stayId))
      .returning();

    // 6. Update Hotel Room: release occupancy, mark DIRTY for housekeeping
    if (room) {
      await tx
        .update(hotelRooms)
        .set({
          operationalStatus: "AVAILABLE",
          isOccupied: false,
          housekeepingStatus: "DIRTY",
          updatedAt: now,
        })
        .where(eq(hotelRooms.roomId, room.roomId));

      // Mirror to business context
      await tx
        .update(businessContexts)
        .set({
          status: "AVAILABLE",
          updatedAt: now,
        })
        .where(eq(businessContexts.contextId, room.contextId));
    }

    // 7. Update Reservation to COMPLETED
    if (reservation) {
      await tx
        .update(hotelReservations)
        .set({
          status: "COMPLETED",
          updatedAt: now,
        })
        .where(eq(hotelReservations.reservationId, reservation.reservationId));
    }

    // 8. Audit event
    await recordAuditEvent({
      tenantId,
      userId,
      action: "HOTEL_CHECK_OUT_COMPLETED",
      resourceType: "HOTEL_STAY",
      resourceId: stay.stayId,
      payload: {
        stayNumber: stay.stayNumber,
        reservationId: stay.reservationId,
        roomId: stay.roomId,
        roomNumber: room?.roomNumber,
        actualCheckOutAt: now,
      },
    });

    return {
      stay: updatedStay,
      roomId: room?.roomId,
      roomNumber: room?.roomNumber,
    };
  });

  // 9. Emit Realtime events post-commit
  realtimeHub.broadcastToTenant(tenantId, "stay.checked_out", {
    stayId: result.stay.stayId,
    stayNumber: result.stay.stayNumber,
    roomId: result.roomId,
    roomNumber: result.roomNumber,
  });

  if (result.roomId) {
    realtimeHub.broadcastToTenant(tenantId, "room.released", {
      roomId: result.roomId,
      roomNumber: result.roomNumber,
      operationalStatus: "AVAILABLE",
      housekeepingStatus: "DIRTY",
    });
  }

  return getStayById(tenantId, result.stay.stayId);
}

/**
 * Get detailed Stay by ID
 */
export async function getStayById(tenantId: string, stayId: string): Promise<StayDetail> {
  const db = getDb();

  const [row] = await db
    .select({
      stayId: hotelStays.stayId,
      tenantId: hotelStays.tenantId,
      outletId: hotelStays.outletId,
      reservationId: hotelStays.reservationId,
      reservationNumber: hotelReservations.reservationNumber,
      guestId: hotelStays.guestId,
      guestName: customers.fullName,
      guestPhone: customers.phone,
      guestEmail: customers.email,
      vipStatus: hotelGuests.vipStatus,
      roomId: hotelStays.roomId,
      roomNumber: hotelRooms.roomNumber,
      floorNumber: hotelRooms.floorNumber,
      roomTypeId: hotelRooms.roomTypeId,
      roomTypeName: hotelRoomTypes.name,
      stayNumber: hotelStays.stayNumber,
      checkInAt: hotelStays.checkInAt,
      expectedCheckOutAt: hotelStays.expectedCheckOutAt,
      actualCheckOutAt: hotelStays.actualCheckOutAt,
      status: hotelStays.status,
      adultCount: hotelStays.adultCount,
      childrenCount: hotelStays.childrenCount,
      notes: hotelStays.notes,
      createdAt: hotelStays.createdAt,
      updatedAt: hotelStays.updatedAt,
    })
    .from(hotelStays)
    .innerJoin(hotelReservations, eq(hotelStays.reservationId, hotelReservations.reservationId))
    .innerJoin(hotelRooms, eq(hotelStays.roomId, hotelRooms.roomId))
    .innerJoin(hotelRoomTypes, eq(hotelRooms.roomTypeId, hotelRoomTypes.roomTypeId))
    .innerJoin(hotelGuests, eq(hotelStays.guestId, hotelGuests.guestId))
    .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
    .where(
      and(
        eq(hotelStays.stayId, stayId),
        eq(hotelStays.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError(`Stay with ID '${stayId}' not found.`);
  }

  return {
    ...row,
    vipStatus: row.vipStatus || "STANDARD",
    status: row.status as HotelStayStatus,
  };
}

/**
 * List stays with filtering, search, and pagination
 */
export async function listStays(
  tenantId: string,
  filters: ListStaysFilters = {}
): Promise<StayDetail[]> {
  const db = getDb();

  const conditions = [eq(hotelStays.tenantId, tenantId)];

  if (filters.outletId) {
    conditions.push(eq(hotelStays.outletId, filters.outletId));
  }
  if (filters.status) {
    conditions.push(eq(hotelStays.status, filters.status));
  }
  if (filters.roomId) {
    conditions.push(eq(hotelStays.roomId, filters.roomId));
  }
  if (filters.guestId) {
    conditions.push(eq(hotelStays.guestId, filters.guestId));
  }

  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(hotelStays.stayNumber, term),
        ilike(customers.fullName, term),
        ilike(hotelRooms.roomNumber, term),
        ilike(hotelReservations.reservationNumber, term)
      )!
    );
  }

  const limit = Math.min(filters.limit || 50, 100);
  const offset = filters.offset || 0;

  const rows = await db
    .select({
      stayId: hotelStays.stayId,
      tenantId: hotelStays.tenantId,
      outletId: hotelStays.outletId,
      reservationId: hotelStays.reservationId,
      reservationNumber: hotelReservations.reservationNumber,
      guestId: hotelStays.guestId,
      guestName: customers.fullName,
      guestPhone: customers.phone,
      guestEmail: customers.email,
      vipStatus: hotelGuests.vipStatus,
      roomId: hotelStays.roomId,
      roomNumber: hotelRooms.roomNumber,
      floorNumber: hotelRooms.floorNumber,
      roomTypeId: hotelRooms.roomTypeId,
      roomTypeName: hotelRoomTypes.name,
      stayNumber: hotelStays.stayNumber,
      checkInAt: hotelStays.checkInAt,
      expectedCheckOutAt: hotelStays.expectedCheckOutAt,
      actualCheckOutAt: hotelStays.actualCheckOutAt,
      status: hotelStays.status,
      adultCount: hotelStays.adultCount,
      childrenCount: hotelStays.childrenCount,
      notes: hotelStays.notes,
      createdAt: hotelStays.createdAt,
      updatedAt: hotelStays.updatedAt,
    })
    .from(hotelStays)
    .innerJoin(hotelReservations, eq(hotelStays.reservationId, hotelReservations.reservationId))
    .innerJoin(hotelRooms, eq(hotelStays.roomId, hotelRooms.roomId))
    .innerJoin(hotelRoomTypes, eq(hotelRooms.roomTypeId, hotelRoomTypes.roomTypeId))
    .innerJoin(hotelGuests, eq(hotelStays.guestId, hotelGuests.guestId))
    .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
    .where(and(...conditions))
    .orderBy(desc(hotelStays.checkInAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    ...r,
    vipStatus: r.vipStatus || "STANDARD",
    status: r.status as HotelStayStatus,
  }));
}

/**
 * Get active stay for a specific room (used in Room Rack)
 */
export async function getActiveStayForRoom(
  tenantId: string,
  roomId: string
): Promise<StayDetail | null> {
  const db = getDb();

  const [row] = await db
    .select({
      stayId: hotelStays.stayId,
      tenantId: hotelStays.tenantId,
      outletId: hotelStays.outletId,
      reservationId: hotelStays.reservationId,
      reservationNumber: hotelReservations.reservationNumber,
      guestId: hotelStays.guestId,
      guestName: customers.fullName,
      guestPhone: customers.phone,
      guestEmail: customers.email,
      vipStatus: hotelGuests.vipStatus,
      roomId: hotelStays.roomId,
      roomNumber: hotelRooms.roomNumber,
      floorNumber: hotelRooms.floorNumber,
      roomTypeId: hotelRooms.roomTypeId,
      roomTypeName: hotelRoomTypes.name,
      stayNumber: hotelStays.stayNumber,
      checkInAt: hotelStays.checkInAt,
      expectedCheckOutAt: hotelStays.expectedCheckOutAt,
      actualCheckOutAt: hotelStays.actualCheckOutAt,
      status: hotelStays.status,
      adultCount: hotelStays.adultCount,
      childrenCount: hotelStays.childrenCount,
      notes: hotelStays.notes,
      createdAt: hotelStays.createdAt,
      updatedAt: hotelStays.updatedAt,
    })
    .from(hotelStays)
    .innerJoin(hotelReservations, eq(hotelStays.reservationId, hotelReservations.reservationId))
    .innerJoin(hotelRooms, eq(hotelStays.roomId, hotelRooms.roomId))
    .innerJoin(hotelRoomTypes, eq(hotelRooms.roomTypeId, hotelRoomTypes.roomTypeId))
    .innerJoin(hotelGuests, eq(hotelStays.guestId, hotelGuests.guestId))
    .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
    .where(
      and(
        eq(hotelStays.roomId, roomId),
        eq(hotelStays.tenantId, tenantId),
        eq(hotelStays.status, "ACTIVE")
      )
    )
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    vipStatus: row.vipStatus || "STANDARD",
    status: row.status as HotelStayStatus,
  };
}
