import { eq, and, or, sql, desc, count, gte, lte, lt, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  hotelReservations,
  hotelGuests,
  hotelRoomTypes,
  hotelRooms,
  type HotelReservation,
  type HotelReservationStatus,
} from "@/db/schema/hotel";
import { customers } from "@/db/schema/core";
import { ValidationError, NotFoundError, BusinessRuleError } from "@/lib/api/errors";
import { validateReservationStatusTransition } from "./reservation-state-machines";
import { recordAuditEvent } from "@/lib/audit";
import { realtimeHub } from "@/lib/realtime/sse";

export interface ReservationDetail {
  reservationId: string;
  tenantId: string;
  outletId: string;
  guestId: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  reservationNumber: string;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeCode: string;
  assignedRoomId: string | null;
  assignedRoomNumber: string | null;
  arrivalDate: Date;
  departureDate: Date;
  adultCount: number;
  childrenCount: number;
  status: HotelReservationStatus;
  specialRequests: string | null;
  totalAmount: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReservationInput {
  guestId: string;
  roomTypeId: string;
  assignedRoomId?: string;
  arrivalDate: string | Date;
  departureDate: string | Date;
  adultCount?: number;
  childrenCount?: number;
  specialRequests?: string;
  status?: HotelReservationStatus;
}

export interface RoomTypeAvailability {
  roomTypeId: string;
  name: string;
  code: string;
  baseRate: string;
  totalRooms: number;
  outOfServiceRooms: number;
  reservedRooms: number;
  availableRooms: number;
  isAvailable: boolean;
}

/**
 * Validate that arrival date is before departure date and not in the past
 */
export function validateReservationDates(arrival: Date, departure: Date): void {
  if (isNaN(arrival.getTime()) || isNaN(departure.getTime())) {
    throw new ValidationError("Invalid arrival or departure date format.");
  }
  if (arrival >= departure) {
    throw new ValidationError("Arrival date and time must be strictly before departure date and time.");
  }
}

/**
 * Check if a specific physical room has an overlapping active reservation
 */
export async function checkSpecificRoomConflict(
  tenantId: string,
  outletId: string,
  roomId: string,
  arrivalDate: Date,
  departureDate: Date,
  excludeReservationId?: string
): Promise<boolean> {
  const db = getDb();

  const conditions = [
    eq(hotelReservations.tenantId, tenantId),
    eq(hotelReservations.outletId, outletId),
    eq(hotelReservations.assignedRoomId, roomId),
    or(eq(hotelReservations.status, "CONFIRMED"), eq(hotelReservations.status, "PENDING"))!,
    // Overlapping condition: existing.arrival < new.departure AND existing.departure > new.arrival
    lt(hotelReservations.arrivalDate, departureDate),
    gt(hotelReservations.departureDate, arrivalDate),
  ];

  if (excludeReservationId) {
    conditions.push(sql`${hotelReservations.reservationId} != ${excludeReservationId}`);
  }

  const [conflict] = await db
    .select({ reservationId: hotelReservations.reservationId })
    .from(hotelReservations)
    .where(and(...conditions))
    .limit(1);

  return !!conflict;
}

/**
 * Calculate room type availability for an outlet during a date range
 */
export async function calculateAvailability(
  tenantId: string,
  outletId: string,
  arrivalDate: Date,
  departureDate: Date,
  roomTypeId?: string
): Promise<RoomTypeAvailability[]> {
  const db = getDb();
  validateReservationDates(arrivalDate, departureDate);

  // 1. Fetch room types
  const typeConditions = [
    eq(hotelRoomTypes.tenantId, tenantId),
    eq(hotelRoomTypes.outletId, outletId),
    eq(hotelRoomTypes.isActive, true),
  ];
  if (roomTypeId) {
    typeConditions.push(eq(hotelRoomTypes.roomTypeId, roomTypeId));
  }

  const roomTypesList = await db
    .select()
    .from(hotelRoomTypes)
    .where(and(...typeConditions));

  // 2. Fetch all active rooms in property
  const allRooms = await db
    .select({
      roomId: hotelRooms.roomId,
      roomTypeId: hotelRooms.roomTypeId,
      operationalStatus: hotelRooms.operationalStatus,
    })
    .from(hotelRooms)
    .where(
      and(
        eq(hotelRooms.tenantId, tenantId),
        eq(hotelRooms.outletId, outletId),
        eq(hotelRooms.isActive, true)
      )
    );

  // 3. Fetch overlapping active reservations
  const overlappingReservations = await db
    .select({
      reservationId: hotelReservations.reservationId,
      roomTypeId: hotelReservations.roomTypeId,
      assignedRoomId: hotelReservations.assignedRoomId,
    })
    .from(hotelReservations)
    .where(
      and(
        eq(hotelReservations.tenantId, tenantId),
        eq(hotelReservations.outletId, outletId),
        or(eq(hotelReservations.status, "CONFIRMED"), eq(hotelReservations.status, "PENDING")),
        lt(hotelReservations.arrivalDate, departureDate),
        gt(hotelReservations.departureDate, arrivalDate)
      )
    );

  const availability: RoomTypeAvailability[] = [];

  for (const rt of roomTypesList) {
    const roomsOfType = allRooms.filter((r) => r.roomTypeId === rt.roomTypeId);
    const totalRooms = roomsOfType.length;
    const outOfServiceRooms = roomsOfType.filter(
      (r) => r.operationalStatus === "OUT_OF_SERVICE" || r.operationalStatus === "OUT_OF_ORDER"
    ).length;

    const reservedCount = overlappingReservations.filter(
      (res) => res.roomTypeId === rt.roomTypeId
    ).length;

    const operableRooms = Math.max(0, totalRooms - outOfServiceRooms);
    const availableRooms = Math.max(0, operableRooms - reservedCount);

    availability.push({
      roomTypeId: rt.roomTypeId,
      name: rt.name,
      code: rt.code,
      baseRate: rt.baseRate,
      totalRooms,
      outOfServiceRooms,
      reservedRooms: reservedCount,
      availableRooms,
      isAvailable: availableRooms > 0,
    });
  }

  return availability;
}

/**
 * List Reservations with guest details, room details, status, and date filters
 */
export async function listReservations(
  tenantId: string,
  outletId: string,
  filters: {
    status?: string;
    roomTypeId?: string;
    assignedRoomId?: string;
    arrivalAfter?: Date;
    departureBefore?: Date;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ reservations: ReservationDetail[]; total: number }> {
  const db = getDb();
  const limit = Math.min(filters.limit ?? 50, 100);
  const offset = filters.offset ?? 0;

  const conditions = [
    eq(hotelReservations.tenantId, tenantId),
    eq(hotelReservations.outletId, outletId),
  ];

  if (filters.status && filters.status !== "ALL") {
    conditions.push(eq(hotelReservations.status, filters.status));
  }
  if (filters.roomTypeId && filters.roomTypeId !== "ALL") {
    conditions.push(eq(hotelReservations.roomTypeId, filters.roomTypeId));
  }
  if (filters.assignedRoomId) {
    conditions.push(eq(hotelReservations.assignedRoomId, filters.assignedRoomId));
  }
  if (filters.arrivalAfter) {
    conditions.push(gte(hotelReservations.arrivalDate, filters.arrivalAfter));
  }
  if (filters.departureBefore) {
    conditions.push(lte(hotelReservations.departureDate, filters.departureBefore));
  }

  // Count total matching
  const [countRes] = await db
    .select({ total: count() })
    .from(hotelReservations)
    .innerJoin(hotelGuests, eq(hotelReservations.guestId, hotelGuests.guestId))
    .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
    .where(and(...conditions));

  const total = Number(countRes?.total ?? 0);

  const rows = await db
    .select({
      reservationId: hotelReservations.reservationId,
      tenantId: hotelReservations.tenantId,
      outletId: hotelReservations.outletId,
      guestId: hotelReservations.guestId,
      guestName: customers.fullName,
      guestPhone: customers.phone,
      guestEmail: customers.email,
      reservationNumber: hotelReservations.reservationNumber,
      roomTypeId: hotelReservations.roomTypeId,
      roomTypeName: hotelRoomTypes.name,
      roomTypeCode: hotelRoomTypes.code,
      assignedRoomId: hotelReservations.assignedRoomId,
      assignedRoomNumber: hotelRooms.roomNumber,
      arrivalDate: hotelReservations.arrivalDate,
      departureDate: hotelReservations.departureDate,
      adultCount: hotelReservations.adultCount,
      childrenCount: hotelReservations.childrenCount,
      status: hotelReservations.status,
      specialRequests: hotelReservations.specialRequests,
      totalAmount: hotelReservations.totalAmount,
      createdAt: hotelReservations.createdAt,
      updatedAt: hotelReservations.updatedAt,
    })
    .from(hotelReservations)
    .innerJoin(hotelGuests, eq(hotelReservations.guestId, hotelGuests.guestId))
    .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
    .innerJoin(hotelRoomTypes, eq(hotelReservations.roomTypeId, hotelRoomTypes.roomTypeId))
    .leftJoin(hotelRooms, eq(hotelReservations.assignedRoomId, hotelRooms.roomId))
    .where(and(...conditions))
    .orderBy(desc(hotelReservations.arrivalDate))
    .limit(limit)
    .offset(offset);

  return { reservations: rows as ReservationDetail[], total };
}

/**
 * Get Reservation by ID with full guest, room type, and room details
 */
export async function getReservationById(
  tenantId: string,
  outletId: string,
  reservationId: string
): Promise<ReservationDetail> {
  const db = getDb();

  const [row] = await db
    .select({
      reservationId: hotelReservations.reservationId,
      tenantId: hotelReservations.tenantId,
      outletId: hotelReservations.outletId,
      guestId: hotelReservations.guestId,
      guestName: customers.fullName,
      guestPhone: customers.phone,
      guestEmail: customers.email,
      reservationNumber: hotelReservations.reservationNumber,
      roomTypeId: hotelReservations.roomTypeId,
      roomTypeName: hotelRoomTypes.name,
      roomTypeCode: hotelRoomTypes.code,
      assignedRoomId: hotelReservations.assignedRoomId,
      assignedRoomNumber: hotelRooms.roomNumber,
      arrivalDate: hotelReservations.arrivalDate,
      departureDate: hotelReservations.departureDate,
      adultCount: hotelReservations.adultCount,
      childrenCount: hotelReservations.childrenCount,
      status: hotelReservations.status,
      specialRequests: hotelReservations.specialRequests,
      totalAmount: hotelReservations.totalAmount,
      createdAt: hotelReservations.createdAt,
      updatedAt: hotelReservations.updatedAt,
    })
    .from(hotelReservations)
    .innerJoin(hotelGuests, eq(hotelReservations.guestId, hotelGuests.guestId))
    .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
    .innerJoin(hotelRoomTypes, eq(hotelReservations.roomTypeId, hotelRoomTypes.roomTypeId))
    .leftJoin(hotelRooms, eq(hotelReservations.assignedRoomId, hotelRooms.roomId))
    .where(
      and(
        eq(hotelReservations.reservationId, reservationId),
        eq(hotelReservations.tenantId, tenantId),
        eq(hotelReservations.outletId, outletId)
      )
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError("Hotel Reservation", `Reservation '${reservationId}' not found.`);
  }

  return row as ReservationDetail;
}

/**
 * Atomic Reservation Creation with conflict prevention and room type availability checks
 */
export async function createReservation(
  tenantId: string,
  outletId: string,
  input: CreateReservationInput,
  userId?: string
): Promise<ReservationDetail> {
  const db = getDb();

  const arrival = new Date(input.arrivalDate);
  const departure = new Date(input.departureDate);
  validateReservationDates(arrival, departure);

  // 1. Verify Guest exists and belongs to tenant
  const [guest] = await db
    .select({ guestId: hotelGuests.guestId })
    .from(hotelGuests)
    .where(and(eq(hotelGuests.guestId, input.guestId), eq(hotelGuests.tenantId, tenantId)))
    .limit(1);

  if (!guest) {
    throw new NotFoundError("Hotel Guest", `Guest with ID '${input.guestId}' was not found in this tenant.`);
  }

  // 2. Verify Room Type exists and belongs to this outlet
  const [roomType] = await db
    .select()
    .from(hotelRoomTypes)
    .where(
      and(
        eq(hotelRoomTypes.roomTypeId, input.roomTypeId),
        eq(hotelRoomTypes.outletId, outletId),
        eq(hotelRoomTypes.tenantId, tenantId),
        eq(hotelRoomTypes.isActive, true)
      )
    )
    .limit(1);

  if (!roomType) {
    throw new NotFoundError("Room Type", `Active room type '${input.roomTypeId}' was not found in this property.`);
  }

  // 3. Verify Specific Room Allocation if provided
  if (input.assignedRoomId) {
    const [assignedRoom] = await db
      .select()
      .from(hotelRooms)
      .where(
        and(
          eq(hotelRooms.roomId, input.assignedRoomId),
          eq(hotelRooms.outletId, outletId),
          eq(hotelRooms.tenantId, tenantId),
          eq(hotelRooms.isActive, true)
        )
      )
      .limit(1);

    if (!assignedRoom) {
      throw new NotFoundError("Room", `Active room '${input.assignedRoomId}' was not found in this property.`);
    }

    if (assignedRoom.roomTypeId !== input.roomTypeId) {
      throw new BusinessRuleError("Assigned room category does not match the reserved room type.");
    }

    if (assignedRoom.operationalStatus === "OUT_OF_SERVICE" || assignedRoom.operationalStatus === "OUT_OF_ORDER") {
      throw new BusinessRuleError(`Room '${assignedRoom.roomNumber}' is currently ${assignedRoom.operationalStatus.replace(/_/g, " ")} and cannot be assigned.`);
    }

    // Check conflict for specific room
    const hasConflict = await checkSpecificRoomConflict(
      tenantId,
      outletId,
      input.assignedRoomId,
      arrival,
      departure
    );

    if (hasConflict) {
      throw new BusinessRuleError(
        `Room '${assignedRoom.roomNumber}' already has an overlapping active reservation for the selected dates.`
      );
    }
  }

  // 4. Verify Overall Room-Type Capacity Availability
  const availabilities = await calculateAvailability(tenantId, outletId, arrival, departure, input.roomTypeId);
  const typeAvail = availabilities[0];
  if (!typeAvail || typeAvail.availableRooms <= 0) {
    throw new BusinessRuleError(
      `No available rooms for room type '${roomType.name}' (${roomType.code}) between ${arrival.toISOString().slice(0, 10)} and ${departure.toISOString().slice(0, 10)}.`
    );
  }

  // 5. Calculate rate & total estimated amount (days * baseRate)
  const diffDays = Math.max(1, Math.ceil((departure.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24)));
  const totalAmount = (diffDays * Number(roomType.baseRate)).toFixed(4);

  // 6. Generate unique reservation number: RES-YYYYMMDD-XXXX
  const dateStr = arrival.toISOString().slice(0, 10).replace(/-/g, "");
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const reservationNumber = `RES-${dateStr}-${randSuffix}`;

  const status: HotelReservationStatus = input.status || "CONFIRMED";

  // 7. Insert reservation
  const [created] = await db
    .insert(hotelReservations)
    .values({
      tenantId,
      outletId,
      guestId: input.guestId,
      reservationNumber,
      roomTypeId: input.roomTypeId,
      assignedRoomId: input.assignedRoomId || null,
      arrivalDate: arrival,
      departureDate: departure,
      adultCount: input.adultCount ?? 1,
      childrenCount: input.childrenCount ?? 0,
      status,
      specialRequests: input.specialRequests?.trim() || null,
      totalAmount,
    })
    .returning();

  // 8. Record audit event
  await recordAuditEvent({
    tenantId,
    userId,
    action: "HOTEL_RESERVATION_CREATED",
    resourceType: "HOTEL_RESERVATION",
    resourceId: created.reservationId,
    payload: {
      reservationNumber: created.reservationNumber,
      roomTypeCode: roomType.code,
      assignedRoomId: created.assignedRoomId,
      arrivalDate: arrival.toISOString(),
      departureDate: departure.toISOString(),
      status: created.status,
    },
  });

  // 9. Emit realtime notification
  realtimeHub.broadcastToTenant(tenantId, "reservation.created", {
    reservationId: created.reservationId,
    reservationNumber: created.reservationNumber,
    status: created.status,
    outletId,
  });

  return await getReservationById(tenantId, outletId, created.reservationId);
}

/**
 * Update Reservation Status with finite state machine validation
 */
export async function updateReservationStatus(
  tenantId: string,
  outletId: string,
  reservationId: string,
  nextStatus: HotelReservationStatus,
  userId?: string
): Promise<ReservationDetail> {
  const db = getDb();

  const current = await getReservationById(tenantId, outletId, reservationId);

  validateReservationStatusTransition(current.status, nextStatus);

  const [updated] = await db
    .update(hotelReservations)
    .set({
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(hotelReservations.reservationId, reservationId),
        eq(hotelReservations.tenantId, tenantId),
        eq(hotelReservations.outletId, outletId)
      )
    )
    .returning();

  await recordAuditEvent({
    tenantId,
    userId,
    action: `HOTEL_RESERVATION_${nextStatus}`,
    resourceType: "HOTEL_RESERVATION",
    resourceId: reservationId,
    payload: {
      previousStatus: current.status,
      newStatus: nextStatus,
      reservationNumber: current.reservationNumber,
    },
  });

  realtimeHub.broadcastToTenant(tenantId, `reservation.${nextStatus.toLowerCase()}`, {
    reservationId,
    reservationNumber: current.reservationNumber,
    status: nextStatus,
    outletId,
  });

  return await getReservationById(tenantId, outletId, reservationId);
}

/**
 * Assign Room to Reservation with conflict validation
 */
export async function assignRoomToReservation(
  tenantId: string,
  outletId: string,
  reservationId: string,
  roomId: string,
  userId?: string
): Promise<ReservationDetail> {
  const db = getDb();

  const current = await getReservationById(tenantId, outletId, reservationId);

  if (current.status === "CANCELLED" || current.status === "NO_SHOW") {
    throw new BusinessRuleError(`Cannot assign room to a ${current.status} reservation.`);
  }

  // Verify target room
  const [targetRoom] = await db
    .select()
    .from(hotelRooms)
    .where(
      and(
        eq(hotelRooms.roomId, roomId),
        eq(hotelRooms.outletId, outletId),
        eq(hotelRooms.tenantId, tenantId),
        eq(hotelRooms.isActive, true)
      )
    )
    .limit(1);

  if (!targetRoom) {
    throw new NotFoundError("Room", `Active room '${roomId}' was not found.`);
  }

  if (targetRoom.roomTypeId !== current.roomTypeId) {
    throw new BusinessRuleError("Selected room category does not match reservation room type.");
  }

  if (targetRoom.operationalStatus === "OUT_OF_SERVICE" || targetRoom.operationalStatus === "OUT_OF_ORDER") {
    throw new BusinessRuleError(`Room '${targetRoom.roomNumber}' is ${targetRoom.operationalStatus.replace(/_/g, " ")}.`);
  }

  const hasConflict = await checkSpecificRoomConflict(
    tenantId,
    outletId,
    roomId,
    current.arrivalDate,
    current.departureDate,
    reservationId
  );

  if (hasConflict) {
    throw new BusinessRuleError(`Room '${targetRoom.roomNumber}' is already reserved for the selected dates.`);
  }

  await db
    .update(hotelReservations)
    .set({
      assignedRoomId: roomId,
      updatedAt: new Date(),
    })
    .where(eq(hotelReservations.reservationId, reservationId));

  await recordAuditEvent({
    tenantId,
    userId,
    action: "HOTEL_RESERVATION_ROOM_ASSIGNED",
    resourceType: "HOTEL_RESERVATION",
    resourceId: reservationId,
    payload: {
      reservationNumber: current.reservationNumber,
      roomId,
      roomNumber: targetRoom.roomNumber,
    },
  });

  realtimeHub.broadcastToTenant(tenantId, "reservation.room_assigned", {
    reservationId,
    reservationNumber: current.reservationNumber,
    roomId,
    roomNumber: targetRoom.roomNumber,
    outletId,
  });


  return await getReservationById(tenantId, outletId, reservationId);
}
