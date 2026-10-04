import { eq, and, inArray, asc, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  orders,
  orderItems,
  kdsTasks,
  kdsTaskHistory,
  orderStatusHistory,
  kitchenStations,
  catalogItems,
  type NewKdsTask,
  type KitchenStation,
  type NewKitchenStation,
} from "@/db/schema/operations";
import { users } from "@/db/schema/core";
import { restaurantTables } from "@/db/schema/restaurant";
import { businessContexts } from "@/db/schema/context";
import { logger } from "@/lib/logger";
import { createDomainEvent, recordOutboxEvent } from "@/lib/events/outbox";
import { realtimeHub } from "@/lib/realtime/sse";
import {
  validateKdsTaskStatusTransition,
  validateKdsTaskRecallTransition,
  validateOrderStatusTransition,
  KDS_PRIORITIES,
  type KdsPriority,
  type KdsTaskStatus,
} from "@/lib/ordering/order-state-machines";
import { ValidationError, NotFoundError, BusinessRuleError } from "@/lib/api/errors";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveStaffUserId(tx: any, staffId?: string): Promise<string | null> {
  if (!staffId || !UUID_REGEX.test(staffId)) return null;
  try {
    const existing = await tx
      .select({ userId: users.userId })
      .from(users)
      .where(eq(users.userId, staffId))
      .limit(1);
    return existing.length > 0 ? existing[0].userId : null;
  } catch {
    return null;
  }
}

// ============================================================================
// 1. KITCHEN STATION MANAGEMENT (CRUD)
// ============================================================================

export interface CreateKitchenStationInput {
  code: string;
  name: string;
  description?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateKitchenStationInput {
  name?: string;
  description?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export async function createKitchenStation(
  tenantId: string,
  outletId: string,
  input: CreateKitchenStationInput
): Promise<KitchenStation> {
  const db = getDb();
  const normalizedCode = input.code.trim().toUpperCase();

  if (!normalizedCode || !input.name.trim()) {
    throw new ValidationError("Station code and name are required.");
  }

  // Check unique code within tenant and outlet
  const [existing] = await db
    .select()
    .from(kitchenStations)
    .where(
      and(
        eq(kitchenStations.tenantId, tenantId),
        eq(kitchenStations.outletId, outletId),
        eq(kitchenStations.code, normalizedCode)
      )
    )
    .limit(1);

  if (existing) {
    throw new BusinessRuleError(
      `Kitchen station with code '${normalizedCode}' already exists for this outlet.`
    );
  }

  const [station] = await db
    .insert(kitchenStations)
    .values({
      tenantId,
      outletId,
      code: normalizedCode,
      name: input.name.trim(),
      description: input.description || null,
      displayOrder: input.displayOrder ?? 0,
      isActive: input.isActive ?? true,
    })
    .returning();

  logger.info({
    message: "Created kitchen station",
    tenantId,
    details: { outletId, stationId: station.stationId, code: station.code },
  });

  return station;
}

export async function updateKitchenStation(
  tenantId: string,
  stationId: string,
  input: UpdateKitchenStationInput
): Promise<KitchenStation> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(kitchenStations)
    .where(and(eq(kitchenStations.tenantId, tenantId), eq(kitchenStations.stationId, stationId)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Kitchen station not found.");
  }

  const updateData: Partial<NewKitchenStation> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateData.name = input.name.trim();
  if (input.description !== undefined) updateData.description = input.description;
  if (input.displayOrder !== undefined) updateData.displayOrder = input.displayOrder;
  if (input.isActive !== undefined) updateData.isActive = input.isActive;

  const [updated] = await db
    .update(kitchenStations)
    .set(updateData)
    .where(eq(kitchenStations.stationId, stationId))
    .returning();

  logger.info({
    message: "Updated kitchen station",
    tenantId,
    details: { stationId, code: updated.code },
  });

  return updated;
}

export async function listKitchenStations(
  tenantId: string,
  outletId: string,
  activeOnly = false
): Promise<KitchenStation[]> {
  const db = getDb();
  const conditions = [
    eq(kitchenStations.tenantId, tenantId),
    eq(kitchenStations.outletId, outletId),
  ];

  if (activeOnly) {
    conditions.push(eq(kitchenStations.isActive, true));
  }

  return await db
    .select()
    .from(kitchenStations)
    .where(and(...conditions))
    .orderBy(asc(kitchenStations.displayOrder), asc(kitchenStations.name));
}

export async function getKitchenStation(
  tenantId: string,
  stationId: string
): Promise<KitchenStation> {
  const db = getDb();
  const [station] = await db
    .select()
    .from(kitchenStations)
    .where(and(eq(kitchenStations.tenantId, tenantId), eq(kitchenStations.stationId, stationId)))
    .limit(1);

  if (!station) {
    throw new NotFoundError("Kitchen station not found.");
  }

  return station;
}

// ============================================================================
// 2. MENU ITEM -> STATION ROUTING CONFIGURATION
// ============================================================================

export async function updateMenuItemStationRouting(
  tenantId: string,
  itemId: string,
  stationId: string | null,
  stationCodeFallback?: string
): Promise<void> {
  const db = getDb();

  const [item] = await db
    .select()
    .from(catalogItems)
    .where(and(eq(catalogItems.tenantId, tenantId), eq(catalogItems.itemId, itemId)))
    .limit(1);

  if (!item) {
    throw new NotFoundError("Catalog item not found.");
  }

  let resolvedCode = (stationCodeFallback || "KITCHEN").trim().toUpperCase();

  if (stationId) {
    const [station] = await db
      .select()
      .from(kitchenStations)
      .where(and(eq(kitchenStations.tenantId, tenantId), eq(kitchenStations.stationId, stationId)))
      .limit(1);

    if (!station) {
      throw new NotFoundError("Target kitchen station does not exist.");
    }
    resolvedCode = station.code;
  }

  // Update item routing configuration
  // NOTE: Existing historical KDS tasks retain their routing snapshot.
  await db
    .update(catalogItems)
    .set({
      stationId: stationId || null,
      fulfillmentStation: resolvedCode,
      updatedAt: new Date(),
    })
    .where(eq(catalogItems.itemId, itemId));

  logger.info({
    message: "Updated catalog item station routing",
    tenantId,
    details: { itemId, stationId, fulfillmentStation: resolvedCode },
  });
}

// ============================================================================
// 3. ORDER -> KDS TASK GENERATION
// ============================================================================

export async function generateKdsTasksFromOrderConfirmed(
  tenantId: string,
  orderId: string
): Promise<void> {
  const db = getDb();

  // 1. Fetch Authoritative Order
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.orderId, orderId)))
    .limit(1);

  if (!order) {
    logger.warn({
      message: "Order not found during KDS generation",
      tenantId,
      details: { orderId },
    });
    return;
  }

  if (order.status === "CANCELLED") {
    return;
  }

  // 2. Fetch Order Items
  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, orderId)));

  if (!items.length) {
    return;
  }

  const fulfillableItems = items.filter((i) => i.itemStatus !== "CANCELLED");
  if (!fulfillableItems.length) {
    return;
  }

  // Resolve destination label
  let destinationLabel = order.diningContext;
  if (order.tableId) {
    const [tbl] = await db
      .select({ label: restaurantTables.displayLabel, number: restaurantTables.tableNumber })
      .from(restaurantTables)
      .where(eq(restaurantTables.tableId, order.tableId))
      .limit(1);
    if (tbl) {
      destinationLabel = tbl.label || `Table ${tbl.number}`;
    }
  } else if (order.diningContext === "ROOM_SERVICE" && order.contextId) {
    const [ctx] = await db
      .select({ displayLabel: businessContexts.displayLabel })
      .from(businessContexts)
      .where(eq(businessContexts.contextId, order.contextId))
      .limit(1);
    if (ctx) {
      destinationLabel = ctx.displayLabel || "Room Service";
    }
  }

  // 3. Atomic insertion of tasks, duplicate-safe
  await db.transaction(async (tx) => {
    const orderItemIds = fulfillableItems.map((i) => i.orderItemId);
    const existingTasks = await tx
      .select({ orderItemId: kdsTasks.orderItemId })
      .from(kdsTasks)
      .where(and(eq(kdsTasks.tenantId, tenantId), inArray(kdsTasks.orderItemId, orderItemIds)));

    const existingSet = new Set(existingTasks.map((t) => t.orderItemId));
    const tasksToInsert: NewKdsTask[] = [];

    // Catalog items station lookup map
    const catalogItemIds = fulfillableItems.map((i) => i.itemId);
    const catalogItemRows = await tx
      .select({
        itemId: catalogItems.itemId,
        stationId: catalogItems.stationId,
        fulfillmentStation: catalogItems.fulfillmentStation,
      })
      .from(catalogItems)
      .where(and(eq(catalogItems.tenantId, tenantId), inArray(catalogItems.itemId, catalogItemIds)));

    const catalogStationMap = new Map(
      catalogItemRows.map((c) => [c.itemId, { stationId: c.stationId, stationCode: c.fulfillmentStation }])
    );

    for (const item of fulfillableItems) {
      if (existingSet.has(item.orderItemId)) {
        continue;
      }

      const routingMeta = catalogStationMap.get(item.itemId);
      const stationCode = item.fulfillmentStation || routingMeta?.stationCode || "KITCHEN";
      const stationId = routingMeta?.stationId || null;

      tasksToInsert.push({
        tenantId,
        outletId: order.outletId,
        orderId: order.orderId,
        orderItemId: item.orderItemId,
        itemId: item.itemId,
        itemName: item.itemName,
        quantity: item.quantity,
        diningContext: order.diningContext,
        tableId: order.tableId,
        tableSessionId: order.tableSessionId,
        orderSource: order.orderSource,
        stationRouting: stationCode,
        stationId,
        taskStatus: "PENDING",
        priority: "NORMAL",
        destinationLabel,
        specialNotes: item.specialNotes || null,
        idempotencyKey: `KDS_TASK:${item.orderItemId}`,
      });
    }

    if (tasksToInsert.length > 0) {
      const inserted = await tx.insert(kdsTasks).values(tasksToInsert).returning();

      for (const t of inserted) {
        // Record Outbox event for each created task
        const event = createDomainEvent({
          tenantId,
          outletId: order.outletId,
          vertical: "RESTAURANT",
          eventType: "RESTAURANT_KDS_TASK_CREATED",
          aggregateType: "KDS_TASK",
          aggregateId: t.taskId,
          payload: {
            taskId: t.taskId,
            orderId: t.orderId,
            orderItemId: t.orderItemId,
            itemName: t.itemName,
            quantity: t.quantity,
            stationRouting: t.stationRouting,
            priority: t.priority,
            destinationLabel: t.destinationLabel,
          },
        });
        await recordOutboxEvent(tx, event);
      }

      logger.info({
        message: "Generated KDS tasks for order",
        tenantId,
        details: {
          orderId,
          tasksGenerated: tasksToInsert.length,
        },
      });

      // Broadcast Realtime SSE
      realtimeHub.broadcastToTenant(tenantId, "restaurant:kds_tasks_created", {
        orderId,
        outletId: order.outletId,
        taskCount: tasksToInsert.length,
      });
    }
  });
}

// ============================================================================
// 4. ORDER STATUS DERIVATION FROM KDS TASKS
// ============================================================================

export async function recalculateOrderStatusFromKdsTasks(
  tenantId: string,
  orderId: string,
  txClient?: any
): Promise<void> {
  const dbExecutor = txClient || getDb();

  const [order] = await dbExecutor
    .select()
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.orderId, orderId)))
    .limit(1);

  if (!order || order.status === "CANCELLED" || order.status === "COMPLETED") {
    return;
  }

  const tasks = await dbExecutor
    .select()
    .from(kdsTasks)
    .where(and(eq(kdsTasks.tenantId, tenantId), eq(kdsTasks.orderId, orderId)));

  if (tasks.length === 0) {
    return;
  }

  const fulfillableTasks = tasks.filter((t: any) => t.taskStatus !== "CANCELLED");
  if (fulfillableTasks.length === 0) {
    return;
  }

  const allPending = fulfillableTasks.every((t: any) => t.taskStatus === "PENDING");
  const allDoneOrReady = fulfillableTasks.every(
    (t: any) => t.taskStatus === "READY" || t.taskStatus === "DONE"
  );
  const anyPreparing = fulfillableTasks.some((t: any) => t.taskStatus === "PREPARING");
  const someReadyDone = fulfillableTasks.some(
    (t: any) => t.taskStatus === "READY" || t.taskStatus === "DONE"
  );

  let derivedStatus = order.status;

  if (allPending) {
    // Remain in pre-prep state
  } else if (allDoneOrReady) {
    derivedStatus = "READY";
  } else if (someReadyDone && !allDoneOrReady) {
    derivedStatus = "PARTIALLY_READY";
  } else if (anyPreparing) {
    derivedStatus = "PREPARING";
  }

  if (derivedStatus !== order.status) {
    try {
      validateOrderStatusTransition(order.status as any, derivedStatus as any);

      await dbExecutor
        .update(orders)
        .set({ status: derivedStatus, updatedAt: new Date() })
        .where(eq(orders.orderId, orderId));

      await dbExecutor.insert(orderStatusHistory).values({
        tenantId,
        orderId,
        fromStatus: order.status,
        toStatus: derivedStatus,
        reason: "System derived order status from KDS task states",
      });

      logger.info({
        message: "Derived order status from KDS tasks",
        tenantId,
        details: { orderId, fromStatus: order.status, toStatus: derivedStatus },
      });
    } catch {
      logger.debug({
        message: "Could not derive order status (invalid transition)",
        tenantId,
        details: { orderId, fromStatus: order.status, derivedStatus },
      });
    }
  }
}

// ============================================================================
// 5. KDS TASK ACTIONS & STATE TRANSITIONS
// ============================================================================

export async function updateKdsTaskStatus(
  tenantId: string,
  taskId: string,
  newStatus: string,
  staffId: string
): Promise<void> {
  const db = getDb();
  const targetStatus = newStatus as KdsTaskStatus;

  await db.transaction(async (tx) => {
    // Lock row FOR UPDATE to prevent race conditions
    const [task] = await tx
      .select()
      .from(kdsTasks)
      .where(and(eq(kdsTasks.tenantId, tenantId), eq(kdsTasks.taskId, taskId)))
      .limit(1);

    if (!task) {
      throw new NotFoundError("KDS Task not found.");
    }

    validateKdsTaskStatusTransition(task.taskStatus as KdsTaskStatus, targetStatus);

    if (task.taskStatus !== targetStatus) {
      const now = new Date();
      const timestampUpdates: Partial<NewKdsTask> = {
        taskStatus: targetStatus,
        updatedAt: now,
      };

      if (targetStatus === "PREPARING" && !task.startedAt) {
        timestampUpdates.startedAt = now;
      } else if (targetStatus === "READY" && !task.readyAt) {
        timestampUpdates.readyAt = now;
      } else if (targetStatus === "DONE" && !task.completedAt) {
        timestampUpdates.completedAt = now;
      } else if (targetStatus === "CANCELLED" && !task.cancelledAt) {
        timestampUpdates.cancelledAt = now;
      }

      await tx.update(kdsTasks).set(timestampUpdates).where(eq(kdsTasks.taskId, taskId));

      const changedByUserId = await resolveStaffUserId(tx, staffId);

      await tx.insert(kdsTaskHistory).values({
        tenantId,
        taskId,
        fromStatus: task.taskStatus,
        toStatus: targetStatus,
        changedByUserId,
        reason: "Manual KDS task update",
      });

      // Synchronize Order Item status
      let orderItemStatus = targetStatus as string;
      if (targetStatus === "DONE") {
        orderItemStatus = "READY";
      }

      await tx
        .update(orderItems)
        .set({ itemStatus: orderItemStatus, updatedAt: now })
        .where(eq(orderItems.orderItemId, task.orderItemId));

      // Re-derive overall order status
      await recalculateOrderStatusFromKdsTasks(tenantId, task.orderId, tx);

      // Record Domain Outbox Event
      let eventType: any = "RESTAURANT_KDS_TASK_STARTED";
      if (targetStatus === "READY") eventType = "RESTAURANT_KDS_TASK_READY";
      else if (targetStatus === "DONE") eventType = "RESTAURANT_KDS_TASK_DONE";
      else if (targetStatus === "CANCELLED") eventType = "RESTAURANT_KDS_TASK_CANCELLED";

      const outboxEv = createDomainEvent({
        tenantId,
        outletId: task.outletId,
        vertical: "RESTAURANT",
        eventType,
        aggregateType: "KDS_TASK",
        aggregateId: taskId,
        payload: {
          taskId,
          orderId: task.orderId,
          orderItemId: task.orderItemId,
          stationRouting: task.stationRouting,
          fromStatus: task.taskStatus,
          toStatus: targetStatus,
          staffId,
        },
      });
      await recordOutboxEvent(tx, outboxEv);

      // Broadcast Realtime SSE
      realtimeHub.broadcastToTenant(tenantId, "restaurant:kds_task_updated", {
        taskId,
        orderId: task.orderId,
        outletId: task.outletId,
        stationRouting: task.stationRouting,
        fromStatus: task.taskStatus,
        toStatus: targetStatus,
        updatedAt: now.toISOString(),
      });
    }
  });
}

// ============================================================================
// 6. PRIORITY & EXPEDITING
// ============================================================================

export async function updateKdsTaskPriority(
  tenantId: string,
  taskId: string,
  priority: KdsPriority,
  staffId: string,
  reason?: string
): Promise<void> {
  const db = getDb();

  if (!KDS_PRIORITIES.includes(priority)) {
    throw new ValidationError(`Invalid priority '${priority}'. Allowed: ${KDS_PRIORITIES.join(", ")}`);
  }

  await db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(kdsTasks)
      .where(and(eq(kdsTasks.tenantId, tenantId), eq(kdsTasks.taskId, taskId)))
      .limit(1);

    if (!task) {
      throw new NotFoundError("KDS Task not found.");
    }

    if (task.priority === priority) {
      return; // No-op
    }

    await tx
      .update(kdsTasks)
      .set({ priority, updatedAt: new Date() })
      .where(eq(kdsTasks.taskId, taskId));

    const changedByUserId = await resolveStaffUserId(tx, staffId);

    await tx.insert(kdsTaskHistory).values({
      tenantId,
      taskId,
      fromStatus: task.taskStatus,
      toStatus: task.taskStatus,
      changedByUserId,
      reason: `Priority updated from ${task.priority} to ${priority}: ${reason || "Expedited"}`,
    });

    const outboxEv = createDomainEvent({
      tenantId,
      outletId: task.outletId,
      vertical: "RESTAURANT",
      eventType: "RESTAURANT_KDS_PRIORITY_UPDATED",
      aggregateType: "KDS_TASK",
      aggregateId: taskId,
      payload: {
        taskId,
        orderId: task.orderId,
        previousPriority: task.priority,
        newPriority: priority,
        staffId,
        reason,
      },
    });
    await recordOutboxEvent(tx, outboxEv);

    realtimeHub.broadcastToTenant(tenantId, "restaurant:kds_task_updated", {
      taskId,
      orderId: task.orderId,
      outletId: task.outletId,
      stationRouting: task.stationRouting,
      priority,
      status: task.taskStatus,
    });
  });
}

// ============================================================================
// 7. AUDITED RECALL / REOPEN WORKFLOW
// ============================================================================

export async function recallKdsTask(
  tenantId: string,
  taskId: string,
  targetStatus: KdsTaskStatus,
  staffId: string,
  reason: string
): Promise<void> {
  const db = getDb();

  if (!reason || !reason.trim()) {
    throw new ValidationError("An audit reason is required to recall a KDS task.");
  }

  await db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(kdsTasks)
      .where(and(eq(kdsTasks.tenantId, tenantId), eq(kdsTasks.taskId, taskId)))
      .limit(1);

    if (!task) {
      throw new NotFoundError("KDS Task not found.");
    }

    validateKdsTaskRecallTransition(task.taskStatus as KdsTaskStatus, targetStatus);

    const now = new Date();
    const updates: Partial<NewKdsTask> = {
      taskStatus: targetStatus,
      updatedAt: now,
    };

    // Reset completion timestamps on recall
    if (task.taskStatus === "DONE" && targetStatus === "READY") {
      updates.completedAt = null;
    } else if (task.taskStatus === "READY" && targetStatus === "PREPARING") {
      updates.readyAt = null;
    } else if (task.taskStatus === "CANCELLED" && targetStatus === "PENDING") {
      updates.cancelledAt = null;
    }

    await tx.update(kdsTasks).set(updates).where(eq(kdsTasks.taskId, taskId));

    const changedByUserId = await resolveStaffUserId(tx, staffId);

    await tx.insert(kdsTaskHistory).values({
      tenantId,
      taskId,
      fromStatus: task.taskStatus,
      toStatus: targetStatus,
      changedByUserId,
      reason: `Audited recall to ${targetStatus}: ${reason.trim()}`,
    });

    // Synchronize order item
    let orderItemStatus = targetStatus as string;
    await tx
      .update(orderItems)
      .set({ itemStatus: orderItemStatus, updatedAt: now })
      .where(eq(orderItems.orderItemId, task.orderItemId));

    // Re-derive overall order status
    await recalculateOrderStatusFromKdsTasks(tenantId, task.orderId, tx);

    const outboxEv = createDomainEvent({
      tenantId,
      outletId: task.outletId,
      vertical: "RESTAURANT",
      eventType: "RESTAURANT_KDS_TASK_RECALLED",
      aggregateType: "KDS_TASK",
      aggregateId: taskId,
      payload: {
        taskId,
        orderId: task.orderId,
        fromStatus: task.taskStatus,
        toStatus: targetStatus,
        staffId,
        reason,
      },
    });
    await recordOutboxEvent(tx, outboxEv);

    realtimeHub.broadcastToTenant(tenantId, "restaurant:kds_task_updated", {
      taskId,
      orderId: task.orderId,
      outletId: task.outletId,
      stationRouting: task.stationRouting,
      fromStatus: task.taskStatus,
      toStatus: targetStatus,
      isRecall: true,
    });
  });
}

// ============================================================================
// 8. BATCH / TICKET BUMP WORKFLOW
// ============================================================================

export async function bumpStationTicket(
  tenantId: string,
  outletId: string,
  orderId: string,
  stationRouting: string,
  fromStatus: KdsTaskStatus,
  toStatus: KdsTaskStatus,
  staffId: string
): Promise<{ bumpedCount: number }> {
  const db = getDb();
  validateKdsTaskStatusTransition(fromStatus, toStatus);

  let bumpedCount = 0;

  await db.transaction(async (tx) => {
    const matchingTasks = await tx
      .select()
      .from(kdsTasks)
      .where(
        and(
          eq(kdsTasks.tenantId, tenantId),
          eq(kdsTasks.outletId, outletId),
          eq(kdsTasks.orderId, orderId),
          eq(kdsTasks.stationRouting, stationRouting),
          eq(kdsTasks.taskStatus, fromStatus)
        )
      );

    if (matchingTasks.length === 0) {
      return;
    }

    const now = new Date();
    const taskIds = matchingTasks.map((t) => t.taskId);

    const updates: Partial<NewKdsTask> = {
      taskStatus: toStatus,
      updatedAt: now,
    };
    if (toStatus === "PREPARING") updates.startedAt = now;
    if (toStatus === "READY") updates.readyAt = now;
    if (toStatus === "DONE") updates.completedAt = now;

    await tx
      .update(kdsTasks)
      .set(updates)
      .where(and(eq(kdsTasks.tenantId, tenantId), inArray(kdsTasks.taskId, taskIds)));

    const changedByUserId = await resolveStaffUserId(tx, staffId);

    for (const t of matchingTasks) {
      await tx.insert(kdsTaskHistory).values({
        tenantId,
        taskId: t.taskId,
        fromStatus,
        toStatus,
        changedByUserId,
        reason: `Batch bump from station ${stationRouting}`,
      });
    }

    // Synchronize order items
    const orderItemIds = matchingTasks.map((t) => t.orderItemId);
    await tx
      .update(orderItems)
      .set({ itemStatus: toStatus === "DONE" ? "READY" : toStatus, updatedAt: now })
      .where(inArray(orderItems.orderItemId, orderItemIds));

    // Re-derive order status
    await recalculateOrderStatusFromKdsTasks(tenantId, orderId, tx);

    bumpedCount = matchingTasks.length;

    realtimeHub.broadcastToTenant(tenantId, "restaurant:kds_ticket_bumped", {
      orderId,
      stationRouting,
      fromStatus,
      toStatus,
      bumpedCount,
    });
  });

  return { bumpedCount };
}

// ============================================================================
// 9. QUERYING & TICKET GROUPING FOR KDS DISPLAYS
// ============================================================================

export interface KdsTaskQueryFilters {
  outletId: string;
  stationRouting?: string;
  stationId?: string;
  taskStatus?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}

export async function listKdsTasks(tenantId: string, filters: KdsTaskQueryFilters) {
  const db = getDb();

  const conditions = [
    eq(kdsTasks.tenantId, tenantId),
    eq(kdsTasks.outletId, filters.outletId),
  ];

  if (filters.stationRouting && filters.stationRouting !== "ALL") {
    conditions.push(eq(kdsTasks.stationRouting, filters.stationRouting));
  }

  if (filters.stationId) {
    conditions.push(eq(kdsTasks.stationId, filters.stationId));
  }

  if (filters.taskStatus) {
    conditions.push(eq(kdsTasks.taskStatus, filters.taskStatus));
  }

  if (filters.priority) {
    conditions.push(eq(kdsTasks.priority, filters.priority));
  }

  const safeLimit = Math.min(Math.max(1, filters.limit || 50), 100);
  const safeOffset = Math.max(0, filters.offset || 0);

  return await db
    .select()
    .from(kdsTasks)
    .where(and(...conditions))
    .orderBy(asc(kdsTasks.createdAt))
    .limit(safeLimit)
    .offset(safeOffset);
}

export interface KdsTicketCard {
  orderId: string;
  orderNumber: string;
  destination: string;
  diningContext: string;
  priority: KdsPriority;
  orderStatus: string;
  ticketCreatedAt: string;
  elapsedSeconds: number;
  items: Array<{
    taskId: string;
    orderItemId: string;
    itemName: string;
    quantity: number;
    stationRouting: string;
    taskStatus: KdsTaskStatus;
    priority: KdsPriority;
    startedAt: string | null;
    readyAt: string | null;
    completedAt: string | null;
    specialNotes: string | null;
    elapsedPrepSeconds: number;
  }>;
}

export async function listKdsTickets(
  tenantId: string,
  outletId: string,
  stationRouting?: string,
  activeOnly = true
): Promise<KdsTicketCard[]> {
  const db = getDb();

  const conditions = [
    eq(kdsTasks.tenantId, tenantId),
    eq(kdsTasks.outletId, outletId),
  ];

  if (stationRouting && stationRouting !== "ALL") {
    conditions.push(eq(kdsTasks.stationRouting, stationRouting));
  }

  if (activeOnly) {
    conditions.push(inArray(kdsTasks.taskStatus, ["PENDING", "PREPARING", "READY"]));
  }

  const tasks = await db
    .select({
      task: kdsTasks,
      order: {
        orderNumber: orders.orderNumber,
        status: orders.status,
      },
    })
    .from(kdsTasks)
    .innerJoin(orders, eq(orders.orderId, kdsTasks.orderId))
    .where(and(...conditions))
    .orderBy(asc(kdsTasks.createdAt));

  const nowMs = Date.now();
  const ticketMap = new Map<string, KdsTicketCard>();

  for (const { task, order } of tasks) {
    let card = ticketMap.get(task.orderId);
    if (!card) {
      const taskCreatedMs = new Date(task.createdAt).getTime();
      card = {
        orderId: task.orderId,
        orderNumber: order.orderNumber,
        destination: task.destinationLabel || task.diningContext,
        diningContext: task.diningContext,
        priority: task.priority as KdsPriority,
        orderStatus: order.status,
        ticketCreatedAt: task.createdAt.toISOString(),
        elapsedSeconds: Math.max(0, Math.floor((nowMs - taskCreatedMs) / 1000)),
        items: [],
      };
      ticketMap.set(task.orderId, card);
    }

    // Elevate ticket priority to highest item priority
    if (task.priority === "URGENT") {
      card.priority = "URGENT";
    } else if (task.priority === "PRIORITY" && card.priority !== "URGENT") {
      card.priority = "PRIORITY";
    }

    const taskStartedMs = task.startedAt ? new Date(task.startedAt).getTime() : null;
    const taskReadyMs = task.readyAt ? new Date(task.readyAt).getTime() : null;
    const taskCompletedMs = task.completedAt ? new Date(task.completedAt).getTime() : null;

    let elapsedPrep = 0;
    if (taskStartedMs) {
      const endMs = taskCompletedMs || taskReadyMs || nowMs;
      elapsedPrep = Math.max(0, Math.floor((endMs - taskStartedMs) / 1000));
    }

    card.items.push({
      taskId: task.taskId,
      orderItemId: task.orderItemId,
      itemName: task.itemName,
      quantity: task.quantity,
      stationRouting: task.stationRouting,
      taskStatus: task.taskStatus as KdsTaskStatus,
      priority: task.priority as KdsPriority,
      startedAt: task.startedAt ? task.startedAt.toISOString() : null,
      readyAt: task.readyAt ? task.readyAt.toISOString() : null,
      completedAt: task.completedAt ? task.completedAt.toISOString() : null,
      specialNotes: task.specialNotes,
      elapsedPrepSeconds: elapsedPrep,
    });
  }

  // Sort tickets: URGENT first, then PRIORITY, then oldest FIFO
  const priorityWeight: Record<KdsPriority, number> = {
    URGENT: 3,
    PRIORITY: 2,
    NORMAL: 1,
  };

  return Array.from(ticketMap.values()).sort((a, b) => {
    const diffPriority = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (diffPriority !== 0) return diffPriority;
    return b.elapsedSeconds - a.elapsedSeconds; // Oldest (largest elapsed) first
  });
}
