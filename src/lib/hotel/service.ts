import { eq, and, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { outlets } from "@/db/schema/core";
import { businessContexts } from "@/db/schema/context";
import {
  hotelRoomTypes,
  hotelRooms,
  type HotelOperationalStatus,
  type HotelHousekeepingStatus,
  type HotelRoomType,
  type HotelRoom,
} from "@/db/schema/hotel";
import { ValidationError, NotFoundError, BusinessRuleError } from "@/lib/api/errors";
import {
  validateOperationalStatusTransition,
  validateHousekeepingStatusTransition,
} from "./state-machines";
import { recordAuditEvent } from "@/lib/audit";

export interface HotelPropertySummary {
  outletId: string;
  name: string;
  code: string;
  verticalType: string;
  timezone: string;
  currency: string;
  isActive: boolean;
  createdAt: Date;
}

export interface CreateHotelPropertyInput {
  name: string;
  code: string;
  timezone?: string;
  currency?: string;
  operatingConfig?: Record<string, unknown>;
}

export interface CreateRoomTypeInput {
  code: string;
  name: string;
  description?: string;
  baseOccupancy?: number;
  maxOccupancy?: number;
  baseRate: string | number;
}

export interface UpdateRoomTypeInput {
  name?: string;
  description?: string;
  baseOccupancy?: number;
  maxOccupancy?: number;
  baseRate?: string | number;
  isActive?: boolean;
}

export interface CreateRoomInput {
  roomTypeId: string;
  roomNumber: string;
  floorNumber?: string;
  operationalStatus?: HotelOperationalStatus;
  housekeepingStatus?: HotelHousekeepingStatus;
}

export interface UpdateRoomStatusInput {
  operationalStatus?: HotelOperationalStatus;
  housekeepingStatus?: HotelHousekeepingStatus;
  isOccupied?: boolean;
  notes?: string;
}

export interface HotelDashboardMetrics {
  totalRooms: number;
  availableRooms: number;
  occupiedRooms: number;
  reservedRooms: number;
  outOfServiceRooms: number;
  occupancyRatePct: number;
  housekeepingBreakdown: {
    clean: number;
    dirty: number;
    inspected: number;
    cleaning: number;
    maintenance: number;
  };
  roomTypeBreakdown: Array<{
    roomTypeId: string;
    name: string;
    code: string;
    total: number;
    available: number;
    baseRate: string;
  }>;
}

/**
 * List all Hotel Properties (outlets with verticalType = 'HOTEL') for a tenant
 */
export async function listHotelProperties(tenantId: string): Promise<HotelPropertySummary[]> {
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
    .where(and(eq(outlets.tenantId, tenantId), eq(outlets.verticalType, "HOTEL")))
    .orderBy(outlets.name);

  return rows;
}

/**
 * Create a new Hotel Property
 */
export async function createHotelProperty(
  tenantId: string,
  input: CreateHotelPropertyInput,
  userId?: string
): Promise<HotelPropertySummary> {
  const db = getDb();

  // Validate unique outlet code per tenant
  const existing = await db
    .select({ outletId: outlets.outletId })
    .from(outlets)
    .where(and(eq(outlets.tenantId, tenantId), eq(outlets.code, input.code)))
    .limit(1);

  if (existing.length > 0) {
    throw new BusinessRuleError(`A property with code '${input.code}' already exists.`);
  }

  const [created] = await db
    .insert(outlets)
    .values({
      tenantId,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      verticalType: "HOTEL",
      timezone: input.timezone || "Asia/Kolkata",
      currency: input.currency || "INR",
      isActive: true,
    })
    .returning();

  await recordAuditEvent({
    tenantId,
    userId,
    action: "HOTEL_PROPERTY_CREATED",
    resourceType: "OUTLET",
    resourceId: created.outletId,
    payload: { name: created.name, code: created.code },
  });

  return {
    outletId: created.outletId,
    name: created.name,
    code: created.code,
    verticalType: created.verticalType,
    timezone: created.timezone,
    currency: created.currency,
    isActive: created.isActive,
    createdAt: created.createdAt,
  };
}

/**
 * List Room Types for a Hotel Property
 */
export async function listRoomTypes(tenantId: string, outletId: string): Promise<HotelRoomType[]> {
  const db = getDb();
  return await db
    .select()
    .from(hotelRoomTypes)
    .where(and(eq(hotelRoomTypes.tenantId, tenantId), eq(hotelRoomTypes.outletId, outletId)))
    .orderBy(hotelRoomTypes.name);
}

/**
 * Create a Room Type
 */
export async function createRoomType(
  tenantId: string,
  outletId: string,
  input: CreateRoomTypeInput,
  userId?: string
): Promise<HotelRoomType> {
  const db = getDb();

  const baseOcc = input.baseOccupancy ?? 2;
  const maxOcc = input.maxOccupancy ?? 3;
  if (baseOcc < 1) throw new ValidationError("Base occupancy must be at least 1.");
  if (maxOcc < baseOcc) throw new ValidationError("Max occupancy must be greater than or equal to base occupancy.");
  const rate = Number(input.baseRate);
  if (isNaN(rate) || rate < 0) throw new ValidationError("Base rate must be a non-negative number.");

  // Check code uniqueness within outlet
  const existing = await db
    .select({ roomTypeId: hotelRoomTypes.roomTypeId })
    .from(hotelRoomTypes)
    .where(and(eq(hotelRoomTypes.outletId, outletId), eq(hotelRoomTypes.code, input.code.trim().toUpperCase())))
    .limit(1);

  if (existing.length > 0) {
    throw new BusinessRuleError(`Room type with code '${input.code}' already exists in this property.`);
  }

  const [created] = await db
    .insert(hotelRoomTypes)
    .values({
      tenantId,
      outletId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      baseOccupancy: baseOcc,
      maxOccupancy: maxOcc,
      baseRate: rate.toFixed(4),
      isActive: true,
    })
    .returning();

  await recordAuditEvent({
    tenantId,
    userId,
    action: "HOTEL_ROOM_TYPE_CREATED",
    resourceType: "HOTEL_ROOM_TYPE",
    resourceId: created.roomTypeId,
    payload: { code: created.code, name: created.name, rate: created.baseRate },
  });

  return created;
}

/**
 * Update Room Type
 */
export async function updateRoomType(
  tenantId: string,
  outletId: string,
  roomTypeId: string,
  input: UpdateRoomTypeInput,
  userId?: string
): Promise<HotelRoomType> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(hotelRoomTypes)
    .where(
      and(
        eq(hotelRoomTypes.roomTypeId, roomTypeId),
        eq(hotelRoomTypes.tenantId, tenantId),
        eq(hotelRoomTypes.outletId, outletId)
      )
    )
    .limit(1);

  if (!existing) {
    throw new NotFoundError(`Room type with ID '${roomTypeId}' not found.`);
  }

  const updateValues: Partial<HotelRoomType> = {};
  if (input.name !== undefined) updateValues.name = input.name.trim();
  if (input.description !== undefined) updateValues.description = input.description?.trim() || null;
  if (input.baseOccupancy !== undefined) updateValues.baseOccupancy = input.baseOccupancy;
  if (input.maxOccupancy !== undefined) updateValues.maxOccupancy = input.maxOccupancy;
  if (input.baseRate !== undefined) {
    const rate = Number(input.baseRate);
    if (isNaN(rate) || rate < 0) throw new ValidationError("Base rate must be non-negative.");
    updateValues.baseRate = rate.toFixed(4);
  }
  if (input.isActive !== undefined) updateValues.isActive = input.isActive;
  updateValues.updatedAt = new Date();

  const [updated] = await db
    .update(hotelRoomTypes)
    .set(updateValues)
    .where(eq(hotelRoomTypes.roomTypeId, roomTypeId))
    .returning();

  await recordAuditEvent({
    tenantId,
    userId,
    action: "HOTEL_ROOM_TYPE_UPDATED",
    resourceType: "HOTEL_ROOM_TYPE",
    resourceId: roomTypeId,
    payload: updateValues as Record<string, unknown>,
  });

  return updated;
}

/**
 * List Rooms with Room Type and Context details
 */
export async function listRooms(
  tenantId: string,
  outletId: string,
  filters?: {
    floorNumber?: string;
    operationalStatus?: string;
    housekeepingStatus?: string;
    roomTypeId?: string;
  }
) {
  const db = getDb();

  const conditions = [
    eq(hotelRooms.tenantId, tenantId),
    eq(hotelRooms.outletId, outletId),
    eq(hotelRooms.isActive, true),
  ];

  if (filters?.floorNumber) {
    conditions.push(eq(hotelRooms.floorNumber, filters.floorNumber));
  }
  if (filters?.operationalStatus) {
    conditions.push(eq(hotelRooms.operationalStatus, filters.operationalStatus));
  }
  if (filters?.housekeepingStatus) {
    conditions.push(eq(hotelRooms.housekeepingStatus, filters.housekeepingStatus));
  }
  if (filters?.roomTypeId) {
    conditions.push(eq(hotelRooms.roomTypeId, filters.roomTypeId));
  }

  const rows = await db
    .select({
      roomId: hotelRooms.roomId,
      tenantId: hotelRooms.tenantId,
      outletId: hotelRooms.outletId,
      contextId: hotelRooms.contextId,
      roomTypeId: hotelRooms.roomTypeId,
      roomTypeName: hotelRoomTypes.name,
      roomTypeCode: hotelRoomTypes.code,
      baseRate: hotelRoomTypes.baseRate,
      roomNumber: hotelRooms.roomNumber,
      floorNumber: hotelRooms.floorNumber,
      operationalStatus: hotelRooms.operationalStatus,
      housekeepingStatus: hotelRooms.housekeepingStatus,
      isOccupied: hotelRooms.isOccupied,
      isActive: hotelRooms.isActive,
      createdAt: hotelRooms.createdAt,
      updatedAt: hotelRooms.updatedAt,
    })
    .from(hotelRooms)
    .innerJoin(hotelRoomTypes, eq(hotelRooms.roomTypeId, hotelRoomTypes.roomTypeId))
    .where(and(...conditions))
    .orderBy(hotelRooms.floorNumber, hotelRooms.roomNumber);

  return rows;
}

/**
 * Create a new Hotel Room (Creates BusinessContext + HotelRoom)
 */
export async function createRoom(
  tenantId: string,
  outletId: string,
  input: CreateRoomInput,
  userId?: string
) {
  const db = getDb();

  // 1. Verify Room Type exists and belongs to this property
  const [roomType] = await db
    .select()
    .from(hotelRoomTypes)
    .where(
      and(
        eq(hotelRoomTypes.roomTypeId, input.roomTypeId),
        eq(hotelRoomTypes.tenantId, tenantId),
        eq(hotelRoomTypes.outletId, outletId)
      )
    )
    .limit(1);

  if (!roomType) {
    throw new NotFoundError(`Room type with ID '${input.roomTypeId}' does not exist in this property.`);
  }

  // 2. Verify room number uniqueness in this outlet
  const existing = await db
    .select({ roomId: hotelRooms.roomId })
    .from(hotelRooms)
    .where(and(eq(hotelRooms.outletId, outletId), eq(hotelRooms.roomNumber, input.roomNumber.trim())))
    .limit(1);

  if (existing.length > 0) {
    throw new BusinessRuleError(`Room number '${input.roomNumber}' already exists in this property.`);
  }

  const operationalStatus = input.operationalStatus || "AVAILABLE";
  const housekeepingStatus = input.housekeepingStatus || "CLEAN";

  // 3. Create canonical Business Context record
  const [context] = await db
    .insert(businessContexts)
    .values({
      tenantId,
      outletId,
      contextType: "HOTEL_ROOM",
      identifier: input.roomNumber.trim(),
      displayLabel: `Room ${input.roomNumber.trim()}`,
      status: operationalStatus,
      metadata: { floorNumber: input.floorNumber, roomTypeCode: roomType.code },
      isActive: true,
    })
    .returning();

  // 4. Create Hotel Room entity
  const [room] = await db
    .insert(hotelRooms)
    .values({
      tenantId,
      outletId,
      contextId: context.contextId,
      roomTypeId: input.roomTypeId,
      roomNumber: input.roomNumber.trim(),
      floorNumber: input.floorNumber?.trim() || null,
      operationalStatus,
      housekeepingStatus,
      isOccupied: operationalStatus === "OCCUPIED",
      isActive: true,
    })
    .returning();

  await recordAuditEvent({
    tenantId,
    userId,
    action: "HOTEL_ROOM_CREATED",
    resourceType: "HOTEL_ROOM",
    resourceId: room.roomId,
    payload: {
      roomNumber: room.roomNumber,
      roomTypeCode: roomType.code,
      contextId: context.contextId,
      operationalStatus,
      housekeepingStatus,
    },
  });

  return {
    ...room,
    roomTypeName: roomType.name,
    roomTypeCode: roomType.code,
    baseRate: roomType.baseRate,
  };
}

/**
 * Update Room Status with strict state machine validation and auditing
 */
export async function updateRoomStatus(
  tenantId: string,
  outletId: string,
  roomId: string,
  input: UpdateRoomStatusInput,
  userId?: string
) {
  const db = getDb();

  const [currentRoom] = await db
    .select()
    .from(hotelRooms)
    .where(
      and(
        eq(hotelRooms.roomId, roomId),
        eq(hotelRooms.tenantId, tenantId),
        eq(hotelRooms.outletId, outletId)
      )
    )
    .limit(1);

  if (!currentRoom) {
    throw new NotFoundError(`Room with ID '${roomId}' not found.`);
  }

  const updates: Partial<HotelRoom> = {};

  // Validate operational status transition
  if (input.operationalStatus && input.operationalStatus !== currentRoom.operationalStatus) {
    validateOperationalStatusTransition(
      currentRoom.operationalStatus as HotelOperationalStatus,
      input.operationalStatus
    );
    updates.operationalStatus = input.operationalStatus;
    updates.isOccupied = input.operationalStatus === "OCCUPIED";
  }

  // Validate housekeeping status transition
  if (input.housekeepingStatus && input.housekeepingStatus !== currentRoom.housekeepingStatus) {
    validateHousekeepingStatusTransition(
      currentRoom.housekeepingStatus as HotelHousekeepingStatus,
      input.housekeepingStatus
    );
    updates.housekeepingStatus = input.housekeepingStatus;
  }

  if (input.isOccupied !== undefined) {
    updates.isOccupied = input.isOccupied;
  }

  updates.updatedAt = new Date();

  // Update hotel room
  const [updated] = await db
    .update(hotelRooms)
    .set(updates)
    .where(eq(hotelRooms.roomId, roomId))
    .returning();

  // Mirror operational status to business context
  if (updates.operationalStatus) {
    await db
      .update(businessContexts)
      .set({
        status: updates.operationalStatus,
        updatedAt: new Date(),
      })
      .where(eq(businessContexts.contextId, currentRoom.contextId));
  }

  await recordAuditEvent({
    tenantId,
    userId,
    action: "HOTEL_ROOM_STATUS_CHANGED",
    resourceType: "HOTEL_ROOM",
    resourceId: roomId,
    payload: {
      previousOperationalStatus: currentRoom.operationalStatus,
      newOperationalStatus: updated.operationalStatus,
      previousHousekeepingStatus: currentRoom.housekeepingStatus,
      newHousekeepingStatus: updated.housekeepingStatus,
      notes: input.notes,
    },
  });

  return updated;
}

/**
 * Calculate Hotel Dashboard Operational Metrics directly from PostgreSQL
 */
export async function getHotelDashboardMetrics(
  tenantId: string,
  outletId: string
): Promise<HotelDashboardMetrics> {
  const db = getDb();

  const rooms = await db
    .select({
      roomId: hotelRooms.roomId,
      roomTypeId: hotelRooms.roomTypeId,
      operationalStatus: hotelRooms.operationalStatus,
      housekeepingStatus: hotelRooms.housekeepingStatus,
      isOccupied: hotelRooms.isOccupied,
      roomTypeName: hotelRoomTypes.name,
      roomTypeCode: hotelRoomTypes.code,
      baseRate: hotelRoomTypes.baseRate,
    })
    .from(hotelRooms)
    .innerJoin(hotelRoomTypes, eq(hotelRooms.roomTypeId, hotelRoomTypes.roomTypeId))
    .where(
      and(
        eq(hotelRooms.tenantId, tenantId),
        eq(hotelRooms.outletId, outletId),
        eq(hotelRooms.isActive, true)
      )
    );

  const totalRooms = rooms.length;
  let occupiedRooms = 0;
  let reservedRooms = 0;
  let outOfServiceRooms = 0;
  let availableRooms = 0;

  const housekeepingBreakdown = {
    clean: 0,
    dirty: 0,
    inspected: 0,
    cleaning: 0,
    maintenance: 0,
  };

  const typeMap = new Map<string, { roomTypeId: string; name: string; code: string; total: number; available: number; baseRate: string }>();

  for (const r of rooms) {
    // Operational tallies
    if (r.operationalStatus === "OCCUPIED" || r.isOccupied) {
      occupiedRooms++;
    } else if (r.operationalStatus === "RESERVED") {
      reservedRooms++;
    } else if (r.operationalStatus === "OUT_OF_SERVICE" || r.operationalStatus === "OUT_OF_ORDER") {
      outOfServiceRooms++;
    } else if (r.operationalStatus === "AVAILABLE") {
      availableRooms++;
    }

    // Housekeeping tallies
    const hk = r.housekeepingStatus.toLowerCase() as keyof typeof housekeepingBreakdown;
    if (housekeepingBreakdown[hk] !== undefined) {
      housekeepingBreakdown[hk]++;
    }

    // Room type tallies
    if (!typeMap.has(r.roomTypeId)) {
      typeMap.set(r.roomTypeId, {
        roomTypeId: r.roomTypeId,
        name: r.roomTypeName,
        code: r.roomTypeCode,
        total: 0,
        available: 0,
        baseRate: r.baseRate,
      });
    }
    const typeEntry = typeMap.get(r.roomTypeId)!;
    typeEntry.total++;
    if (r.operationalStatus === "AVAILABLE" && (r.housekeepingStatus === "CLEAN" || r.housekeepingStatus === "INSPECTED")) {
      typeEntry.available++;
    }
  }

  const occupancyRatePct = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  return {
    totalRooms,
    availableRooms,
    occupiedRooms,
    reservedRooms,
    outOfServiceRooms,
    occupancyRatePct,
    housekeepingBreakdown,
    roomTypeBreakdown: Array.from(typeMap.values()),
  };
}
