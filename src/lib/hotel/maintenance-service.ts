import { eq, and, sql, desc, or, ilike, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  serviceRequests,
  type ServiceRequest,
  type ServiceRequestStatus,
  type ServiceRequestPriority,
  type HotelMaintenanceCategory,
} from "@/db/schema/operations";
import {
  hotelRooms,
  hotelRoomTypes,
  hotelStays,
  type HotelRoom,
  type HotelOperationalStatus,
  type HotelHousekeepingStatus,
} from "@/db/schema/hotel";
import { businessContexts } from "@/db/schema/context";
import { users, organizations, outlets } from "@/db/schema/core";
import {
  NotFoundError,
  ValidationError,
  BusinessRuleError,
} from "@/lib/api/errors";
import {
  validateMaintenanceStatusTransition,
  isMaintenanceStatus,
  isMaintenancePriority,
  isMaintenanceCategory,
} from "./maintenance-state-machines";
import {
  validateOperationalStatusTransition,
  validateHousekeepingStatusTransition,
} from "./state-machines";
import { recordAuditEvent } from "@/lib/audit";
import { realtimeHub } from "@/lib/realtime/sse";

export interface CreateMaintenanceRequestInput {
  outletId: string;
  roomId?: string; // Optional if public/property context
  category: HotelMaintenanceCategory;
  priority?: ServiceRequestPriority;
  title: string;
  description: string;
  assignedToStaffId?: string;
  operationalImpact?: "NONE" | "OUT_OF_SERVICE" | "OUT_OF_ORDER";
  notes?: string;
}

export interface MaintenanceRequestFilters {
  outletId: string;
  roomId?: string;
  status?: ServiceRequestStatus;
  priority?: ServiceRequestPriority;
  category?: HotelMaintenanceCategory;
  assignedToStaffId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface MaintenanceRequestDetail {
  requestId: string;
  tenantId: string;
  outletId: string;
  contextId: string | null;
  requestType: string;
  category: HotelMaintenanceCategory;
  priority: ServiceRequestPriority;
  status: ServiceRequestStatus;
  title: string;
  description: string;
  assignedToStaffId: string | null;
  assignedStaffName: string | null;
  assignedStaffEmail: string | null;
  reportedByStaffId: string | null;
  reportedByStaffName: string | null;
  resolutionNotes: string | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  metadata: {
    roomId?: string;
    roomNumber?: string;
    operationalImpact?: "NONE" | "OUT_OF_SERVICE" | "OUT_OF_ORDER";
    previousOperationalStatus?: string;
    reopenCount?: number;
    reopenHistory?: Array<{ reopenedAt: string; reopenedBy?: string; notes?: string }>;
    [key: string]: unknown;
  } | null;
  room: {
    roomId: string;
    roomNumber: string;
    floorNumber: string | null;
    operationalStatus: HotelOperationalStatus;
    housekeepingStatus: HotelHousekeepingStatus;
    isOccupied: boolean;
    roomTypeName: string;
  } | null;
  activeStay: {
    stayId: string;
    stayNumber: string;
    status: string;
    guestName?: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaintenanceSummary {
  outletId: string;
  totalRequests: number;
  openCount: number;
  assignedCount: number;
  inProgressCount: number;
  resolvedCount: number;
  closedCount: number;
  urgentCount: number;
  highPriorityCount: number;
  categoryBreakdown: Record<string, number>;
  roomsAffected: {
    outOfOrderCount: number;
    outOfServiceCount: number;
    maintenanceHousekeepingCount: number;
  };
}

/**
 * List Hotel Maintenance Requests with optional multi-criteria filters.
 */
export async function listMaintenanceRequests(
  tenantId: string,
  filters: MaintenanceRequestFilters
): Promise<MaintenanceRequestDetail[]> {
  const db = getDb();
  const limit = Math.min(Math.max(filters.limit || 50, 1), 100);
  const offset = Math.max(filters.offset || 0, 0);

  const conditions = [
    eq(serviceRequests.tenantId, tenantId),
    eq(serviceRequests.outletId, filters.outletId),
    eq(serviceRequests.requestType, "MAINTENANCE"),
  ];

  if (filters.status) {
    conditions.push(eq(serviceRequests.status, filters.status));
  }
  if (filters.priority) {
    conditions.push(eq(serviceRequests.priority, filters.priority));
  }
  if (filters.category) {
    conditions.push(eq(serviceRequests.category, filters.category));
  }
  if (filters.assignedToStaffId) {
    conditions.push(eq(serviceRequests.assignedToStaffId, filters.assignedToStaffId));
  }

  // Text search on title or description
  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(serviceRequests.title, term),
        ilike(serviceRequests.description, term)
      )!
    );
  }

  // Execute main query
  const records = await db
    .select({
      request: serviceRequests,
      assignedUser: {
        userId: users.userId,
        fullName: users.fullName,
        email: users.email,
      },
    })
    .from(serviceRequests)
    .leftJoin(users, eq(serviceRequests.assignedToStaffId, users.userId))
    .where(and(...conditions))
    .orderBy(
      sql`CASE 
        WHEN ${serviceRequests.priority} = 'URGENT' THEN 1
        WHEN ${serviceRequests.priority} = 'HIGH' THEN 2
        WHEN ${serviceRequests.priority} = 'NORMAL' THEN 3
        ELSE 4
      END`,
      desc(serviceRequests.createdAt)
    )
    .limit(limit)
    .offset(offset);

  if (records.length === 0) {
    return [];
  }

  // Collect context IDs to batch load rooms
  const contextIds = records
    .map((r) => r.request.contextId)
    .filter((id): id is string => Boolean(id));

  let roomMap = new Map<string, {
    roomId: string;
    roomNumber: string;
    floorNumber: string | null;
    operationalStatus: HotelOperationalStatus;
    housekeepingStatus: HotelHousekeepingStatus;
    isOccupied: boolean;
    roomTypeName: string;
    contextId: string;
  }>();

  if (contextIds.length > 0) {
    const roomRows = await db
      .select({
        room: hotelRooms,
        roomType: hotelRoomTypes,
      })
      .from(hotelRooms)
      .innerJoin(hotelRoomTypes, eq(hotelRooms.roomTypeId, hotelRoomTypes.roomTypeId))
      .where(and(eq(hotelRooms.tenantId, tenantId), inArray(hotelRooms.contextId, contextIds)));

    for (const row of roomRows) {
      roomMap.set(row.room.contextId, {
        roomId: row.room.roomId,
        roomNumber: row.room.roomNumber,
        floorNumber: row.room.floorNumber,
        operationalStatus: row.room.operationalStatus as HotelOperationalStatus,
        housekeepingStatus: row.room.housekeepingStatus as HotelHousekeepingStatus,
        isOccupied: row.room.isOccupied,
        roomTypeName: row.roomType.name,
        contextId: row.room.contextId,
      });
    }
  }

  // Filter by roomId if requested
  let results: MaintenanceRequestDetail[] = [];

  for (const { request, assignedUser } of records) {
    const room = request.contextId ? roomMap.get(request.contextId) || null : null;

    if (filters.roomId && (!room || room.roomId !== filters.roomId)) {
      continue;
    }

    results.push({
      requestId: request.requestId,
      tenantId: request.tenantId,
      outletId: request.outletId,
      contextId: request.contextId,
      requestType: request.requestType,
      category: request.category as HotelMaintenanceCategory,
      priority: request.priority as ServiceRequestPriority,
      status: request.status as ServiceRequestStatus,
      title: request.title,
      description: request.description,
      assignedToStaffId: request.assignedToStaffId,
      assignedStaffName: assignedUser?.fullName || null,
      assignedStaffEmail: assignedUser?.email || null,
      reportedByStaffId: request.reportedByStaffId,
      reportedByStaffName: null,
      resolutionNotes: request.resolutionNotes,
      resolvedAt: request.resolvedAt,
      closedAt: request.closedAt,
      metadata: (request.metadata as any) || null,
      room: room
        ? {
            roomId: room.roomId,
            roomNumber: room.roomNumber,
            floorNumber: room.floorNumber,
            operationalStatus: room.operationalStatus,
            housekeepingStatus: room.housekeepingStatus,
            isOccupied: room.isOccupied,
            roomTypeName: room.roomTypeName,
          }
        : null,
      activeStay: null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    });
  }

  return results;
}

/**
 * Get detailed Maintenance Request by ID.
 */
export async function getMaintenanceRequestById(
  tenantId: string,
  requestId: string,
  outletId?: string
): Promise<MaintenanceRequestDetail> {
  const db = getDb();

  const conditions = [
    eq(serviceRequests.requestId, requestId),
    eq(serviceRequests.tenantId, tenantId),
  ];
  if (outletId) {
    conditions.push(eq(serviceRequests.outletId, outletId));
  }

  const [row] = await db
    .select({
      request: serviceRequests,
      assignedUser: {
        userId: users.userId,
        fullName: users.fullName,
        email: users.email,
      },
    })
    .from(serviceRequests)
    .leftJoin(users, eq(serviceRequests.assignedToStaffId, users.userId))
    .where(and(...conditions))
    .limit(1);

  if (!row) {
    throw new NotFoundError(`Maintenance request with ID '${requestId}' not found.`);
  }

  const { request, assignedUser } = row;

  let roomDetail: MaintenanceRequestDetail["room"] = null;
  let activeStayDetail: MaintenanceRequestDetail["activeStay"] = null;

  if (request.contextId) {
    const [roomRow] = await db
      .select({
        room: hotelRooms,
        roomType: hotelRoomTypes,
      })
      .from(hotelRooms)
      .innerJoin(hotelRoomTypes, eq(hotelRooms.roomTypeId, hotelRoomTypes.roomTypeId))
      .where(and(eq(hotelRooms.tenantId, tenantId), eq(hotelRooms.contextId, request.contextId)))
      .limit(1);

    if (roomRow) {
      roomDetail = {
        roomId: roomRow.room.roomId,
        roomNumber: roomRow.room.roomNumber,
        floorNumber: roomRow.room.floorNumber,
        operationalStatus: roomRow.room.operationalStatus as HotelOperationalStatus,
        housekeepingStatus: roomRow.room.housekeepingStatus as HotelHousekeepingStatus,
        isOccupied: roomRow.room.isOccupied,
        roomTypeName: roomRow.roomType.name,
      };

      // Check active stay
      const [stayRow] = await db
        .select()
        .from(hotelStays)
        .where(
          and(
            eq(hotelStays.roomId, roomRow.room.roomId),
            eq(hotelStays.status, "ACTIVE")
          )
        )
        .limit(1);

      if (stayRow) {
        activeStayDetail = {
          stayId: stayRow.stayId,
          stayNumber: stayRow.stayNumber,
          status: stayRow.status,
        };
      }
    }
  }

  return {
    requestId: request.requestId,
    tenantId: request.tenantId,
    outletId: request.outletId,
    contextId: request.contextId,
    requestType: request.requestType,
    category: request.category as HotelMaintenanceCategory,
    priority: request.priority as ServiceRequestPriority,
    status: request.status as ServiceRequestStatus,
    title: request.title,
    description: request.description,
    assignedToStaffId: request.assignedToStaffId,
    assignedStaffName: assignedUser?.fullName || null,
    assignedStaffEmail: assignedUser?.email || null,
    reportedByStaffId: request.reportedByStaffId,
    reportedByStaffName: null,
    resolutionNotes: request.resolutionNotes,
    resolvedAt: request.resolvedAt,
    closedAt: request.closedAt,
    metadata: (request.metadata as any) || null,
    room: roomDetail,
    activeStay: activeStayDetail,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

/**
 * Create a new Hotel Maintenance Request.
 * Invariant: If operational impact is specified (OUT_OF_SERVICE or OUT_OF_ORDER),
 * the room operational status is transactionally updated via validated state transitions.
 * Invariant: Housekeeping status can optionally be set to MAINTENANCE during active repairs.
 */
export async function createMaintenanceRequest(
  tenantId: string,
  input: CreateMaintenanceRequestInput,
  userId?: string
): Promise<MaintenanceRequestDetail> {
  const db = getDb();

  if (!input.title || !input.title.trim()) {
    throw new ValidationError("Maintenance request title is required.");
  }
  if (!input.description || !input.description.trim()) {
    throw new ValidationError("Maintenance request description is required.");
  }
  if (!isMaintenanceCategory(input.category)) {
    throw new ValidationError(`Invalid maintenance category '${input.category}'.`);
  }
  const priority: ServiceRequestPriority = input.priority || "NORMAL";
  if (!isMaintenancePriority(priority)) {
    throw new ValidationError(`Invalid maintenance priority '${priority}'.`);
  }

  const operationalImpact = input.operationalImpact || "NONE";

  const { requestId, outletId } = await db.transaction(async (tx) => {
    let contextId: string | null = null;
    let roomRecord: HotelRoom | null = null;

    if (input.roomId) {
      // 1. Lock room row
      const [room] = await tx
        .select()
        .from(hotelRooms)
        .where(
          and(
            eq(hotelRooms.roomId, input.roomId),
            eq(hotelRooms.tenantId, tenantId),
            eq(hotelRooms.outletId, input.outletId)
          )
        )
        .for("update");

      if (!room) {
        throw new NotFoundError(
          `Room with ID '${input.roomId}' not found in property '${input.outletId}'.`
        );
      }
      if (!room.isActive) {
        throw new BusinessRuleError(`Room '${room.roomNumber}' is inactive.`);
      }

      contextId = room.contextId;
      roomRecord = room;

      // 2. Evaluate operational impact
      if (operationalImpact === "OUT_OF_ORDER") {
        validateOperationalStatusTransition(
          room.operationalStatus as HotelOperationalStatus,
          "OUT_OF_ORDER"
        );

        await tx
          .update(hotelRooms)
          .set({
            operationalStatus: "OUT_OF_ORDER",
            updatedAt: new Date(),
          })
          .where(eq(hotelRooms.roomId, room.roomId));

        await recordAuditEvent({
          tenantId,
          userId,
          action: "room.status_changed",
          resourceType: "hotel_room",
          resourceId: room.roomId,
          payload: {
            roomId: room.roomId,
            roomNumber: room.roomNumber,
            fromStatus: room.operationalStatus,
            toStatus: "OUT_OF_ORDER",
            reason: `Maintenance request created: ${input.title.trim()}`,
          },
        });

        realtimeHub.broadcastToTenant(tenantId, "room.status_changed", {
          roomId: room.roomId,
          roomNumber: room.roomNumber,
          operationalStatus: "OUT_OF_ORDER",
        });
      } else if (operationalImpact === "OUT_OF_SERVICE") {
        validateOperationalStatusTransition(
          room.operationalStatus as HotelOperationalStatus,
          "OUT_OF_SERVICE"
        );

        await tx
          .update(hotelRooms)
          .set({
            operationalStatus: "OUT_OF_SERVICE",
            updatedAt: new Date(),
          })
          .where(eq(hotelRooms.roomId, room.roomId));

        await recordAuditEvent({
          tenantId,
          userId,
          action: "room.status_changed",
          resourceType: "hotel_room",
          resourceId: room.roomId,
          payload: {
            roomId: room.roomId,
            roomNumber: room.roomNumber,
            fromStatus: room.operationalStatus,
            toStatus: "OUT_OF_SERVICE",
            reason: `Maintenance request created: ${input.title.trim()}`,
          },
        });

        realtimeHub.broadcastToTenant(tenantId, "room.status_changed", {
          roomId: room.roomId,
          roomNumber: room.roomNumber,
          operationalStatus: "OUT_OF_SERVICE",
        });
      }
    }

    const initialStatus: ServiceRequestStatus = input.assignedToStaffId ? "ASSIGNED" : "OPEN";

    // 3. Create service_requests record
    const [created] = await tx
      .insert(serviceRequests)
      .values({
        tenantId,
        outletId: input.outletId,
        contextId,
        requestType: "MAINTENANCE",
        category: input.category,
        priority,
        status: initialStatus,
        title: input.title.trim(),
        description: input.description.trim(),
        assignedToStaffId: input.assignedToStaffId || null,
        reportedByStaffId: userId || null,
        metadata: {
          roomId: roomRecord?.roomId || null,
          roomNumber: roomRecord?.roomNumber || null,
          operationalImpact,
          previousOperationalStatus: roomRecord?.operationalStatus || null,
          notes: input.notes?.trim() || null,
        },
      })
      .returning();

    // 4. Record audit event
    await recordAuditEvent({
      tenantId,
      userId,
      action: "maintenance.request_created",
      resourceType: "service_request",
      resourceId: created.requestId,
      payload: {
        requestId: created.requestId,
        category: input.category,
        priority,
        status: initialStatus,
        roomId: roomRecord?.roomId || null,
        roomNumber: roomRecord?.roomNumber || null,
        operationalImpact,
      },
    });

    // 5. Broadcast realtime SSE
    realtimeHub.broadcastToTenant(tenantId, "maintenance.request_created", {
      requestId: created.requestId,
      outletId: input.outletId,
      category: input.category,
      priority,
      status: initialStatus,
      roomId: roomRecord?.roomId || null,
      roomNumber: roomRecord?.roomNumber || null,
    });

    return { requestId: created.requestId, outletId: input.outletId };
  });

  return getMaintenanceRequestById(tenantId, requestId, outletId);
}

/**
 * Assign Staff Member to Maintenance Request.
 */
export async function assignMaintenanceRequest(
  tenantId: string,
  requestId: string,
  assignedToStaffId: string | null,
  userId?: string
): Promise<MaintenanceRequestDetail> {
  const db = getDb();

  const outletId = await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.requestId, requestId),
          eq(serviceRequests.tenantId, tenantId)
        )
      )
      .for("update");

    if (!request) {
      throw new NotFoundError(`Maintenance request with ID '${requestId}' not found.`);
    }

    if (request.status === "CLOSED" || request.status === "CANCELLED") {
      throw new BusinessRuleError(
        `Cannot assign a maintenance request in terminal or closed state '${request.status}'.`
      );
    }

    const nextStatus: ServiceRequestStatus = assignedToStaffId
      ? request.status === "OPEN"
        ? "ASSIGNED"
        : (request.status as ServiceRequestStatus)
      : request.status === "ASSIGNED"
      ? "OPEN"
      : (request.status as ServiceRequestStatus);

    await tx
      .update(serviceRequests)
      .set({
        assignedToStaffId,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(serviceRequests.requestId, requestId));

    await recordAuditEvent({
      tenantId,
      userId,
      action: "maintenance.request_assigned",
      resourceType: "service_request",
      resourceId: requestId,
      payload: {
        requestId,
        assignedToStaffId,
        previousStatus: request.status,
        newStatus: nextStatus,
      },
    });

    realtimeHub.broadcastToTenant(tenantId, "maintenance.request_assigned", {
      requestId,
      assignedToStaffId,
      status: nextStatus,
    });

    return request.outletId;
  });

  return getMaintenanceRequestById(tenantId, requestId, outletId);
}

/**
 * Start Work on Maintenance Request.
 * Transitions status: OPEN/ASSIGNED -> IN_PROGRESS.
 */
export async function startMaintenanceRequest(
  tenantId: string,
  requestId: string,
  userId?: string
): Promise<MaintenanceRequestDetail> {
  const db = getDb();

  const outletId = await db.transaction(async (tx) => {
    // 1. Lock request row
    const [request] = await tx
      .select()
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.requestId, requestId),
          eq(serviceRequests.tenantId, tenantId)
        )
      )
      .for("update");

    if (!request) {
      throw new NotFoundError(`Maintenance request with ID '${requestId}' not found.`);
    }

    if (request.status === "IN_PROGRESS") {
      throw new BusinessRuleError("Maintenance request is already in progress.");
    }

    // 2. Validate transition
    validateMaintenanceStatusTransition(
      request.status as ServiceRequestStatus,
      "IN_PROGRESS"
    );

    // 3. Update request
    const updatePayload: Record<string, unknown> = {
      status: "IN_PROGRESS",
      updatedAt: new Date(),
    };
    if (!request.assignedToStaffId && userId) {
      updatePayload.assignedToStaffId = userId;
    }

    await tx
      .update(serviceRequests)
      .set(updatePayload)
      .where(eq(serviceRequests.requestId, requestId));

    await recordAuditEvent({
      tenantId,
      userId,
      action: "maintenance.request_started",
      resourceType: "service_request",
      resourceId: requestId,
      payload: {
        requestId,
        assignedToStaffId: updatePayload.assignedToStaffId || request.assignedToStaffId,
      },
    });

    realtimeHub.broadcastToTenant(tenantId, "maintenance.request_started", {
      requestId,
      status: "IN_PROGRESS",
    });

    return request.outletId;
  });

  return getMaintenanceRequestById(tenantId, requestId, outletId);
}

export interface ResolveMaintenanceRequestInput {
  resolutionNotes: string;
  restoreRoomOperationalStatus?: "AVAILABLE" | "OUT_OF_SERVICE" | "OUT_OF_ORDER" | "KEEP_CURRENT";
}

/**
 * Resolve Maintenance Request.
 * Invariant: Transitions request status: IN_PROGRESS -> RESOLVED.
 * Invariant: Room operational restoration is strictly transactional and respects active occupancy.
 * Invariant: Restoring room to operational availability does NOT bypass housekeeping (housekeeping remains DIRTY/MAINTENANCE).
 */
export async function resolveMaintenanceRequest(
  tenantId: string,
  requestId: string,
  input: ResolveMaintenanceRequestInput,
  userId?: string
): Promise<MaintenanceRequestDetail> {
  const db = getDb();

  if (!input.resolutionNotes || !input.resolutionNotes.trim()) {
    throw new ValidationError("Resolution notes are required when resolving a maintenance request.");
  }

  const restoreTarget = input.restoreRoomOperationalStatus || "AVAILABLE";

  const outletId = await db.transaction(async (tx) => {
    // 1. Lock request row
    const [request] = await tx
      .select()
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.requestId, requestId),
          eq(serviceRequests.tenantId, tenantId)
        )
      )
      .for("update");

    if (!request) {
      throw new NotFoundError(`Maintenance request with ID '${requestId}' not found.`);
    }

    if (request.status === "RESOLVED") {
      throw new BusinessRuleError("Maintenance request is already resolved.");
    }

    validateMaintenanceStatusTransition(
      request.status as ServiceRequestStatus,
      "RESOLVED"
    );

    // 2. Handle room operational restoration if context exists
    if (request.contextId && restoreTarget !== "KEEP_CURRENT") {
      const [room] = await tx
        .select()
        .from(hotelRooms)
        .where(
          and(
            eq(hotelRooms.tenantId, tenantId),
            eq(hotelRooms.contextId, request.contextId)
          )
        )
        .for("update");

      if (room) {
        if (restoreTarget === "AVAILABLE") {
          // Check occupancy: An occupied room cannot be set to AVAILABLE
          if (room.isOccupied) {
            throw new BusinessRuleError(
              `Cannot restore room '${room.roomNumber}' to AVAILABLE because it is currently marked OCCUPIED.`
            );
          }

          // Check active stays
          const activeStays = await tx
            .select()
            .from(hotelStays)
            .where(
              and(
                eq(hotelStays.roomId, room.roomId),
                eq(hotelStays.status, "ACTIVE")
              )
            );

          if (activeStays.length > 0) {
            throw new BusinessRuleError(
              `Cannot restore room '${room.roomNumber}' to AVAILABLE because active stay '${activeStays[0].stayNumber}' is in-house.`
            );
          }

          if (room.operationalStatus !== "AVAILABLE") {
            validateOperationalStatusTransition(
              room.operationalStatus as HotelOperationalStatus,
              "AVAILABLE"
            );

            // Housekeeping state: If room housekeeping was MAINTENANCE, transition to DIRTY
            let nextHkStatus = room.housekeepingStatus;
            if (room.housekeepingStatus === "MAINTENANCE") {
              validateHousekeepingStatusTransition("MAINTENANCE", "DIRTY");
              nextHkStatus = "DIRTY";
            }

            await tx
              .update(hotelRooms)
              .set({
                operationalStatus: "AVAILABLE",
                housekeepingStatus: nextHkStatus,
                updatedAt: new Date(),
              })
              .where(eq(hotelRooms.roomId, room.roomId));

            await recordAuditEvent({
              tenantId,
              userId,
              action: "room.status_changed",
              resourceType: "hotel_room",
              resourceId: room.roomId,
              payload: {
                roomId: room.roomId,
                roomNumber: room.roomNumber,
                fromOperationalStatus: room.operationalStatus,
                toOperationalStatus: "AVAILABLE",
                housekeepingStatus: nextHkStatus,
                reason: `Maintenance resolved: ${input.resolutionNotes.trim()}`,
              },
            });

            realtimeHub.broadcastToTenant(tenantId, "room.status_changed", {
              roomId: room.roomId,
              roomNumber: room.roomNumber,
              operationalStatus: "AVAILABLE",
              housekeepingStatus: nextHkStatus,
            });
          }
        }
      }
    }

    // 3. Update request to RESOLVED
    await tx
      .update(serviceRequests)
      .set({
        status: "RESOLVED",
        resolutionNotes: input.resolutionNotes.trim(),
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(serviceRequests.requestId, requestId));

    await recordAuditEvent({
      tenantId,
      userId,
      action: "maintenance.request_resolved",
      resourceType: "service_request",
      resourceId: requestId,
      payload: {
        requestId,
        resolutionNotes: input.resolutionNotes.trim(),
        restoreTarget,
      },
    });

    realtimeHub.broadcastToTenant(tenantId, "maintenance.request_resolved", {
      requestId,
      status: "RESOLVED",
    });

    return request.outletId;
  });

  return getMaintenanceRequestById(tenantId, requestId, outletId);
}

/**
 * Close Maintenance Request.
 * Terminal transition: RESOLVED -> CLOSED.
 */
export async function closeMaintenanceRequest(
  tenantId: string,
  requestId: string,
  userId?: string
): Promise<MaintenanceRequestDetail> {
  const db = getDb();

  const outletId = await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.requestId, requestId),
          eq(serviceRequests.tenantId, tenantId)
        )
      )
      .for("update");

    if (!request) {
      throw new NotFoundError(`Maintenance request with ID '${requestId}' not found.`);
    }

    if (request.status === "CLOSED") {
      throw new BusinessRuleError("Maintenance request is already closed.");
    }

    validateMaintenanceStatusTransition(
      request.status as ServiceRequestStatus,
      "CLOSED"
    );

    await tx
      .update(serviceRequests)
      .set({
        status: "CLOSED",
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(serviceRequests.requestId, requestId));

    await recordAuditEvent({
      tenantId,
      userId,
      action: "maintenance.request_closed",
      resourceType: "service_request",
      resourceId: requestId,
      payload: {
        requestId,
      },
    });

    realtimeHub.broadcastToTenant(tenantId, "maintenance.request_closed", {
      requestId,
      status: "CLOSED",
    });

    return request.outletId;
  });

  return getMaintenanceRequestById(tenantId, requestId, outletId);
}

/**
 * Reopen a Resolved or Closed Maintenance Request.
 */
export async function reopenMaintenanceRequest(
  tenantId: string,
  requestId: string,
  input: { notes?: string } = {},
  userId?: string
): Promise<MaintenanceRequestDetail> {
  const db = getDb();

  const outletId = await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.requestId, requestId),
          eq(serviceRequests.tenantId, tenantId)
        )
      )
      .for("update");

    if (!request) {
      throw new NotFoundError(`Maintenance request with ID '${requestId}' not found.`);
    }

    validateMaintenanceStatusTransition(
      request.status as ServiceRequestStatus,
      "OPEN"
    );

    const prevMeta = (request.metadata as Record<string, unknown>) || {};
    const reopenHistory = Array.isArray(prevMeta.reopenHistory) ? prevMeta.reopenHistory : [];
    reopenHistory.push({
      reopenedAt: new Date().toISOString(),
      reopenedBy: userId,
      notes: input.notes?.trim() || "Reopened for further maintenance work.",
    });

    const updatedMetadata = {
      ...prevMeta,
      reopenCount: Number(prevMeta.reopenCount || 0) + 1,
      reopenHistory,
    };

    await tx
      .update(serviceRequests)
      .set({
        status: "OPEN",
        resolvedAt: null,
        closedAt: null,
        metadata: updatedMetadata,
        updatedAt: new Date(),
      })
      .where(eq(serviceRequests.requestId, requestId));

    await recordAuditEvent({
      tenantId,
      userId,
      action: "maintenance.request_reopened",
      resourceType: "service_request",
      resourceId: requestId,
      payload: {
        requestId,
        previousStatus: request.status,
        notes: input.notes?.trim() || null,
      },
    });

    realtimeHub.broadcastToTenant(tenantId, "maintenance.request_reopened", {
      requestId,
      status: "OPEN",
    });

    return request.outletId;
  });

  return getMaintenanceRequestById(tenantId, requestId, outletId);
}

/**
 * Get Aggregated Hotel Maintenance KPIs and Room Impact Summary.
 */
export async function getMaintenanceSummary(
  tenantId: string,
  outletId: string
): Promise<MaintenanceSummary> {
  const db = getDb();

  const requests = await db
    .select({
      status: serviceRequests.status,
      priority: serviceRequests.priority,
      category: serviceRequests.category,
    })
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.tenantId, tenantId),
        eq(serviceRequests.outletId, outletId),
        eq(serviceRequests.requestType, "MAINTENANCE")
      )
    );

  let openCount = 0;
  let assignedCount = 0;
  let inProgressCount = 0;
  let resolvedCount = 0;
  let closedCount = 0;
  let urgentCount = 0;
  let highPriorityCount = 0;
  const categoryBreakdown: Record<string, number> = {};

  for (const r of requests) {
    if (r.status === "OPEN") openCount++;
    else if (r.status === "ASSIGNED") assignedCount++;
    else if (r.status === "IN_PROGRESS") inProgressCount++;
    else if (r.status === "RESOLVED") resolvedCount++;
    else if (r.status === "CLOSED") closedCount++;

    if (r.priority === "URGENT") urgentCount++;
    else if (r.priority === "HIGH") highPriorityCount++;

    categoryBreakdown[r.category] = (categoryBreakdown[r.category] || 0) + 1;
  }

  // Count rooms in property that are OUT_OF_ORDER, OUT_OF_SERVICE, or MAINTENANCE
  const rooms = await db
    .select({
      operationalStatus: hotelRooms.operationalStatus,
      housekeepingStatus: hotelRooms.housekeepingStatus,
    })
    .from(hotelRooms)
    .where(
      and(
        eq(hotelRooms.tenantId, tenantId),
        eq(hotelRooms.outletId, outletId),
        eq(hotelRooms.isActive, true)
      )
    );

  let outOfOrderCount = 0;
  let outOfServiceCount = 0;
  let maintenanceHousekeepingCount = 0;

  for (const rm of rooms) {
    if (rm.operationalStatus === "OUT_OF_ORDER") outOfOrderCount++;
    if (rm.operationalStatus === "OUT_OF_SERVICE") outOfServiceCount++;
    if (rm.housekeepingStatus === "MAINTENANCE") maintenanceHousekeepingCount++;
  }

  return {
    outletId,
    totalRequests: requests.length,
    openCount,
    assignedCount,
    inProgressCount,
    resolvedCount,
    closedCount,
    urgentCount,
    highPriorityCount,
    categoryBreakdown,
    roomsAffected: {
      outOfOrderCount,
      outOfServiceCount,
      maintenanceHousekeepingCount,
    },
  };
}
