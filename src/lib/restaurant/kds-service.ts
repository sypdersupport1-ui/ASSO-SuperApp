import { eq, and, inArray, asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { orders, orderItems, kdsTasks, orderStatusHistory, type NewKdsTask } from "@/db/schema/operations";
import { logger } from "@/lib/logger";

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
      details: { orderId }
    });
    return;
  }

  if (order.status === "CANCELLED") {
    // If order was cancelled before KDS could generate, skip
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

  // Filter fulfillable items (e.g., skip items that might not need KDS in future, though all do now)
  const fulfillableItems = items.filter(i => i.itemStatus !== "CANCELLED");

  if (!fulfillableItems.length) {
    return;
  }

  // 3. Atomic insertion of tasks, duplicate-safe
  await db.transaction(async (tx) => {
    // Check which orderItemIds already have tasks to prevent duplicates on retry
    const orderItemIds = fulfillableItems.map(i => i.orderItemId);
    const existingTasks = await tx
      .select({ orderItemId: kdsTasks.orderItemId })
      .from(kdsTasks)
      .where(
        and(
          eq(kdsTasks.tenantId, tenantId),
          inArray(kdsTasks.orderItemId, orderItemIds)
        )
      );

    const existingSet = new Set(existingTasks.map(t => t.orderItemId));

    const tasksToInsert: NewKdsTask[] = [];

    for (const item of fulfillableItems) {
      if (existingSet.has(item.orderItemId)) {
        continue;
      }

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
        stationRouting: item.fulfillmentStation,
        taskStatus: "PENDING",
        idempotencyKey: `KDS_TASK:${item.orderItemId}`,
      });
    }

    if (tasksToInsert.length > 0) {
      await tx.insert(kdsTasks).values(tasksToInsert);
      
      logger.info({
        message: "Generated KDS tasks for order",
        tenantId,
        details: {
          orderId,
          tasksGenerated: tasksToInsert.length,
        }
      });
    }
  });
}

/**
 * Derives parent Restaurant order status from item/task states deterministically.
 */
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
    return; // Don't recalculate terminal orders
  }

  const tasks = await dbExecutor
    .select()
    .from(kdsTasks)
    .where(and(eq(kdsTasks.tenantId, tenantId), eq(kdsTasks.orderId, orderId)));

  if (tasks.length === 0) {
    return; // No tasks, no change
  }

  const fulfillableTasks = tasks.filter((t: any) => t.taskStatus !== "CANCELLED");

  if (fulfillableTasks.length === 0) {
    // All items cancelled
    // But we don't automatically cancel the order just because tasks are cancelled. 
    // Manual order cancellation handles order terminal state.
    return; 
  }

  const allPending = fulfillableTasks.every((t: any) => t.taskStatus === "PENDING");
  const allDoneOrReady = fulfillableTasks.every((t: any) => t.taskStatus === "READY" || t.taskStatus === "DONE");
  const anyPreparing = fulfillableTasks.some((t: any) => t.taskStatus === "PREPARING");
  const someReadyDone = fulfillableTasks.some((t: any) => t.taskStatus === "READY" || t.taskStatus === "DONE");

  let derivedStatus = order.status;

  if (allPending) {
    // Remains in PLACED or ACCEPTED or CONFIRMED depending on what the order was originally.
    // We don't force it back if it's already past CONFIRMED, unless we really need to.
    // If it was already PREPARING somehow, maybe we don't downgrade.
    // Let's just keep currentStatus if it's before PREPARING.
  } else if (allDoneOrReady) {
    derivedStatus = "READY";
  } else if (anyPreparing) {
    derivedStatus = "PREPARING";
  } else if (someReadyDone && !allDoneOrReady) {
    derivedStatus = "PARTIALLY_READY";
  }

  if (derivedStatus !== order.status) {
    const { validateOrderStatusTransition } = await import("@/lib/ordering/order-state-machines");
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
        details: { orderId, fromStatus: order.status, toStatus: derivedStatus }
      });

      // We could also broadcast realtime here if needed.
    } catch (e) {
      // Transition not allowed? Just ignore derivation. 
      logger.debug({
        message: "Could not derive order status (invalid transition)",
        tenantId,
        details: { orderId, fromStatus: order.status, derivedStatus }
      });
    }
  }
}

export async function updateKdsTaskStatus(
  tenantId: string,
  taskId: string,
  newStatus: string,
  staffId: string
): Promise<void> {
  const db = getDb();
  
  const { validateKdsTaskStatusTransition } = await import("@/lib/ordering/order-state-machines");

  await db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(kdsTasks)
      .where(and(eq(kdsTasks.tenantId, tenantId), eq(kdsTasks.taskId, taskId)))
      .limit(1);

    if (!task) {
      throw new Error("KDS Task not found");
    }

    validateKdsTaskStatusTransition(task.taskStatus as any, newStatus as any);

    if (task.taskStatus !== newStatus) {
      await tx
        .update(kdsTasks)
        .set({ taskStatus: newStatus, updatedAt: new Date() })
        .where(eq(kdsTasks.taskId, taskId));

      const { kdsTaskHistory } = await import("@/db/schema/operations");
      await tx.insert(kdsTaskHistory).values({
        tenantId,
        taskId,
        fromStatus: task.taskStatus,
        toStatus: newStatus,
        changedByUserId: staffId,
        reason: "Manual KDS task update",
      });

      // Update the Order Item status to match
      let orderItemStatus = newStatus;
      if (newStatus === "DONE") {
        orderItemStatus = "READY"; // Or SERVED depending on mapping, let's keep it simple
      }
      
      await tx
        .update(orderItems)
        .set({ itemStatus: orderItemStatus, updatedAt: new Date() })
        .where(eq(orderItems.orderItemId, task.orderItemId));

      // Derive Order Status
      await recalculateOrderStatusFromKdsTasks(tenantId, task.orderId, tx);

      // Audit Log
      const { recordAuditEvent } = await import("@/lib/audit");
      await recordAuditEvent({
        tenantId,
        userId: staffId,
        action: "restaurant.kds_task.status_updated",
        resourceType: "kds_task",
        resourceId: taskId,
        payload: {
          orderId: task.orderId,
          orderItemId: task.orderItemId,
          fromStatus: task.taskStatus,
          toStatus: newStatus,
        },
      });
    }
  });
}

export interface KdsTaskQueryFilters {
  outletId: string;
  stationRouting?: string;
  taskStatus?: string;
  limit?: number;
  offset?: number;
}

/**
 * Retrieves ordered KDS tasks for kitchen/station displays.
 * Strictly bounded FIFO queue ordering (oldest pending tickets first).
 */
export async function listKdsTasks(
  tenantId: string,
  filters: KdsTaskQueryFilters
) {
  const db = getDb();

  const conditions = [
    eq(kdsTasks.tenantId, tenantId),
    eq(kdsTasks.outletId, filters.outletId),
  ];

  if (filters.stationRouting) {
    conditions.push(eq(kdsTasks.stationRouting, filters.stationRouting));
  }

  if (filters.taskStatus) {
    conditions.push(eq(kdsTasks.taskStatus, filters.taskStatus));
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
