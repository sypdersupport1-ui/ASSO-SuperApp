import { eq, and, inArray, desc, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  orders,
  orderItems,
  orderStatusHistory,
  catalogItems,
  catalogCategories,
  catalogs,
  type Order,
} from "@/db/schema/operations";
import {
  restaurantTables,
  restaurantTableSessions,
  restaurantCartItems,
} from "@/db/schema/restaurant";
import { customerSessions } from "@/db/schema/context";
import { customers } from "@/db/schema/core";
import { assertModuleEntitlement } from "@/lib/entitlements/checker";
import {
  AuthenticationError,
  ValidationError,
  NotFoundError,
  BusinessRuleError,
} from "@/lib/api/errors";
import { generateRestaurantOrderNumber } from "@/lib/restaurant/order-domain";
import {
  mapToCustomerOrderStatus,
  type OrderStatus,
  type OrderSource,
  type CustomerDisplayOrderStatus,
} from "@/lib/ordering/order-state-machines";
import {
  createDomainEvent,
  recordOutboxEvent,
  processOutboxBatch,
} from "@/lib/events/outbox";
import type { OrderConfirmedPayload } from "@/lib/events/types";
import { recordAuditEvent } from "@/lib/audit";
import { realtimeHub } from "@/lib/realtime/sse";
import type { JwtPayload } from "@/lib/auth/jwt";
import {
  getEffectiveTaxConfig,
  getEffectivePlatformFeeConfig,
} from "./financial-config-service";
import { Decimal, calculateExactOrderTotals } from "@/lib/decimal";

export interface CreateRestaurantOrderInput {
  guestNotes?: string;
  idempotencyKey?: string;
  orderSource?: OrderSource;
}

export interface CustomerOrderItemDto {
  orderItemId: string;
  itemId: string;
  itemName: string;
  unitPrice: string;
  quantity: number;
  subtotal: string;
  fulfillmentStation: string;
  specialNotes?: string | null;
}

export interface CustomerOrderResponseDto {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  displayStatus: CustomerDisplayOrderStatus;
  tableNumber: string;
  tableSessionId: string;
  customerId?: string | null;
  customerName?: string | null;
  diningContext: string;
  orderSource: string;
  subtotalAmount: string;
  taxRate: string;
  taxAmount: string;
  platformFeeType: string;
  platformFeeRate: string;
  platformFeeAmount: string;
  discountAmount: string;
  totalAmount: string;
  itemCount: number;
  items: CustomerOrderItemDto[];
  guestNotes?: string | null;
  createdAt: string;
}

/**
 * Creates an authoritative Restaurant Dine-In Order from the customer's active session cart.
 *
 * Core Invariants:
 * 1. The server is the SOLE authority for pricing, tax, totals, table context, and status.
 * 2. Requires an active, unexpired customer session and an active table dining session.
 * 3. Atomic execution: order header, line items, cart clearing, status history, and outbox event
 *    are committed together in a single PostgreSQL transaction. If any part fails, nothing is committed.
 * 4. Idempotency: Duplicate operations with the same idempotency key return the cached authoritative order.
 * 5. Re-validates catalog item availability and freezes immutable price snapshots at the time of creation.
 */
export async function createRestaurantOrder(
  user: JwtPayload,
  input?: CreateRestaurantOrderInput
): Promise<{ order: CustomerOrderResponseDto; isIdempotentReplay: boolean }> {
  // 1. Session verification & scope guard
  if (!user || !user.tenantId || !user.sub) {
    throw new AuthenticationError("Invalid or unbound customer session.");
  }

  if (user.sessionType !== "CUSTOMER" && user.sessionType !== "STAFF") {
    throw new AuthenticationError("A valid customer or staff session token is required to place an order.");
  }

  const tenantId = user.tenantId;

  // 2. Entitlement verification
  assertModuleEntitlement(tenantId, "RESTAURANT", user.isSuperAdmin || false);

  const db = getDb();

  // 3. Idempotency check: if an order with this idempotency key already exists in this tenant, replay it
  if (input?.idempotencyKey) {
    const [existingOrder] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);

    if (existingOrder) {
      return {
        order: await formatExistingOrderResponse(tenantId, existingOrder),
        isIdempotentReplay: true,
      };
    }
  }

  // 4. Validate customer session
  const [customerSession] = await db
    .select()
    .from(customerSessions)
    .where(
      and(
        eq(customerSessions.sessionId, user.sub),
        eq(customerSessions.tenantId, tenantId),
        eq(customerSessions.sessionStatus, "ACTIVE"),
        gt(customerSessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!customerSession) {
    throw new AuthenticationError("Active customer session not found or expired. Please re-scan table QR.");
  }

  const outletId = customerSession.outletId;
  const contextId = customerSession.contextId;

  // 5. Validate physical table context
  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.contextId, contextId),
        eq(restaurantTables.tenantId, tenantId),
        eq(restaurantTables.outletId, outletId)
      )
    )
    .limit(1);

  if (!table) {
    throw new NotFoundError("Restaurant Table", "Physical table context not found for this outlet.");
  }

  if (!table.isActive || table.status === "OUT_OF_SERVICE") {
    throw new BusinessRuleError(`Table '${table.tableNumber}' is currently out of service or inactive.`);
  }

  // 6. Validate active table dining session
  const [activeTableSession] = await db
    .select()
    .from(restaurantTableSessions)
    .where(
      and(
        eq(restaurantTableSessions.tableId, table.tableId),
        eq(restaurantTableSessions.tenantId, tenantId),
        eq(restaurantTableSessions.outletId, outletId),
        eq(restaurantTableSessions.status, "ACTIVE")
      )
    )
    .limit(1);

  if (!activeTableSession) {
    throw new BusinessRuleError(
      `Cannot place order: No active dining session on Table ${table.tableNumber}. Please contact restaurant staff.`
    );
  }

  // 7. Authoritatively load pre-order cart items from server storage
  const cartRows = await db
    .select()
    .from(restaurantCartItems)
    .where(
      and(
        eq(restaurantCartItems.sessionId, customerSession.sessionId),
        eq(restaurantCartItems.tenantId, tenantId)
      )
    );

  if (!cartRows || cartRows.length === 0) {
    throw new ValidationError("Cart is empty. Add items to your cart before placing an order.");
  }

  // 8. Batch load catalog items and validate availability, active catalog, and category
  const itemIds = cartRows.map((c) => c.itemId);
  const catalogRows = await db
    .select({
      item: catalogItems,
      categoryActive: catalogCategories.isActive,
      catalogActive: catalogs.isActive,
      catalogOutletId: catalogs.outletId,
    })
    .from(catalogItems)
    .innerJoin(catalogCategories, eq(catalogItems.categoryId, catalogCategories.categoryId))
    .innerJoin(catalogs, eq(catalogCategories.catalogId, catalogs.catalogId))
    .where(
      and(
        eq(catalogItems.tenantId, tenantId),
        inArray(catalogItems.itemId, itemIds)
      )
    );

  const catalogMap = new Map<string, typeof catalogRows[number]>();
  for (const row of catalogRows) {
    catalogMap.set(row.item.itemId, row);
  }

  for (const cartLine of cartRows) {
    const catalogEntry = catalogMap.get(cartLine.itemId);
    if (!catalogEntry) {
      throw new ValidationError(`Menu item '${cartLine.itemId}' was not found in the restaurant catalog.`);
    }

    // Verify outlet catalog ownership
    if (catalogEntry.catalogOutletId !== outletId) {
      throw new ValidationError(`Item '${catalogEntry.item.name}' belongs to a different restaurant outlet.`);
    }

    // Verify active catalog and category
    if (!catalogEntry.catalogActive || !catalogEntry.categoryActive) {
      throw new BusinessRuleError(`Item '${catalogEntry.item.name}' belongs to an inactive menu category.`);
    }

    // Verify item availability
    if (!catalogEntry.item.isAvailable) {
      throw new BusinessRuleError(
        `"${catalogEntry.item.name}" is currently unavailable or sold out. Please remove it from your cart.`
      );
    }

    // Verify positive quantity
    if (cartLine.quantity < 1 || cartLine.quantity > 50) {
      throw new ValidationError(`Quantity for '${catalogEntry.item.name}' must be between 1 and 50.`);
    }
  }

  // 9. Authoritatively resolve dynamic GST & ASSO Platform Fee configuration from DB
  const taxConfig = await getEffectiveTaxConfig(tenantId, outletId);
  const platformFeeConfig = await getEffectivePlatformFeeConfig(tenantId, outletId);

  // 10. Calculate server-authoritative prices and snapshot amounts via exact Decimal arithmetic
  const orderItemsInput = cartRows.map((cartLine) => {
    const catalogEntry = catalogMap.get(cartLine.itemId)!;
    return {
      itemId: catalogEntry.item.itemId,
      itemName: catalogEntry.item.name,
      unitPrice: catalogEntry.item.basePrice,
      quantity: cartLine.quantity,
      fulfillmentStation: catalogEntry.item.fulfillmentStation || "KITCHEN",
      specialNotes: cartLine.specialInstructions?.trim() || null,
    };
  });

  const totals = calculateExactOrderTotals({
    items: orderItemsInput,
    taxRate: taxConfig.taxRate,
    platformFeeType: platformFeeConfig.isEnabled ? platformFeeConfig.feeType : "PERCENTAGE",
    platformFeeRate: platformFeeConfig.isEnabled ? platformFeeConfig.feeRate : "0.0000",
    platformFeeFixed: platformFeeConfig.isEnabled ? platformFeeConfig.fixedAmount : "0.0000",
    discountAmount: "0.0000",
  });

  // Generate authoritative unique order number
  const orderNumber = generateRestaurantOrderNumber();

  // Authoritative order source: CUSTOMER_WEB for customer sessions
  const authoritativeOrderSource: OrderSource =
    user.sessionType === "STAFF" && input?.orderSource === "POS"
      ? "POS"
      : "CUSTOMER_WEB";

  // 11. Execute single atomic PostgreSQL transaction
  const { createdOrder, insertedItems } = await db.transaction(async (tx) => {
    // A. Insert Order Header
    const [insertedOrder] = await tx
      .insert(orders)
      .values({
        tenantId,
        outletId,
        contextId,
        sessionId: customerSession.sessionId,
        customerId: customerSession.customerId || null,
        tableId: table.tableId,
        tableSessionId: activeTableSession.sessionId,
        orderNumber,
        orderSource: authoritativeOrderSource,
        diningContext: "DINE_IN",
        status: "PLACED",
        idempotencyKey: input?.idempotencyKey || null,
        subtotalAmount: totals.subtotalAmountDb,
        taxRate: totals.taxRateDb,
        taxAmount: totals.taxAmountDb,
        platformFeeType: totals.platformFeeType,
        platformFeeRate: totals.platformFeeRateDb,
        platformFeeAmount: totals.platformFeeAmountDb,
        discountAmount: totals.discountAmountDb,
        totalAmount: totals.totalAmountDb,
      })
      .returning();

    // B. Insert Order Items (Immutable Snapshots)
    const itemsList: CustomerOrderItemDto[] = [];
    for (const snap of totals.lineItems) {
      const [insertedItem] = await tx
        .insert(orderItems)
        .values({
          tenantId,
          orderId: insertedOrder.orderId,
          itemId: snap.itemId!,
          itemName: snap.itemName!,
          unitPrice: snap.unitPriceDb,
          quantity: snap.quantity,
          subtotal: snap.subtotalDb,
          fulfillmentStation: snap.fulfillmentStation || "KITCHEN",
          itemStatus: "PLACED",
          specialNotes: snap.specialNotes,
        })
        .returning();

      itemsList.push({
        orderItemId: insertedItem.orderItemId,
        itemId: insertedItem.itemId,
        itemName: insertedItem.itemName,
        unitPrice: Decimal.from(insertedItem.unitPrice).toFixed(2),
        quantity: insertedItem.quantity,
        subtotal: Decimal.from(insertedItem.subtotal).toFixed(2),
        fulfillmentStation: insertedItem.fulfillmentStation,
        specialNotes: insertedItem.specialNotes,
      });
    }

    // C. Record initial order status history
    await tx.insert(orderStatusHistory).values({
      tenantId,
      orderId: insertedOrder.orderId,
      fromStatus: "PLACED",
      toStatus: "PLACED",
      reason: input?.guestNotes || "Customer placed restaurant dine-in order",
    });

    // D. Clear customer cart atomically
    await tx
      .delete(restaurantCartItems)
      .where(
        and(
          eq(restaurantCartItems.sessionId, customerSession.sessionId),
          eq(restaurantCartItems.tenantId, tenantId)
        )
      );

    // E. Record trusted ORDER_CONFIRMED event into transactional outbox
    const orderConfirmedEvent = createDomainEvent<OrderConfirmedPayload>({
      tenantId,
      outletId,
      vertical: "RESTAURANT",
      eventType: "ORDER_CONFIRMED",
      aggregateType: "ORDER",
      aggregateId: insertedOrder.orderId,
      payload: {
        vertical: "RESTAURANT",
        orderId: insertedOrder.orderId,
        orderNumber: insertedOrder.orderNumber,
        orderSource: authoritativeOrderSource === "POS" ? "STAFF_POS" : "CUSTOMER_WEB",
        contextId,
        contextType: "RESTAURANT_TABLE",
        tableNumber: table.tableNumber,
        totalAmount: totals.totalAmountDto,
        itemCount: itemsList.length,
        customerId: customerSession.customerId || undefined,
        customerName: customerSession.customerName || undefined,
        customerPhone: customerSession.customerPhone || undefined,
      },
      idempotencyKey: `ORDER_CONFIRMED:${insertedOrder.orderId}`,
    });

    await recordOutboxEvent(tx, orderConfirmedEvent);

    return { createdOrder: insertedOrder, insertedItems: itemsList };
  });

  // 12. Post-Commit Side Effects
  // Audit log
  await recordAuditEvent({
    tenantId,
    userId: user.sub,
    action: "restaurant.order.created",
    resourceType: "order",
    resourceId: createdOrder.orderId,
    payload: {
      actorType: user.sessionType === "STAFF" ? "STAFF" : "CUSTOMER",
      orderNumber: createdOrder.orderNumber,
      tableNumber: table.tableNumber,
      tableSessionId: activeTableSession.sessionId,
      totalAmount: totals.totalAmountDto,
      itemCount: insertedItems.length,
    },
  });

  // Realtime notification broadcast
  await realtimeHub.broadcastToTenant(tenantId, "restaurant:order_created", {
    orderId: createdOrder.orderId,
    orderNumber: createdOrder.orderNumber,
    tableNumber: table.tableNumber,
    tableSessionId: activeTableSession.sessionId,
    status: "PLACED",
    totalAmount: totals.totalAmountDto,
    itemCount: insertedItems.length,
  });

  // Asynchronous outbox dispatch trigger
  processOutboxBatch({ tenantId, batchSize: 5 }).catch(() => {});

  // 13. Return structured customer-facing response
  return {
    order: {
      orderId: createdOrder.orderId,
      orderNumber: createdOrder.orderNumber,
      status: createdOrder.status as OrderStatus,
      displayStatus: mapToCustomerOrderStatus(createdOrder.status),
      tableNumber: table.tableNumber,
      tableSessionId: activeTableSession.sessionId,
      customerId: createdOrder.customerId,
      customerName: customerSession.customerName || null,
      diningContext: createdOrder.diningContext,
      orderSource: createdOrder.orderSource,
      subtotalAmount: Decimal.from(createdOrder.subtotalAmount).toFixed(2),
      taxRate: Decimal.from(createdOrder.taxRate || "0").toFixed(4),
      taxAmount: Decimal.from(createdOrder.taxAmount || "0").toFixed(2),
      platformFeeType: createdOrder.platformFeeType,
      platformFeeRate: Decimal.from(createdOrder.platformFeeRate || "0").toFixed(4),
      platformFeeAmount: Decimal.from(createdOrder.platformFeeAmount || "0").toFixed(2),
      discountAmount: Decimal.from(createdOrder.discountAmount || "0").toFixed(2),
      totalAmount: Decimal.from(createdOrder.totalAmount).toFixed(2),
      itemCount: insertedItems.length,
      items: insertedItems,
      guestNotes: input?.guestNotes || null,
      createdAt: createdOrder.createdAt.toISOString(),
    },
    isIdempotentReplay: false,
  };
}

/**
 * Replays an existing order response safely when an idempotency key matches an existing record.
 */
async function formatExistingOrderResponse(
  tenantId: string,
  existingOrder: Order
): Promise<CustomerOrderResponseDto> {
  const db = getDb();

  const items = await db
    .select()
    .from(orderItems)
    .where(
      and(
        eq(orderItems.orderId, existingOrder.orderId),
        eq(orderItems.tenantId, tenantId)
      )
    );

  let tableNumber = "Unknown";
  if (existingOrder.tableId) {
    const [t] = await db
      .select({ tableNumber: restaurantTables.tableNumber })
      .from(restaurantTables)
      .where(eq(restaurantTables.tableId, existingOrder.tableId))
      .limit(1);
    if (t) tableNumber = t.tableNumber;
  }

  let customerName: string | null = null;
  if (existingOrder.customerId) {
    const [c] = await db
      .select({ fullName: customers.fullName })
      .from(customers)
      .where(eq(customers.customerId, existingOrder.customerId))
      .limit(1);
    if (c) customerName = c.fullName;
  }

  return {
    orderId: existingOrder.orderId,
    orderNumber: existingOrder.orderNumber,
    status: existingOrder.status as OrderStatus,
    displayStatus: mapToCustomerOrderStatus(existingOrder.status),
    tableNumber,
    tableSessionId: existingOrder.tableSessionId || "",
    customerId: existingOrder.customerId,
    customerName,
    diningContext: existingOrder.diningContext,
    orderSource: existingOrder.orderSource,
    subtotalAmount: Decimal.from(existingOrder.subtotalAmount).toFixed(2),
    taxRate: Decimal.from(existingOrder.taxRate || "0").toFixed(4),
    taxAmount: Decimal.from(existingOrder.taxAmount || "0").toFixed(2),
    platformFeeType: existingOrder.platformFeeType || "PERCENTAGE",
    platformFeeRate: Decimal.from(existingOrder.platformFeeRate || "0").toFixed(4),
    platformFeeAmount: Decimal.from(existingOrder.platformFeeAmount || "0").toFixed(2),
    discountAmount: Decimal.from(existingOrder.discountAmount || "0").toFixed(2),
    totalAmount: Decimal.from(existingOrder.totalAmount).toFixed(2),
    itemCount: items.length,
    items: items.map((it) => ({
      orderItemId: it.orderItemId,
      itemId: it.itemId,
      itemName: it.itemName,
      unitPrice: Decimal.from(it.unitPrice).toFixed(2),
      quantity: it.quantity,
      subtotal: Decimal.from(it.subtotal).toFixed(2),
      fulfillmentStation: it.fulfillmentStation,
      specialNotes: it.specialNotes,
    })),
    guestNotes: null,
    createdAt: existingOrder.createdAt.toISOString(),
  };
}

/**
 * Retrieves all orders for the current customer session or active table session.
 */
export async function listCustomerSessionOrders(
  user: JwtPayload,
  limit: number = 50
): Promise<CustomerOrderResponseDto[]> {
  if (!user || !user.tenantId || !user.sub) {
    throw new AuthenticationError("Invalid customer session.");
  }

  // Clamp unreasonable limits
  const safeLimit = Math.min(Math.max(1, limit), 100);

  const tenantId = user.tenantId;
  const db = getDb();

  // Find customer session
  const [session] = await db
    .select()
    .from(customerSessions)
    .where(
      and(
        eq(customerSessions.sessionId, user.sub),
        eq(customerSessions.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!session) {
    throw new NotFoundError("Customer Session", "Customer session not found.");
  }

  // Find table and active table session
  const [table] = await db
    .select()
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.contextId, session.contextId),
        eq(restaurantTables.tenantId, tenantId)
      )
    )
    .limit(1);

  const orderConditions = [eq(orders.tenantId, tenantId)];

  if (table) {
    const [activeTableSession] = await db
      .select()
      .from(restaurantTableSessions)
      .where(
        and(
          eq(restaurantTableSessions.tableId, table.tableId),
          eq(restaurantTableSessions.tenantId, tenantId),
          eq(restaurantTableSessions.status, "ACTIVE")
        )
      )
      .limit(1);

    if (activeTableSession) {
      orderConditions.push(eq(orders.tableSessionId, activeTableSession.sessionId));
    } else {
      orderConditions.push(eq(orders.sessionId, session.sessionId));
    }
  } else {
    orderConditions.push(eq(orders.sessionId, session.sessionId));
  }

  const sessionOrders = await db
    .select()
    .from(orders)
    .where(and(...orderConditions))
    .orderBy(desc(orders.createdAt))
    .limit(safeLimit);

  if (sessionOrders.length === 0) {
    return [];
  }

  const orderIds = sessionOrders.map((o) => o.orderId);
  const tableIds = Array.from(new Set(sessionOrders.map((o) => o.tableId).filter(Boolean))) as string[];
  const customerIds = Array.from(new Set(sessionOrders.map((o) => o.customerId).filter(Boolean))) as string[];

  // Batch 1: Order items
  const allItems = await db
    .select()
    .from(orderItems)
    .where(
      and(
        eq(orderItems.tenantId, tenantId),
        inArray(orderItems.orderId, orderIds)
      )
    );

  const itemsByOrderId = new Map<string, typeof allItems>();
  for (const item of allItems) {
    let list = itemsByOrderId.get(item.orderId);
    if (!list) {
      list = [];
      itemsByOrderId.set(item.orderId, list);
    }
    list.push(item);
  }

  // Batch 2: Tables
  const tableMap = new Map<string, string>();
  if (tableIds.length > 0) {
    const tableRows = await db
      .select({ tableId: restaurantTables.tableId, tableNumber: restaurantTables.tableNumber })
      .from(restaurantTables)
      .where(
        and(
          eq(restaurantTables.tenantId, tenantId),
          inArray(restaurantTables.tableId, tableIds)
        )
      );
    for (const t of tableRows) {
      tableMap.set(t.tableId, t.tableNumber);
    }
  }

  // Batch 3: Customers
  const customerMap = new Map<string, string>();
  if (customerIds.length > 0) {
    const customerRows = await db
      .select({ customerId: customers.customerId, fullName: customers.fullName })
      .from(customers)
      .where(
        and(
          eq(customers.tenantId, tenantId),
          inArray(customers.customerId, customerIds)
        )
      );
    for (const c of customerRows) {
      customerMap.set(c.customerId, c.fullName);
    }
  }

  return sessionOrders.map((existingOrder) => {
    const items = itemsByOrderId.get(existingOrder.orderId) || [];
    const tableNumber = (existingOrder.tableId && tableMap.get(existingOrder.tableId)) || "Unknown";
    const customerName = (existingOrder.customerId && customerMap.get(existingOrder.customerId)) || null;

    return {
      orderId: existingOrder.orderId,
      orderNumber: existingOrder.orderNumber,
      status: existingOrder.status as OrderStatus,
      displayStatus: mapToCustomerOrderStatus(existingOrder.status),
      tableNumber,
      tableSessionId: existingOrder.tableSessionId || "",
      customerId: existingOrder.customerId,
      customerName,
      diningContext: existingOrder.diningContext,
      orderSource: existingOrder.orderSource,
      subtotalAmount: Decimal.from(existingOrder.subtotalAmount).toFixed(2),
      taxRate: Decimal.from(existingOrder.taxRate || "0").toFixed(4),
      taxAmount: Decimal.from(existingOrder.taxAmount || "0").toFixed(2),
      platformFeeType: existingOrder.platformFeeType || "PERCENTAGE",
      platformFeeRate: Decimal.from(existingOrder.platformFeeRate || "0").toFixed(4),
      platformFeeAmount: Decimal.from(existingOrder.platformFeeAmount || "0").toFixed(2),
      discountAmount: Decimal.from(existingOrder.discountAmount || "0").toFixed(2),
      totalAmount: Decimal.from(existingOrder.totalAmount).toFixed(2),
      itemCount: items.length,
      items: items.map((it) => ({
        orderItemId: it.orderItemId,
        itemId: it.itemId,
        itemName: it.itemName,
        unitPrice: Decimal.from(it.unitPrice).toFixed(2),
        quantity: it.quantity,
        subtotal: Decimal.from(it.subtotal).toFixed(2),
        fulfillmentStation: it.fulfillmentStation,
        specialNotes: it.specialNotes,
      })),
      guestNotes: null,
      createdAt: existingOrder.createdAt.toISOString(),
    };
  });
}
