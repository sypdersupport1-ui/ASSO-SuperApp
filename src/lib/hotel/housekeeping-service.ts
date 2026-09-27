import { eq, and, sql, desc, or, ilike, inArray, gte } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  hotelHousekeepingTasks,
  hotelRooms,
  hotelRoomTypes,
  hotelStays,
  type HotelHousekeepingTask,
  type HotelHousekeepingTaskStatus,
  type HotelHousekeepingTaskType,
  type HotelHousekeepingTaskPriority,
  type HotelHousekeepingStatus,
  type HotelOperationalStatus,
} from "@/db/schema/hotel";
import { users, organizations, outlets } from "@/db/schema/core";
import {
  NotFoundError,
  ValidationError,
  BusinessRuleError,
} from "@/lib/api/errors";
import {
  validateHousekeepingTaskStatusTransition,
  isHousekeepingTaskStatus,
  isHousekeepingTaskType,
  isHousekeepingTaskPriority,
} from "./housekeeping-state-machines";
import {
  validateHousekeepingStatusTransition,
} from "./state-machines";
import { recordAuditEvent } from "@/lib/audit";
import { realtimeHub } from "@/lib/realtime/sse";
import { listRooms } from "./service";

export interface CreateHousekeepingTaskInput {
  outletId: string;
  roomId: string;
  taskType?: HotelHousekeepingTaskType;
  triggerSource?: string;
  assignedStaffId?: string;
  priority?: HotelHousekeepingTaskPriority;
  notes?: string;
  scheduledAt?: string;
}

export interface HousekeepingTaskFilters {
  outletId: string;
  roomId?: string;
  status?: HotelHousekeepingTaskStatus;
  assignedStaffId?: string;
  priority?: HotelHousekeepingTaskPriority;
  taskType?: HotelHousekeepingTaskType;
  floorNumber?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface HousekeepingTaskDetail {
  taskId: string;
  tenantId: string;
  outletId: string;
  roomId: string;
  roomNumber: string;
  floorNumber: string | null;
  roomTypeName: string;
  operationalStatus: string;
  housekeepingStatus: string;
  taskType: HotelHousekeepingTaskType;
  triggerSource: string;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  assignedStaffEmail: string | null;
  status: HotelHousekeepingTaskStatus;
  priority: HotelHousekeepingTaskPriority;
  notes: string | null;
  inspectionNotes: string | null;
  inspectedBy: string | null;
  inspectedByName: string | null;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  inspectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isOccupied: boolean;
  activeStayNumber?: string | null;
}

export interface HousekeepingSummary {
  taskCounts: {
    pending: number;
    assigned: number;
    inProgress: number;
    cleaned: number;
    inspectedToday: number;
    totalActive: number;
  };
  roomCounts: {
    totalRooms: number;
    clean: number;
    dirty: number;
    cleaning: number;
    inspected: number;
    maintenance: number;
    readyForOccupancy: number; // AVAILABLE + INSPECTED (or CLEAN)
    occupied: number;
    outOfService: number;
  };
}

/**
 * List Housekeeping Tasks with joined room, staff, and stay details.
 */
export async function listHousekeepingTasks(
  tenantId: string,
  filters: HousekeepingTaskFilters
): Promise<HousekeepingTaskDetail[]> {
  const db = getDb();
  const limit = Math.min(filters.limit || 50, 100);
  const offset = filters.offset || 0;

  let conditions = and(
    eq(hotelHousekeepingTasks.tenantId, tenantId),
    eq(hotelHousekeepingTasks.outletId, filters.outletId)
  );

  if (filters.roomId) {
    conditions = and(conditions, eq(hotelHousekeepingTasks.roomId, filters.roomId));
  }
  if (filters.status) {
    conditions = and(conditions, eq(hotelHousekeepingTasks.status, filters.status));
  }
  if (filters.assignedStaffId) {
    conditions = and(conditions, eq(hotelHousekeepingTasks.assignedStaffId, filters.assignedStaffId));
  }
  if (filters.priority) {
    conditions = and(conditions, eq(hotelHousekeepingTasks.priority, filters.priority));
  }
  if (filters.taskType) {
    conditions = and(conditions, eq(hotelHousekeepingTasks.taskType, filters.taskType));
  }

  // Create subqueries / joins
  const query = db
    .select({
      taskId: hotelHousekeepingTasks.taskId,
      tenantId: hotelHousekeepingTasks.tenantId,
      outletId: hotelHousekeepingTasks.outletId,
      roomId: hotelHousekeepingTasks.roomId,
      roomNumber: hotelRooms.roomNumber,
      floorNumber: hotelRooms.floorNumber,
      roomTypeName: hotelRoomTypes.name,
      operationalStatus: hotelRooms.operationalStatus,
      housekeepingStatus: hotelRooms.housekeepingStatus,
      taskType: hotelHousekeepingTasks.taskType,
      triggerSource: hotelHousekeepingTasks.triggerSource,
      assignedStaffId: hotelHousekeepingTasks.assignedStaffId,
      assignedStaffName: users.fullName,
      assignedStaffEmail: users.email,
      status: hotelHousekeepingTasks.status,
      priority: hotelHousekeepingTasks.priority,
      notes: hotelHousekeepingTasks.notes,
      inspectionNotes: hotelHousekeepingTasks.inspectionNotes,
      inspectedBy: hotelHousekeepingTasks.inspectedBy,
      scheduledAt: hotelHousekeepingTasks.scheduledAt,
      startedAt: hotelHousekeepingTasks.startedAt,
      completedAt: hotelHousekeepingTasks.completedAt,
      inspectedAt: hotelHousekeepingTasks.inspectedAt,
      createdAt: hotelHousekeepingTasks.createdAt,
      updatedAt: hotelHousekeepingTasks.updatedAt,
      isOccupied: hotelRooms.isOccupied,
    })
    .from(hotelHousekeepingTasks)
    .innerJoin(hotelRooms, eq(hotelHousekeepingTasks.roomId, hotelRooms.roomId))
    .innerJoin(hotelRoomTypes, eq(hotelRooms.roomTypeId, hotelRoomTypes.roomTypeId))
    .leftJoin(users, eq(hotelHousekeepingTasks.assignedStaffId, users.userId))
    .where(conditions)
    .orderBy(desc(hotelHousekeepingTasks.createdAt))
    .limit(limit)
    .offset(offset);

  const rawRows = await query;

  return rawRows.map((r) => ({
    ...r,
    taskType: r.taskType as HotelHousekeepingTaskType,
    status: r.status as HotelHousekeepingTaskStatus,
    priority: r.priority as HotelHousekeepingTaskPriority,
    inspectedByName: null,
  }));
}

/**
 * Get single Housekeeping Task Detail by ID.
 */
export async function getHousekeepingTaskById(
  tenantId: string,
  taskId: string,
  outletId?: string
): Promise<HousekeepingTaskDetail> {
  const db = getDb();

  const conditions = outletId
    ? and(
        eq(hotelHousekeepingTasks.taskId, taskId),
        eq(hotelHousekeepingTasks.tenantId, tenantId),
        eq(hotelHousekeepingTasks.outletId, outletId)
      )
    : and(
        eq(hotelHousekeepingTasks.taskId, taskId),
        eq(hotelHousekeepingTasks.tenantId, tenantId)
      );

  const [row] = await db
    .select({
      taskId: hotelHousekeepingTasks.taskId,
      tenantId: hotelHousekeepingTasks.tenantId,
      outletId: hotelHousekeepingTasks.outletId,
      roomId: hotelHousekeepingTasks.roomId,
      roomNumber: hotelRooms.roomNumber,
      floorNumber: hotelRooms.floorNumber,
      roomTypeName: hotelRoomTypes.name,
      operationalStatus: hotelRooms.operationalStatus,
      housekeepingStatus: hotelRooms.housekeepingStatus,
      taskType: hotelHousekeepingTasks.taskType,
      triggerSource: hotelHousekeepingTasks.triggerSource,
      assignedStaffId: hotelHousekeepingTasks.assignedStaffId,
      assignedStaffName: users.fullName,
      assignedStaffEmail: users.email,
      status: hotelHousekeepingTasks.status,
      priority: hotelHousekeepingTasks.priority,
      notes: hotelHousekeepingTasks.notes,
      inspectionNotes: hotelHousekeepingTasks.inspectionNotes,
      inspectedBy: hotelHousekeepingTasks.inspectedBy,
      scheduledAt: hotelHousekeepingTasks.scheduledAt,
      startedAt: hotelHousekeepingTasks.startedAt,
      completedAt: hotelHousekeepingTasks.completedAt,
      inspectedAt: hotelHousekeepingTasks.inspectedAt,
      createdAt: hotelHousekeepingTasks.createdAt,
      updatedAt: hotelHousekeepingTasks.updatedAt,
      isOccupied: hotelRooms.isOccupied,
    })
    .from(hotelHousekeepingTasks)
    .innerJoin(hotelRooms, eq(hotelHousekeepingTasks.roomId, hotelRooms.roomId))
    .innerJoin(hotelRoomTypes, eq(hotelRooms.roomTypeId, hotelRoomTypes.roomTypeId))
    .leftJoin(users, eq(hotelHousekeepingTasks.assignedStaffId, users.userId))
    .where(conditions)
    .limit(1);

  if (!row) {
    throw new NotFoundError(`Housekeeping task with ID '${taskId}' not found.`);
  }

  return {
    ...row,
    taskType: row.taskType as HotelHousekeepingTaskType,
    status: row.status as HotelHousekeepingTaskStatus,
    priority: row.priority as HotelHousekeepingTaskPriority,
    inspectedByName: null,
  };
}

/**
 * Create a new Housekeeping Task.
 */
export async function createHousekeepingTask(
  tenantId: string,
  input: CreateHousekeepingTaskInput,
  userId?: string
): Promise<HousekeepingTaskDetail> {
  const db = getDb();

  // Validate room
  const [room] = await db
    .select()
    .from(hotelRooms)
    .where(
      and(
        eq(hotelRooms.roomId, input.roomId),
        eq(hotelRooms.tenantId, tenantId),
        eq(hotelRooms.outletId, input.outletId)
      )
    )
    .limit(1);

  if (!room) {
    throw new NotFoundError(`Room with ID '${input.roomId}' not found in this property.`);
  }
  if (!room.isActive) {
    throw new BusinessRuleError(`Room '${room.roomNumber}' is inactive.`);
  }

  const taskType = input.taskType || "DEPARTURE_TURNOVER";
  if (!isHousekeepingTaskType(taskType)) {
    throw new ValidationError(`Invalid task type: '${taskType}'.`);
  }

  const priority = input.priority || "NORMAL";
  if (!isHousekeepingTaskPriority(priority)) {
    throw new ValidationError(`Invalid priority: '${priority}'.`);
  }

  const initialStatus: HotelHousekeepingTaskStatus = input.assignedStaffId ? "ASSIGNED" : "PENDING";

  const [created] = await db
    .insert(hotelHousekeepingTasks)
    .values({
      tenantId,
      outletId: input.outletId,
      roomId: input.roomId,
      taskType,
      triggerSource: input.triggerSource || "MANUAL",
      assignedStaffId: input.assignedStaffId || null,
      status: initialStatus,
      priority,
      notes: input.notes?.trim() || null,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    })
    .returning();

  // If manual turnover task created on a clean room, optionally update room to DIRTY
  if (taskType === "DEPARTURE_TURNOVER" && room.housekeepingStatus === "CLEAN") {
    await db
      .update(hotelRooms)
      .set({
        housekeepingStatus: "DIRTY",
        updatedAt: new Date(),
      })
      .where(eq(hotelRooms.roomId, room.roomId));
  }

  await recordAuditEvent({
    tenantId,
    userId,
    action: "housekeeping.task_created",
    resourceType: "hotel_housekeeping_task",
    resourceId: created.taskId,
    payload: {
      taskId: created.taskId,
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      taskType,
      priority,
      assignedStaffId: input.assignedStaffId,
    },
  });

  realtimeHub.broadcastToTenant(tenantId, "housekeeping.task_created", {
    taskId: created.taskId,
    outletId: input.outletId,
    roomId: room.roomId,
    roomNumber: room.roomNumber,
    taskType,
    status: initialStatus,
  });

  return getHousekeepingTaskById(tenantId, created.taskId, input.outletId);
}

/**
 * Assign Staff Member to Housekeeping Task.
 */
export async function assignHousekeepingTask(
  tenantId: string,
  taskId: string,
  assignedStaffId: string | null,
  userId?: string
): Promise<HousekeepingTaskDetail> {
  const db = getDb();

  const outletId = await db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(hotelHousekeepingTasks)
      .where(
        and(
          eq(hotelHousekeepingTasks.taskId, taskId),
          eq(hotelHousekeepingTasks.tenantId, tenantId)
        )
      )
      .for("update");

    if (!task) {
      throw new NotFoundError(`Housekeeping task with ID '${taskId}' not found.`);
    }

    if (task.status === "INSPECTED" || task.status === "CANCELLED") {
      throw new BusinessRuleError(`Cannot assign a task that is in terminal state '${task.status}'.`);
    }

    const nextStatus: HotelHousekeepingTaskStatus = assignedStaffId
      ? task.status === "PENDING"
        ? "ASSIGNED"
        : (task.status as HotelHousekeepingTaskStatus)
      : task.status === "ASSIGNED"
      ? "PENDING"
      : (task.status as HotelHousekeepingTaskStatus);

    await tx
      .update(hotelHousekeepingTasks)
      .set({
        assignedStaffId,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(hotelHousekeepingTasks.taskId, taskId));

    await recordAuditEvent({
      tenantId,
      userId,
      action: "housekeeping.task_assigned",
      resourceType: "hotel_housekeeping_task",
      resourceId: taskId,
      payload: {
        taskId,
        assignedStaffId,
        previousStatus: task.status,
        newStatus: nextStatus,
      },
    });

    realtimeHub.broadcastToTenant(tenantId, "housekeeping.task_assigned", {
      taskId,
      assignedStaffId,
      status: nextStatus,
    });

    return task.outletId;
  });

  return getHousekeepingTaskById(tenantId, taskId, outletId);
}

/**
 * Start cleaning workflow for a Housekeeping Task.
 * Invariant: updates room housekeeping status to CLEANING.
 * Invariant: respects physical operational room status (does not overwrite OCCUPIED or OUT_OF_SERVICE).
 */
export async function startHousekeepingTask(
  tenantId: string,
  taskId: string,
  userId?: string
): Promise<HousekeepingTaskDetail> {
  const db = getDb();

  const outletId = await db.transaction(async (tx) => {
    // 1. Lock task row
    const [task] = await tx
      .select()
      .from(hotelHousekeepingTasks)
      .where(
        and(
          eq(hotelHousekeepingTasks.taskId, taskId),
          eq(hotelHousekeepingTasks.tenantId, tenantId)
        )
      )
      .for("update");

    if (!task) {
      throw new NotFoundError(`Housekeeping task with ID '${taskId}' not found.`);
    }

    // 2. Validate task transition
    if (task.status === "IN_PROGRESS") {
      throw new BusinessRuleError("Housekeeping task is already in progress.");
    }

    validateHousekeepingTaskStatusTransition(
      task.status as HotelHousekeepingTaskStatus,
      "IN_PROGRESS"
    );

    // 3. Lock physical room row
    const [room] = await tx
      .select()
      .from(hotelRooms)
      .where(eq(hotelRooms.roomId, task.roomId))
      .for("update");

    if (!room) {
      throw new NotFoundError(`Room with ID '${task.roomId}' not found.`);
    }

    // 4. Update room housekeeping status to CLEANING if not already
    if (room.housekeepingStatus !== "CLEANING") {
      validateHousekeepingStatusTransition(
        room.housekeepingStatus as HotelHousekeepingStatus,
        "CLEANING"
      );

      await tx
        .update(hotelRooms)
        .set({
          housekeepingStatus: "CLEANING",
          updatedAt: new Date(),
        })
        .where(eq(hotelRooms.roomId, room.roomId));
    }

    // 5. Update task to IN_PROGRESS
    const updatePayload: Record<string, unknown> = {
      status: "IN_PROGRESS",
      startedAt: task.startedAt || new Date(),
      updatedAt: new Date(),
    };
    if (!task.assignedStaffId && userId) {
      updatePayload.assignedStaffId = userId;
    }

    await tx
      .update(hotelHousekeepingTasks)
      .set(updatePayload)
      .where(eq(hotelHousekeepingTasks.taskId, taskId));

    await recordAuditEvent({
      tenantId,
      userId,
      action: "housekeeping.task_started",
      resourceType: "hotel_housekeeping_task",
      resourceId: taskId,
      payload: {
        taskId,
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        previousRoomHousekeepingStatus: room.housekeepingStatus,
      },
    });

    realtimeHub.broadcastToTenant(tenantId, "housekeeping.task_started", {
      taskId,
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      status: "IN_PROGRESS",
    });

    realtimeHub.broadcastToTenant(tenantId, "room.housekeeping_changed", {
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      housekeepingStatus: "CLEANING",
    });

    return task.outletId;
  });

  return getHousekeepingTaskById(tenantId, taskId, outletId);
}

/**
 * Complete cleaning workflow for a Housekeeping Task.
 * Invariant: updates room housekeeping status to CLEAN (awaiting inspection).
 * Invariant: preserves room operational status (OCCUPIED, AVAILABLE, OUT_OF_SERVICE).
 */
export async function completeHousekeepingTask(
  tenantId: string,
  taskId: string,
  input: { notes?: string } = {},
  userId?: string
): Promise<HousekeepingTaskDetail> {
  const db = getDb();

  const outletId = await db.transaction(async (tx) => {
    // 1. Lock task row
    const [task] = await tx
      .select()
      .from(hotelHousekeepingTasks)
      .where(
        and(
          eq(hotelHousekeepingTasks.taskId, taskId),
          eq(hotelHousekeepingTasks.tenantId, tenantId)
        )
      )
      .for("update");

    if (!task) {
      throw new NotFoundError(`Housekeeping task with ID '${taskId}' not found.`);
    }

    // 2. Validate task transition
    if (task.status === "CLEANED") {
      throw new BusinessRuleError("Housekeeping task is already completed as cleaned.");
    }

    validateHousekeepingTaskStatusTransition(
      task.status as HotelHousekeepingTaskStatus,
      "CLEANED"
    );

    // 3. Lock physical room row
    const [room] = await tx
      .select()
      .from(hotelRooms)
      .where(eq(hotelRooms.roomId, task.roomId))
      .for("update");

    if (!room) {
      throw new NotFoundError(`Room with ID '${task.roomId}' not found.`);
    }

    // 4. Update room housekeeping status: CLEANING -> CLEAN
    if (room.housekeepingStatus !== "CLEAN") {
      validateHousekeepingStatusTransition(
        room.housekeepingStatus as HotelHousekeepingStatus,
        "CLEAN"
      );

      await tx
        .update(hotelRooms)
        .set({
          housekeepingStatus: "CLEAN",
          updatedAt: new Date(),
        })
        .where(eq(hotelRooms.roomId, room.roomId));
    }

    // 5. Update task to CLEANED
    const notes = input.notes?.trim()
      ? task.notes
        ? `${task.notes}\n[Completed Notes]: ${input.notes.trim()}`
        : input.notes.trim()
      : task.notes;

    await tx
      .update(hotelHousekeepingTasks)
      .set({
        status: "CLEANED",
        completedAt: new Date(),
        notes,
        updatedAt: new Date(),
      })
      .where(eq(hotelHousekeepingTasks.taskId, taskId));

    await recordAuditEvent({
      tenantId,
      userId,
      action: "housekeeping.task_completed",
      resourceType: "hotel_housekeeping_task",
      resourceId: taskId,
      payload: {
        taskId,
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        newRoomHousekeepingStatus: "CLEAN",
      },
    });

    realtimeHub.broadcastToTenant(tenantId, "housekeeping.task_completed", {
      taskId,
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      status: "CLEANED",
    });

    realtimeHub.broadcastToTenant(tenantId, "room.housekeeping_changed", {
      roomId: room.roomId,
      roomNumber: room.roomNumber,
      housekeepingStatus: "CLEAN",
    });

    return task.outletId;
  });

  return getHousekeepingTaskById(tenantId, taskId, outletId);
}

/**
 * Inspection Workflow for a Housekeeping Task.
 * Outcome:
 * - Passed: Task -> INSPECTED. Room -> INSPECTED. Room is now verified ready!
 * - Failed: Task -> PENDING. Room -> DIRTY (sent back for re-cleaning).
 * Invariant: Does not alter physical operational status (OCCUPIED remains OCCUPIED).
 */
export async function inspectHousekeepingTask(
  tenantId: string,
  taskId: string,
  input: { passed: boolean; notes?: string },
  inspectorUserId: string
): Promise<HousekeepingTaskDetail> {
  const db = getDb();

  const outletId = await db.transaction(async (tx) => {
    // 1. Lock task row
    const [task] = await tx
      .select()
      .from(hotelHousekeepingTasks)
      .where(
        and(
          eq(hotelHousekeepingTasks.taskId, taskId),
          eq(hotelHousekeepingTasks.tenantId, tenantId)
        )
      )
      .for("update");

    if (!task) {
      throw new NotFoundError(`Housekeeping task with ID '${taskId}' not found.`);
    }

    if (task.status !== "CLEANED") {
      throw new BusinessRuleError(
        `Only tasks in 'CLEANED' status can be inspected. Current status is '${task.status}'.`
      );
    }

    // 2. Lock physical room row
    const [room] = await tx
      .select()
      .from(hotelRooms)
      .where(eq(hotelRooms.roomId, task.roomId))
      .for("update");

    if (!room) {
      throw new NotFoundError(`Room with ID '${task.roomId}' not found.`);
    }

    const inspectionNotes = input.notes?.trim() || null;

    if (input.passed) {
      // PASS: Task -> INSPECTED, Room -> INSPECTED
      validateHousekeepingTaskStatusTransition("CLEANED", "INSPECTED");
      validateHousekeepingStatusTransition(
        room.housekeepingStatus as HotelHousekeepingStatus,
        "INSPECTED"
      );

      await tx
        .update(hotelRooms)
        .set({
          housekeepingStatus: "INSPECTED",
          updatedAt: new Date(),
        })
        .where(eq(hotelRooms.roomId, room.roomId));

      await tx
        .update(hotelHousekeepingTasks)
        .set({
          status: "INSPECTED",
          inspectedBy: inspectorUserId,
          inspectedAt: new Date(),
          inspectionNotes,
          updatedAt: new Date(),
        })
        .where(eq(hotelHousekeepingTasks.taskId, taskId));

      await recordAuditEvent({
        tenantId,
        userId: inspectorUserId,
        action: "housekeeping.task_inspected",
        resourceType: "hotel_housekeeping_task",
        resourceId: taskId,
        payload: {
          taskId,
          roomId: room.roomId,
          roomNumber: room.roomNumber,
          passed: true,
          inspectionNotes,
          newRoomHousekeepingStatus: "INSPECTED",
        },
      });

      realtimeHub.broadcastToTenant(tenantId, "housekeeping.task_inspected", {
        taskId,
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        passed: true,
        status: "INSPECTED",
      });

      realtimeHub.broadcastToTenant(tenantId, "room.housekeeping_changed", {
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        housekeepingStatus: "INSPECTED",
      });
    } else {
      // FAIL: Task -> PENDING, Room -> DIRTY (send back for re-cleaning)
      validateHousekeepingTaskStatusTransition("CLEANED", "PENDING");
      validateHousekeepingStatusTransition(
        room.housekeepingStatus as HotelHousekeepingStatus,
        "DIRTY"
      );

      await tx
        .update(hotelRooms)
        .set({
          housekeepingStatus: "DIRTY",
          updatedAt: new Date(),
        })
        .where(eq(hotelRooms.roomId, room.roomId));

      await tx
        .update(hotelHousekeepingTasks)
        .set({
          status: "PENDING",
          triggerSource: "INSPECTION_FAILED",
          inspectedBy: inspectorUserId,
          inspectedAt: new Date(),
          inspectionNotes,
          updatedAt: new Date(),
        })
        .where(eq(hotelHousekeepingTasks.taskId, taskId));

      await recordAuditEvent({
        tenantId,
        userId: inspectorUserId,
        action: "housekeeping.task_inspected",
        resourceType: "hotel_housekeeping_task",
        resourceId: taskId,
        payload: {
          taskId,
          roomId: room.roomId,
          roomNumber: room.roomNumber,
          passed: false,
          inspectionNotes,
          newRoomHousekeepingStatus: "DIRTY",
        },
      });

      realtimeHub.broadcastToTenant(tenantId, "housekeeping.task_inspected", {
        taskId,
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        passed: false,
        status: "PENDING",
      });

      realtimeHub.broadcastToTenant(tenantId, "room.housekeeping_changed", {
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        housekeepingStatus: "DIRTY",
      });
    }

    return task.outletId;
  });

  return getHousekeepingTaskById(tenantId, taskId, outletId);
}

/**
 * Get aggregated Housekeeping and Room Readiness KPIs.
 */
export async function getHousekeepingSummary(
  tenantId: string,
  outletId: string
): Promise<HousekeepingSummary> {
  const db = getDb();

  // 1. Fetch physical rooms
  const allRooms = await listRooms(tenantId, outletId);

  let clean = 0;
  let dirty = 0;
  let cleaning = 0;
  let inspected = 0;
  let maintenance = 0;
  let readyForOccupancy = 0;
  let occupied = 0;
  let outOfService = 0;

  for (const r of allRooms) {
    if (r.operationalStatus === "OCCUPIED" || r.isOccupied) {
      occupied++;
    } else if (r.operationalStatus === "OUT_OF_SERVICE" || r.operationalStatus === "OUT_OF_ORDER") {
      outOfService++;
    } else if (r.operationalStatus === "AVAILABLE") {
      if (r.housekeepingStatus === "INSPECTED" || r.housekeepingStatus === "CLEAN") {
        readyForOccupancy++;
      }
    }

    if (r.housekeepingStatus === "CLEAN") clean++;
    else if (r.housekeepingStatus === "DIRTY") dirty++;
    else if (r.housekeepingStatus === "CLEANING") cleaning++;
    else if (r.housekeepingStatus === "INSPECTED") inspected++;
    else if (r.housekeepingStatus === "MAINTENANCE") maintenance++;
  }

  // 2. Fetch task counts
  const tasks = await db
    .select({
      status: hotelHousekeepingTasks.status,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(hotelHousekeepingTasks)
    .where(
      and(
        eq(hotelHousekeepingTasks.tenantId, tenantId),
        eq(hotelHousekeepingTasks.outletId, outletId)
      )
    )
    .groupBy(hotelHousekeepingTasks.status);

  let pending = 0;
  let assigned = 0;
  let inProgress = 0;
  let cleaned = 0;

  for (const t of tasks) {
    if (t.status === "PENDING") pending = t.count;
    else if (t.status === "ASSIGNED") assigned = t.count;
    else if (t.status === "IN_PROGRESS") inProgress = t.count;
    else if (t.status === "CLEANED") cleaned = t.count;
  }

  // Inspected today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [inspectedTodayRes] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(hotelHousekeepingTasks)
    .where(
      and(
        eq(hotelHousekeepingTasks.tenantId, tenantId),
        eq(hotelHousekeepingTasks.outletId, outletId),
        eq(hotelHousekeepingTasks.status, "INSPECTED"),
        gte(hotelHousekeepingTasks.inspectedAt, todayStart)
      )
    );

  const inspectedToday = inspectedTodayRes?.count || 0;

  return {
    taskCounts: {
      pending,
      assigned,
      inProgress,
      cleaned,
      inspectedToday,
      totalActive: pending + assigned + inProgress + cleaned,
    },
    roomCounts: {
      totalRooms: allRooms.length,
      clean,
      dirty,
      cleaning,
      inspected,
      maintenance,
      readyForOccupancy,
      occupied,
      outOfService,
    },
  };
}

/**
 * Creates turnover task on checkout if no pending/active task exists for the room.
 */
export async function createTurnoverTaskForRoom(
  tx: any,
  params: {
    tenantId: string;
    outletId: string;
    roomId: string;
    notes?: string;
    priority?: HotelHousekeepingTaskPriority;
  }
): Promise<void> {
  // Check if an uncompleted task already exists for this room
  const [existing] = await tx
    .select({ taskId: hotelHousekeepingTasks.taskId })
    .from(hotelHousekeepingTasks)
    .where(
      and(
        eq(hotelHousekeepingTasks.roomId, params.roomId),
        eq(hotelHousekeepingTasks.tenantId, params.tenantId),
        inArray(hotelHousekeepingTasks.status, ["PENDING", "ASSIGNED", "IN_PROGRESS"])
      )
    )
    .limit(1);

  if (existing) {
    return; // Already has an active cleaning task
  }

  await tx.insert(hotelHousekeepingTasks).values({
    tenantId: params.tenantId,
    outletId: params.outletId,
    roomId: params.roomId,
    taskType: "DEPARTURE_TURNOVER",
    triggerSource: "CHECKOUT",
    status: "PENDING",
    priority: params.priority || "HIGH",
    notes: params.notes || "Automated turnover task from checkout",
  });
}
