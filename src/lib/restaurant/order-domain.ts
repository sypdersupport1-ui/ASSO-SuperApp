import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { orders, orderItems, type Order, type OrderItem } from "@/db/schema/operations";
import { restaurantTableSessions } from "@/db/schema/restaurant";
import { customers } from "@/db/schema/core";
import { ValidationError, NotFoundError } from "@/lib/api/errors";
import {
  type OrderStatus,
  type OrderSource,
  type DiningContext,
  validateOrderStatusTransition,
} from "@/lib/ordering/order-state-machines";

/**
 * Generates an authoritative, human-readable restaurant order number.
 * Format: RO-YYYYMMDD-XXXX (e.g. RO-20261001-4921)
 */
export function generateRestaurantOrderNumber(date: Date = new Date()): string {
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RO-${dateStr}-${rand}`;
}

export interface RestaurantOrderItemSnapshot {
  orderItemId: string;
  itemId: string;
  itemName: string;
  unitPrice: string;
  quantity: number;
  subtotal: string;
  fulfillmentStation: string;
  itemStatus: string;
  specialNotes?: string | null;
}

export interface RestaurantOrderSnapshot {
  orderId: string;
  tenantId: string;
  outletId: string;
  tableId: string | null;
  tableSessionId: string | null;
  customerId: string | null;
  orderNumber: string;
  orderSource: string;
  diningContext: string;
  status: OrderStatus;
  subtotalAmount: string;
  taxRate: string;
  taxAmount: string;
  platformFeeType: string;
  platformFeeRate: string;
  platformFeeAmount: string;
  discountAmount: string;
  totalAmount: string;
  items: RestaurantOrderItemSnapshot[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Validates that an item's subtotal matches its unit price * quantity snapshot.
 */
export function validateItemPriceSnapshot(
  unitPrice: string,
  quantity: number,
  subtotal: string
): boolean {
  const priceNum = parseFloat(unitPrice);
  const subtotalNum = parseFloat(subtotal);
  if (isNaN(priceNum) || isNaN(subtotalNum) || quantity <= 0) {
    return false;
  }
  const calculated = (priceNum * quantity).toFixed(4);
  return parseFloat(calculated) === parseFloat(subtotalNum.toFixed(4));
}

export interface OrderFinancialOptions {
  taxRate?: number;
  platformFeeRate?: number;
  platformFeeFixed?: number;
  platformFeeType?: "PERCENTAGE" | "FIXED";
  discountAmount?: number;
}

/**
 * Authoritatively calculates order subtotal, configured tax, platform fee, and total from line items.
 * If no tax or platform fee options are passed, defaults to safe zero (no tax, no fee).
 */
export function calculateAuthoritativeTotals(
  items: Array<{ unitPrice: string; quantity: number }>,
  optionsOrTaxRate: number | OrderFinancialOptions = 0
): {
  subtotalAmount: string;
  taxRate: string;
  taxAmount: string;
  platformFeeType: string;
  platformFeeRate: string;
  platformFeeAmount: string;
  discountAmount: string;
  totalAmount: string;
} {
  const taxRate =
    typeof optionsOrTaxRate === "number"
      ? optionsOrTaxRate
      : optionsOrTaxRate.taxRate ?? 0;
  const platformFeeType =
    typeof optionsOrTaxRate === "object"
      ? optionsOrTaxRate.platformFeeType ?? "PERCENTAGE"
      : "PERCENTAGE";
  const platformFeeRate =
    typeof optionsOrTaxRate === "object"
      ? optionsOrTaxRate.platformFeeRate ?? 0
      : 0;
  const platformFeeFixed =
    typeof optionsOrTaxRate === "object"
      ? optionsOrTaxRate.platformFeeFixed ?? 0
      : 0;
  const discountAmount =
    typeof optionsOrTaxRate === "object"
      ? optionsOrTaxRate.discountAmount ?? 0
      : 0;

  let subtotal = 0;
  for (const item of items) {
    const price = parseFloat(item.unitPrice);
    if (isNaN(price) || price < 0 || item.quantity <= 0) {
      throw new ValidationError("Invalid unit price or quantity in order items.");
    }
    subtotal += price * item.quantity;
  }

  const tax = Math.round((subtotal * taxRate + Number.EPSILON) * 10000) / 10000;
  let platformFee = 0;
  if (platformFeeType === "PERCENTAGE") {
    platformFee =
      Math.round((subtotal * platformFeeRate + Number.EPSILON) * 10000) / 10000;
  } else {
    platformFee =
      Math.round((platformFeeFixed + Number.EPSILON) * 10000) / 10000;
  }
  const total =
    Math.round((subtotal + tax + platformFee - discountAmount + Number.EPSILON) * 10000) /
    10000;

  return {
    subtotalAmount: subtotal.toFixed(4),
    taxRate: taxRate.toFixed(4),
    taxAmount: tax.toFixed(4),
    platformFeeType,
    platformFeeRate: platformFeeRate.toFixed(4),
    platformFeeAmount: platformFee.toFixed(4),
    discountAmount: discountAmount.toFixed(4),
    totalAmount: total.toFixed(4),
  };
}

/**
 * Fetches all orders belonging to a table session.
 * Crucial invariant: Supports multiple orders per dining session (e.g. initial drinks, mains, second round).
 */
export async function getOrdersByTableSession(
  tenantId: string,
  tableSessionId: string
): Promise<RestaurantOrderSnapshot[]> {
  const db = getDb();

  // 1. Verify table session exists
  const [session] = await db
    .select()
    .from(restaurantTableSessions)
    .where(
      and(
        eq(restaurantTableSessions.sessionId, tableSessionId),
        eq(restaurantTableSessions.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!session) {
    throw new NotFoundError("Table Session", `Session '${tableSessionId}' not found.`);
  }

  // 2. Fetch all orders for this table session
  const orderRows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.tableSessionId, tableSessionId)
      )
    )
    .orderBy(desc(orders.createdAt));

  if (orderRows.length === 0) {
    return [];
  }

  // 3. Fetch all line items for these orders
  const snapshots: RestaurantOrderSnapshot[] = [];

  for (const o of orderRows) {
    const itemRows = await db
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.tenantId, tenantId),
          eq(orderItems.orderId, o.orderId)
        )
      );

    snapshots.push({
      orderId: o.orderId,
      tenantId: o.tenantId,
      outletId: o.outletId,
      tableId: o.tableId,
      tableSessionId: o.tableSessionId,
      customerId: o.customerId,
      orderNumber: o.orderNumber,
      orderSource: o.orderSource,
      diningContext: o.diningContext,
      status: o.status as OrderStatus,
      subtotalAmount: o.subtotalAmount,
      taxRate: o.taxRate || "0.0000",
      taxAmount: o.taxAmount,
      platformFeeType: o.platformFeeType || "PERCENTAGE",
      platformFeeRate: o.platformFeeRate || "0.0000",
      platformFeeAmount: o.platformFeeAmount || "0.0000",
      discountAmount: o.discountAmount,
      totalAmount: o.totalAmount,
      items: itemRows.map((item) => ({
        orderItemId: item.orderItemId,
        itemId: item.itemId,
        itemName: item.itemName,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.subtotal,
        fulfillmentStation: item.fulfillmentStation,
        itemStatus: item.itemStatus,
        specialNotes: item.specialNotes,
      })),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    });
  }

  return snapshots;
}

/**
 * Fetches a single restaurant order and its line items by ID.
 */
export async function getRestaurantOrderById(
  tenantId: string,
  orderId: string
): Promise<RestaurantOrderSnapshot> {
  const db = getDb();

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orderId, orderId), eq(orders.tenantId, tenantId)))
    .limit(1);

  if (!order) {
    throw new NotFoundError("Restaurant Order", `Order '${orderId}' not found.`);
  }

  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, orderId)));

  return {
    orderId: order.orderId,
    tenantId: order.tenantId,
    outletId: order.outletId,
    tableId: order.tableId,
    tableSessionId: order.tableSessionId,
    customerId: order.customerId,
    orderNumber: order.orderNumber,
    orderSource: order.orderSource,
    diningContext: order.diningContext,
    status: order.status as OrderStatus,
    subtotalAmount: order.subtotalAmount,
    taxRate: order.taxRate || "0.0000",
    taxAmount: order.taxAmount,
    platformFeeType: order.platformFeeType || "PERCENTAGE",
    platformFeeRate: order.platformFeeRate || "0.0000",
    platformFeeAmount: order.platformFeeAmount || "0.0000",
    discountAmount: order.discountAmount,
    totalAmount: order.totalAmount,
    items: items.map((item) => ({
      orderItemId: item.orderItemId,
      itemId: item.itemId,
      itemName: item.itemName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.subtotal,
      fulfillmentStation: item.fulfillmentStation,
      itemStatus: item.itemStatus,
      specialNotes: item.specialNotes,
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
