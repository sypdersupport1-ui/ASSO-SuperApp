import crypto from "crypto";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  catalogs,
  catalogCategories,
  catalogItems,
  orders,
  orderItems,
  orderStatusHistory,
} from "@/db/schema/operations";

type CatalogItem = typeof catalogItems.$inferSelect;
import { hotelRooms, hotelStays, hotelGuests } from "@/db/schema/hotel";
import { customers, outlets, organizations } from "@/db/schema/core";
import { recordAuditEvent } from "@/lib/audit";
import { getRealtimeHub } from "@/lib/realtime/sse";
import { type JwtPayload } from "@/lib/auth/jwt";
import {
  ValidationError,
  NotFoundError,
  BusinessRuleError,
  AuthenticationError,
} from "@/lib/api/errors";
import {
  type OrderStatus,
  validateOrderStatusTransition,
  canCustomerCancelOrder,
  mapToCustomerOrderStatus,
  type CustomerDisplayOrderStatus,
} from "@/lib/ordering/order-state-machines";

// ============================================================================
// DTOs & Types
// ============================================================================

export interface CatalogItemDto {
  itemId: string;
  categoryId: string;
  name: string;
  description: string | null;
  sku: string | null;
  basePrice: string; // e.g. "550.00"
  taxRate: string;   // e.g. "0.0500"
  isAvailable: boolean;
  fulfillmentStation: string;
}

export interface CatalogCategoryDto {
  categoryId: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  items: CatalogItemDto[];
}

export interface HotelMenuDto {
  catalogId: string;
  catalogName: string;
  categories: CatalogCategoryDto[];
}

export interface OrderItemInput {
  itemId: string;
  quantity: number;
  specialNotes?: string;
}

export interface CreateRoomServiceOrderInput {
  items: OrderItemInput[];
  guestNotes?: string;
  idempotencyKey?: string;
}

export interface OrderLineItemDto {
  orderItemId: string;
  itemId: string;
  itemName: string;
  unitPrice: string;
  quantity: number;
  subtotal: string;
  specialNotes?: string | null;
}

export interface CustomerOrderDto {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  displayStatus: CustomerDisplayOrderStatus;
  roomNumber: string;
  guestName?: string | null;
  items: OrderLineItemDto[];
  subtotalAmount: string;
  taxAmount: string;
  totalAmount: string;
  guestNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffOrderDto extends CustomerOrderDto {
  tenantId: string;
  outletId: string;
  contextId: string;
  roomId?: string;
  stayId?: string | null;
  cancellationReason?: string | null;
  statusHistory?: Array<{
    fromStatus: string;
    toStatus: string;
    createdAt: string;
    reason?: string | null;
  }>;
}

// ============================================================================
// Default Hotel F&B Menu Seed Definition
// ============================================================================

export const DEFAULT_HOTEL_MENU = [
  {
    categoryName: "All-Day Dining & Mains",
    displayOrder: 1,
    items: [
      {
        name: "Classic Club Sandwich with Truffle Fries",
        description: "Toasted brioche, smoked chicken breast or grilled paneer, fried egg, aged cheddar, served with parmesan truffle fries.",
        basePrice: "550.0000",
        sku: "FNB-MAIN-CLUB",
        fulfillmentStation: "KITCHEN",
      },
      {
        name: "Paneer Butter Masala with Garlic Naan",
        description: "Cottage cheese simmered in rich creamy tomato and cashew gravy, served with freshly baked butter garlic naan.",
        basePrice: "620.0000",
        sku: "FNB-MAIN-PBM",
        fulfillmentStation: "KITCHEN",
      },
      {
        name: "Wild Forest Mushroom Risotto",
        description: "Arborio rice cooked with porcini and cremini mushrooms, white truffle oil, and shaved aged Grana Padano.",
        basePrice: "750.0000",
        sku: "FNB-MAIN-RISOTTO",
        fulfillmentStation: "KITCHEN",
      },
      {
        name: "Pan-Seared Norwegian Salmon",
        description: "Crispy skin Atlantic salmon fillet, crushed herbed baby potatoes, sautéed asparagus, and lemon caper emulsion.",
        basePrice: "1250.0000",
        sku: "FNB-MAIN-SALMON",
        fulfillmentStation: "KITCHEN",
      },
    ],
  },
  {
    categoryName: "Breakfast & Bakery",
    displayOrder: 2,
    items: [
      {
        name: "Artisanal Continental Breakfast Set",
        description: "Two freshly baked croissants, Danish pastry, sourdough toast, artisanal fruit preserves, butter, and choice of juice or coffee.",
        basePrice: "450.0000",
        sku: "FNB-BRK-CONT",
        fulfillmentStation: "KITCHEN",
      },
      {
        name: "South Indian Tiffin Platter",
        description: "Steamed fluffy idlis, crispy medu vada, mini masala dosa, served with traditional sambar and three coconut chutneys.",
        basePrice: "380.0000",
        sku: "FNB-BRK-TIFFIN",
        fulfillmentStation: "KITCHEN",
      },
    ],
  },
  {
    categoryName: "Beverages & Refreshments",
    displayOrder: 3,
    items: [
      {
        name: "Freshly Squeezed Valencia Orange Juice",
        description: "100% natural, chilled freshly pressed orange juice with zero added sugar.",
        basePrice: "250.0000",
        sku: "FNB-BEV-OJ",
        fulfillmentStation: "BAR",
      },
      {
        name: "Single-Origin Cold Brew Coffee",
        description: "18-hour slow steeped Arabica coffee served over crystal ice with Madagascar vanilla essence.",
        basePrice: "220.0000",
        sku: "FNB-BEV-COLDBREW",
        fulfillmentStation: "BAR",
      },
      {
        name: "Signature Masala Chai Pot",
        description: "Freshly brewed whole leaf Assam tea with ginger, green cardamom, and aromatic spices (serves 2).",
        basePrice: "180.0000",
        sku: "FNB-BEV-CHAI",
        fulfillmentStation: "BAR",
      },
    ],
  },
  {
    categoryName: "Desserts",
    displayOrder: 4,
    items: [
      {
        name: "Warm Belgian Dark Chocolate Fondant",
        description: "Molten 70% dark chocolate lava cake served with Tahitian vanilla bean gelato.",
        basePrice: "420.0000",
        sku: "FNB-DES-FONDANT",
        fulfillmentStation: "KITCHEN",
      },
      {
        name: "Classic New York Baked Cheesecake",
        description: "Velvety cream cheese cake on graham cracker crust with wild berry compote.",
        basePrice: "450.0000",
        sku: "FNB-DES-CHEESECAKE",
        fulfillmentStation: "KITCHEN",
      },
    ],
  },
];

/**
 * Ensures the default Hotel F&B menu catalog and items exist for the property.
 */
export async function ensureHotelMenuCatalog(tenantId: string, outletId: string): Promise<string> {
  const db = getDb();

  // Check if catalog exists
  const existingCatalogs = await db
    .select()
    .from(catalogs)
    .where(and(eq(catalogs.tenantId, tenantId), eq(catalogs.outletId, outletId)))
    .limit(1);

  let catalogId: string;

  if (existingCatalogs.length > 0) {
    catalogId = existingCatalogs[0].catalogId;
  } else {
    const [newCat] = await db
      .insert(catalogs)
      .values({
        tenantId,
        outletId,
        name: "In-Room Dining Menu",
        description: "24-Hour Gourmet In-Room Dining & Refreshments",
        isActive: true,
      })
      .returning();
    catalogId = newCat.catalogId;
  }

  // Ensure categories and items
  for (const catDef of DEFAULT_HOTEL_MENU) {
    const existingCat = await db
      .select()
      .from(catalogCategories)
      .where(
        and(
          eq(catalogCategories.tenantId, tenantId),
          eq(catalogCategories.catalogId, catalogId),
          eq(catalogCategories.name, catDef.categoryName)
        )
      )
      .limit(1);

    let categoryId: string;
    if (existingCat.length > 0) {
      categoryId = existingCat[0].categoryId;
    } else {
      const [newCatRow] = await db
        .insert(catalogCategories)
        .values({
          tenantId,
          catalogId,
          name: catDef.categoryName,
          displayOrder: catDef.displayOrder,
          isActive: true,
        })
        .returning();
      categoryId = newCatRow.categoryId;
    }

    for (const itemDef of catDef.items) {
      const existingItem = await db
        .select()
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.tenantId, tenantId),
            eq(catalogItems.categoryId, categoryId),
            eq(catalogItems.name, itemDef.name)
          )
        )
        .limit(1);

      if (existingItem.length === 0) {
        await db.insert(catalogItems).values({
          tenantId,
          categoryId,
          name: itemDef.name,
          description: itemDef.description,
          sku: itemDef.sku,
          basePrice: itemDef.basePrice,
          taxRate: "0.0500",
          isAvailable: true,
          fulfillmentStation: itemDef.fulfillmentStation,
        });
      }
    }
  }

  return catalogId;
}

// ============================================================================
// Catalog & Menu Operations
// ============================================================================

/**
 * Lists the active F&B menu catalog for a hotel property.
 */
export async function listHotelCatalog(
  tenantId: string,
  outletId: string,
  includeUnavailable = false
): Promise<HotelMenuDto> {
  const db = getDb();
  await ensureHotelMenuCatalog(tenantId, outletId);

  const [catalogRecord] = await db
    .select()
    .from(catalogs)
    .where(and(eq(catalogs.tenantId, tenantId), eq(catalogs.outletId, outletId)))
    .limit(1);

  if (!catalogRecord) {
    throw new NotFoundError("Hotel F&B catalog not found for this property.");
  }

  const categories = await db
    .select()
    .from(catalogCategories)
    .where(and(eq(catalogCategories.tenantId, tenantId), eq(catalogCategories.catalogId, catalogRecord.catalogId)))
    .orderBy(catalogCategories.displayOrder);

  const allItems = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.tenantId, tenantId));

  const categoryDtos: CatalogCategoryDto[] = categories.map((cat) => {
    let items = allItems.filter((i) => i.categoryId === cat.categoryId);
    if (!includeUnavailable) {
      items = items.filter((i) => i.isAvailable);
    }

    return {
      categoryId: cat.categoryId,
      name: cat.name,
      displayOrder: cat.displayOrder,
      isActive: cat.isActive,
      items: items.map((i) => ({
        itemId: i.itemId,
        categoryId: i.categoryId,
        name: i.name,
        description: i.description,
        sku: i.sku,
        basePrice: parseFloat(i.basePrice).toFixed(2),
        taxRate: i.taxRate,
        isAvailable: i.isAvailable,
        fulfillmentStation: i.fulfillmentStation,
      })),
    };
  });

  return {
    catalogId: catalogRecord.catalogId,
    catalogName: catalogRecord.name,
    categories: categoryDtos,
  };
}

/**
 * Updates a catalog item's availability (86 / In-Stock toggle).
 */
export async function updateCatalogItemAvailability(params: {
  tenantId: string;
  outletId: string;
  itemId: string;
  isAvailable: boolean;
  staffUserId: string;
}): Promise<CatalogItemDto> {
  const { tenantId, outletId, itemId, isAvailable, staffUserId } = params;
  const db = getDb();

  const [item] = await db
    .select()
    .from(catalogItems)
    .where(and(eq(catalogItems.tenantId, tenantId), eq(catalogItems.itemId, itemId)))
    .limit(1);

  if (!item) {
    throw new NotFoundError(`Catalog item with ID '${itemId}' not found.`);
  }

  const [updated] = await db
    .update(catalogItems)
    .set({
      isAvailable,
      updatedAt: new Date(),
    })
    .where(and(eq(catalogItems.tenantId, tenantId), eq(catalogItems.itemId, itemId)))
    .returning();

  await recordAuditEvent({
    tenantId,
    userId: staffUserId,
    action: "hotel.room_service.item_availability_updated",
    resourceType: "catalog_item",
    resourceId: itemId,
    payload: {
      actorType: "STAFF",
      itemName: item.name,
      isAvailable,
      outletId,
    },
  });

  return {
    itemId: updated.itemId,
    categoryId: updated.categoryId,
    name: updated.name,
    description: updated.description,
    sku: updated.sku,
    basePrice: parseFloat(updated.basePrice).toFixed(2),
    taxRate: updated.taxRate,
    isAvailable: updated.isAvailable,
    fulfillmentStation: updated.fulfillmentStation,
  };
}

// ============================================================================
// Order Creation & Customer Operations
// ============================================================================

/**
 * Creates a Room Service F&B order from an authenticated customer session.
 */
export async function createRoomServiceOrder(
  user: JwtPayload,
  input: CreateRoomServiceOrderInput
): Promise<CustomerOrderDto> {
  if (user.sessionType !== "CUSTOMER" || !user.tenantId || !user.contextId || !user.outletId) {
    throw new AuthenticationError("Invalid or unbound customer session.");
  }

  if (!input.items || !Array.isArray(input.items) || input.items.length === 0) {
    throw new ValidationError("Order must contain at least one menu item.");
  }

  for (const it of input.items) {
    if (!it.itemId) {
      throw new ValidationError("Every order line must specify an itemId.");
    }
    if (!it.quantity || typeof it.quantity !== "number" || it.quantity < 1 || !Number.isInteger(it.quantity)) {
      throw new ValidationError("Item quantity must be a positive integer.");
    }
  }

  const tenantId = user.tenantId;
  const outletId = user.outletId;
  const contextId = user.contextId;
  const db = getDb();

  // 1. Resolve room from context
  const [room] = await db
    .select()
    .from(hotelRooms)
    .where(
      and(
        eq(hotelRooms.contextId, contextId),
        eq(hotelRooms.tenantId, tenantId),
        eq(hotelRooms.outletId, outletId)
      )
    )
    .limit(1);

  if (!room) {
    throw new NotFoundError("Room context not found for this property.");
  }

  // 2. Active Stay Verification
  const [activeStay] = await db
    .select({
      stayId: hotelStays.stayId,
      guestId: hotelStays.guestId,
      status: hotelStays.status,
    })
    .from(hotelStays)
    .where(
      and(
        eq(hotelStays.roomId, room.roomId),
        eq(hotelStays.tenantId, tenantId),
        eq(hotelStays.status, "ACTIVE")
      )
    )
    .orderBy(desc(hotelStays.checkInAt))
    .limit(1);

  if (!activeStay) {
    throw new BusinessRuleError(
      "Room service ordering is only available for active in-house hotel stays. Please check in at Front Desk."
    );
  }

  // Resolve Guest Full Name
  let guestFullName: string | null = null;
  const [guestRecord] = await db
    .select({ customerName: customers.fullName })
    .from(hotelGuests)
    .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
    .where(and(eq(hotelGuests.guestId, activeStay.guestId), eq(hotelGuests.tenantId, tenantId)))
    .limit(1);

  if (guestRecord?.customerName) {
    guestFullName = guestRecord.customerName;
  }

  // 3. Batch load requested catalog items & validate availability
  const requestedItemIds = input.items.map((i) => i.itemId);
  const catalogRecords = await db
    .select()
    .from(catalogItems)
    .where(and(eq(catalogItems.tenantId, tenantId), inArray(catalogItems.itemId, requestedItemIds)));

  const itemMap = new Map<string, CatalogItem>();
  for (const cr of catalogRecords) {
    itemMap.set(cr.itemId, cr);
  }

  for (const it of input.items) {
    const itemRec = itemMap.get(it.itemId);
    if (!itemRec) {
      throw new ValidationError(`Menu item '${it.itemId}' not found in catalog.`);
    }
    if (!itemRec.isAvailable) {
      throw new ValidationError(
        `Item '${itemRec.name}' is currently unavailable or sold out. Please remove it from your cart.`
      );
    }
  }

  // 4. Calculate Financial Price Snapshots
  let subtotalAmount = 0;
  const lineItemsToInsert: Array<{
    itemId: string;
    itemName: string;
    unitPrice: string;
    quantity: number;
    subtotal: string;
    fulfillmentStation: string;
    specialNotes?: string;
  }> = [];

  for (const it of input.items) {
    const itemRec = itemMap.get(it.itemId)!;
    const unitPriceNum = parseFloat(itemRec.basePrice);
    const lineSubtotalNum = unitPriceNum * it.quantity;
    subtotalAmount += lineSubtotalNum;

    lineItemsToInsert.push({
      itemId: itemRec.itemId,
      itemName: itemRec.name,
      unitPrice: unitPriceNum.toFixed(4),
      quantity: it.quantity,
      subtotal: lineSubtotalNum.toFixed(4),
      fulfillmentStation: itemRec.fulfillmentStation || "KITCHEN",
      specialNotes: it.specialNotes || undefined,
    });
  }

  const taxRate = 0.05; // 5% standard food tax
  const taxAmount = subtotalAmount * taxRate;
  const totalAmount = subtotalAmount + taxAmount;

  // Generate Unique Human-Readable Order Number
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  const orderNumber = `RS-${dateStr}-${randomSuffix}`;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validSessionId = user.sub && uuidRegex.test(user.sub) ? user.sub : null;

  // 5. Insert Order
  const [createdOrder] = await db
    .insert(orders)
    .values({
      tenantId,
      outletId,
      contextId,
      sessionId: validSessionId,
      orderNumber,
      orderSource: "QR_CUSTOMER",
      status: "PLACED",
      idempotencyKey: input.idempotencyKey || null,
      subtotalAmount: subtotalAmount.toFixed(4),
      taxAmount: taxAmount.toFixed(4),
      discountAmount: "0.0000",
      totalAmount: totalAmount.toFixed(4),
    })
    .returning();

  // 6. Insert Order Lines
  const insertedItems: OrderLineItemDto[] = [];
  for (const line of lineItemsToInsert) {
    const [inserted] = await db
      .insert(orderItems)
      .values({
        tenantId,
        orderId: createdOrder.orderId,
        itemId: line.itemId,
        itemName: line.itemName,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        subtotal: line.subtotal,
        fulfillmentStation: line.fulfillmentStation,
        itemStatus: "PLACED",
        specialNotes: line.specialNotes || null,
      })
      .returning();

    insertedItems.push({
      orderItemId: inserted.orderItemId,
      itemId: inserted.itemId,
      itemName: inserted.itemName,
      unitPrice: parseFloat(inserted.unitPrice).toFixed(2),
      quantity: inserted.quantity,
      subtotal: parseFloat(inserted.subtotal).toFixed(2),
      specialNotes: inserted.specialNotes,
    });
  }

  // 7. Initial Status History
  await db.insert(orderStatusHistory).values({
    tenantId,
    orderId: createdOrder.orderId,
    fromStatus: "PLACED",
    toStatus: "PLACED",
    reason: input.guestNotes || "Customer submitted room service order",
  });

  // 8. Audit creation
  await recordAuditEvent({
    tenantId,
    userId: user.sub,
    action: "hotel.room_service.order_created",
    resourceType: "order",
    resourceId: createdOrder.orderId,
    payload: {
      actorType: "CUSTOMER",
      orderNumber: createdOrder.orderNumber,
      roomNumber: room.roomNumber,
      stayId: activeStay.stayId,
      totalAmount: totalAmount.toFixed(2),
      itemCount: insertedItems.length,
    },
  });

  const orderDto: CustomerOrderDto = {
    orderId: createdOrder.orderId,
    orderNumber: createdOrder.orderNumber,
    status: createdOrder.status as OrderStatus,
    displayStatus: mapToCustomerOrderStatus(createdOrder.status),
    roomNumber: room.roomNumber,
    guestName: guestFullName,
    items: insertedItems,
    subtotalAmount: parseFloat(createdOrder.subtotalAmount).toFixed(2),
    taxAmount: parseFloat(createdOrder.taxAmount).toFixed(2),
    totalAmount: parseFloat(createdOrder.totalAmount).toFixed(2),
    guestNotes: input.guestNotes || null,
    createdAt: createdOrder.createdAt.toISOString(),
    updatedAt: createdOrder.updatedAt.toISOString(),
  };

  // 9. Realtime broadcast
  try {
    const hub = getRealtimeHub();
    // Scope to room context for customer
    hub.broadcastToContext(tenantId, contextId, "order.created", orderDto);
    // Scope to tenant for staff room service console
    hub.broadcastToTenant(tenantId, "hotel.room_service.order_created", {
      orderId: orderDto.orderId,
      orderNumber: orderDto.orderNumber,
      roomNumber: orderDto.roomNumber,
      totalAmount: orderDto.totalAmount,
      status: orderDto.status,
    });
  } catch {
    // SSE non-blocking
  }

  return orderDto;
}

/**
 * Lists room service orders for the authenticated customer room context.
 */
export async function listCustomerOrders(user: JwtPayload): Promise<CustomerOrderDto[]> {
  if (user.sessionType !== "CUSTOMER" || !user.tenantId || !user.contextId) {
    throw new AuthenticationError("Invalid customer session.");
  }

  const tenantId = user.tenantId;
  const contextId = user.contextId;
  const db = getDb();

  const [room] = await db
    .select({ roomNumber: hotelRooms.roomNumber })
    .from(hotelRooms)
    .where(and(eq(hotelRooms.contextId, contextId), eq(hotelRooms.tenantId, tenantId)))
    .limit(1);

  const roomNumber = room?.roomNumber || "Unknown";

  const orderRecords = await db
    .select()
    .from(orders)
    .where(and(eq(orders.contextId, contextId), eq(orders.tenantId, tenantId)))
    .orderBy(desc(orders.createdAt));

  if (orderRecords.length === 0) {
    return [];
  }

  const orderIds = orderRecords.map((o) => o.orderId);
  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.tenantId, tenantId), inArray(orderItems.orderId, orderIds)));

  const itemsByOrder = new Map<string, OrderLineItemDto[]>();
  for (const it of items) {
    const list = itemsByOrder.get(it.orderId) || [];
    list.push({
      orderItemId: it.orderItemId,
      itemId: it.itemId,
      itemName: it.itemName,
      unitPrice: parseFloat(it.unitPrice).toFixed(2),
      quantity: it.quantity,
      subtotal: parseFloat(it.subtotal).toFixed(2),
      specialNotes: it.specialNotes,
    });
    itemsByOrder.set(it.orderId, list);
  }

  return orderRecords.map((o) => ({
    orderId: o.orderId,
    orderNumber: o.orderNumber,
    status: o.status as OrderStatus,
    displayStatus: mapToCustomerOrderStatus(o.status),
    roomNumber,
    items: itemsByOrder.get(o.orderId) || [],
    subtotalAmount: parseFloat(o.subtotalAmount).toFixed(2),
    taxAmount: parseFloat(o.taxAmount).toFixed(2),
    totalAmount: parseFloat(o.totalAmount).toFixed(2),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  }));
}

/**
 * Gets details of a specific room service order if belonging to the customer's room context.
 */
export async function getCustomerOrderById(user: JwtPayload, orderId: string): Promise<CustomerOrderDto> {
  if (user.sessionType !== "CUSTOMER" || !user.tenantId || !user.contextId) {
    throw new AuthenticationError("Invalid customer session.");
  }

  const tenantId = user.tenantId;
  const contextId = user.contextId;
  const db = getDb();

  const [orderRecord] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.orderId, orderId),
        eq(orders.contextId, contextId),
        eq(orders.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!orderRecord) {
    throw new NotFoundError(`Room service order with ID '${orderId}' not found for this room context.`);
  }

  const [room] = await db
    .select({ roomNumber: hotelRooms.roomNumber })
    .from(hotelRooms)
    .where(and(eq(hotelRooms.contextId, contextId), eq(hotelRooms.tenantId, tenantId)))
    .limit(1);

  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.tenantId, tenantId)));

  return {
    orderId: orderRecord.orderId,
    orderNumber: orderRecord.orderNumber,
    status: orderRecord.status as OrderStatus,
    displayStatus: mapToCustomerOrderStatus(orderRecord.status),
    roomNumber: room?.roomNumber || "Unknown",
    items: items.map((it) => ({
      orderItemId: it.orderItemId,
      itemId: it.itemId,
      itemName: it.itemName,
      unitPrice: parseFloat(it.unitPrice).toFixed(2),
      quantity: it.quantity,
      subtotal: parseFloat(it.subtotal).toFixed(2),
      specialNotes: it.specialNotes,
    })),
    subtotalAmount: parseFloat(orderRecord.subtotalAmount).toFixed(2),
    taxAmount: parseFloat(orderRecord.taxAmount).toFixed(2),
    totalAmount: parseFloat(orderRecord.totalAmount).toFixed(2),
    createdAt: orderRecord.createdAt.toISOString(),
    updatedAt: orderRecord.updatedAt.toISOString(),
  };
}

/**
 * Allows customer to cancel an order before kitchen preparation commences.
 */
export async function cancelCustomerOrder(
  user: JwtPayload,
  orderId: string,
  reason?: string
): Promise<CustomerOrderDto> {
  if (user.sessionType !== "CUSTOMER" || !user.tenantId || !user.contextId) {
    throw new AuthenticationError("Invalid customer session.");
  }

  const tenantId = user.tenantId;
  const contextId = user.contextId;
  const db = getDb();

  const [orderRecord] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.orderId, orderId),
        eq(orders.contextId, contextId),
        eq(orders.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!orderRecord) {
    throw new NotFoundError(`Order with ID '${orderId}' not found for this room context.`);
  }

  if (!canCustomerCancelOrder(orderRecord.status as OrderStatus)) {
    throw new BusinessRuleError(
      `Order cannot be cancelled as it is currently in '${mapToCustomerOrderStatus(
        orderRecord.status
      )}' status.`
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(orders)
    .set({
      status: "CANCELLED",
      cancellationReason: reason || "Cancelled by guest",
      updatedAt: now,
    })
    .where(and(eq(orders.orderId, orderId), eq(orders.tenantId, tenantId)))
    .returning();

  await db.insert(orderStatusHistory).values({
    tenantId,
    orderId,
    fromStatus: orderRecord.status,
    toStatus: "CANCELLED",
    reason: reason || "Cancelled by guest",
  });

  await recordAuditEvent({
    tenantId,
    userId: user.sub,
    action: "hotel.room_service.order_cancelled",
    resourceType: "order",
    resourceId: orderId,
    payload: {
      actorType: "CUSTOMER",
      fromStatus: orderRecord.status,
      orderNumber: updated.orderNumber,
      reason,
    },
  });

  const updatedDto = await getCustomerOrderById(user, orderId);

  // Broadcast realtime updates
  try {
    const hub = getRealtimeHub();
    hub.broadcastToContext(tenantId, contextId, "order.updated", updatedDto);
    hub.broadcastToTenant(tenantId, "hotel.room_service.order_updated", {
      orderId,
      orderNumber: updated.orderNumber,
      status: "CANCELLED",
    });
  } catch {
    // SSE fallback
  }

  return updatedDto;
}

// ============================================================================
// Staff Room Service Operations
// ============================================================================

/**
 * Lists room service orders for staff console with property scope.
 */
export async function listStaffRoomServiceOrders(params: {
  tenantId: string;
  outletId: string;
  status?: OrderStatus;
  roomId?: string;
  limit?: number;
  offset?: number;
}): Promise<StaffOrderDto[]> {
  const { tenantId, outletId, status, limit = 50, offset = 0 } = params;
  const db = getDb();

  const conditions = [eq(orders.tenantId, tenantId), eq(orders.outletId, outletId)];
  if (status) {
    conditions.push(eq(orders.status, status));
  }

  const orderRecords = await db
    .select()
    .from(orders)
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset);

  if (orderRecords.length === 0) {
    return [];
  }

  const orderIds = orderRecords.map((o) => o.orderId);
  const contextIds = [...new Set(orderRecords.map((o) => o.contextId))];

  // Fetch rooms
  const rooms = await db
    .select()
    .from(hotelRooms)
    .where(and(eq(hotelRooms.tenantId, tenantId), inArray(hotelRooms.contextId, contextIds)));

  const roomByContext = new Map<string, typeof hotelRooms.$inferSelect>();
  for (const r of rooms) {
    roomByContext.set(r.contextId, r);
  }

  // Fetch items
  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.tenantId, tenantId), inArray(orderItems.orderId, orderIds)));

  const itemsByOrder = new Map<string, OrderLineItemDto[]>();
  for (const it of items) {
    const list = itemsByOrder.get(it.orderId) || [];
    list.push({
      orderItemId: it.orderItemId,
      itemId: it.itemId,
      itemName: it.itemName,
      unitPrice: parseFloat(it.unitPrice).toFixed(2),
      quantity: it.quantity,
      subtotal: parseFloat(it.subtotal).toFixed(2),
      specialNotes: it.specialNotes,
    });
    itemsByOrder.set(it.orderId, list);
  }

  return orderRecords.map((o) => {
    const room = roomByContext.get(o.contextId);
    return {
      orderId: o.orderId,
      orderNumber: o.orderNumber,
      tenantId: o.tenantId,
      outletId: o.outletId,
      contextId: o.contextId,
      roomId: room?.roomId,
      status: o.status as OrderStatus,
      displayStatus: mapToCustomerOrderStatus(o.status),
      roomNumber: room?.roomNumber || "Unknown",
      items: itemsByOrder.get(o.orderId) || [],
      subtotalAmount: parseFloat(o.subtotalAmount).toFixed(2),
      taxAmount: parseFloat(o.taxAmount).toFixed(2),
      totalAmount: parseFloat(o.totalAmount).toFixed(2),
      cancellationReason: o.cancellationReason,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  });
}

/**
 * Gets detailed staff room service order with status transition history.
 */
export async function getStaffRoomServiceOrderById(params: {
  tenantId: string;
  outletId: string;
  orderId: string;
}): Promise<StaffOrderDto> {
  const { tenantId, outletId, orderId } = params;
  const db = getDb();

  const [orderRecord] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.orderId, orderId),
        eq(orders.tenantId, tenantId),
        eq(orders.outletId, outletId)
      )
    )
    .limit(1);

  if (!orderRecord) {
    throw new NotFoundError(`Room service order '${orderId}' not found.`);
  }

  const [room] = await db
    .select()
    .from(hotelRooms)
    .where(and(eq(hotelRooms.contextId, orderRecord.contextId), eq(hotelRooms.tenantId, tenantId)))
    .limit(1);

  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.tenantId, tenantId)));

  const history = await db
    .select()
    .from(orderStatusHistory)
    .where(and(eq(orderStatusHistory.orderId, orderId), eq(orderStatusHistory.tenantId, tenantId)))
    .orderBy(desc(orderStatusHistory.createdAt));

  return {
    orderId: orderRecord.orderId,
    orderNumber: orderRecord.orderNumber,
    tenantId: orderRecord.tenantId,
    outletId: orderRecord.outletId,
    contextId: orderRecord.contextId,
    roomId: room?.roomId,
    status: orderRecord.status as OrderStatus,
    displayStatus: mapToCustomerOrderStatus(orderRecord.status),
    roomNumber: room?.roomNumber || "Unknown",
    items: items.map((it) => ({
      orderItemId: it.orderItemId,
      itemId: it.itemId,
      itemName: it.itemName,
      unitPrice: parseFloat(it.unitPrice).toFixed(2),
      quantity: it.quantity,
      subtotal: parseFloat(it.subtotal).toFixed(2),
      specialNotes: it.specialNotes,
    })),
    subtotalAmount: parseFloat(orderRecord.subtotalAmount).toFixed(2),
    taxAmount: parseFloat(orderRecord.taxAmount).toFixed(2),
    totalAmount: parseFloat(orderRecord.totalAmount).toFixed(2),
    cancellationReason: orderRecord.cancellationReason,
    createdAt: orderRecord.createdAt.toISOString(),
    updatedAt: orderRecord.updatedAt.toISOString(),
    statusHistory: history.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      createdAt: h.createdAt.toISOString(),
      reason: h.reason,
    })),
  };
}

/**
 * Updates staff status for a room service order with state machine validation and audit.
 */
export async function updateStaffRoomServiceOrderStatus(params: {
  tenantId: string;
  outletId: string;
  orderId: string;
  nextStatus: OrderStatus;
  staffUserId: string;
  reason?: string;
}): Promise<StaffOrderDto> {
  const { tenantId, outletId, orderId, nextStatus, staffUserId, reason } = params;
  const db = getDb();

  const [orderRecord] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.orderId, orderId),
        eq(orders.tenantId, tenantId),
        eq(orders.outletId, outletId)
      )
    )
    .limit(1);

  if (!orderRecord) {
    throw new NotFoundError(`Room service order '${orderId}' not found.`);
  }

  // Validate state machine transition
  validateOrderStatusTransition(orderRecord.status as OrderStatus, nextStatus);

  const now = new Date();
  const [updated] = await db
    .update(orders)
    .set({
      status: nextStatus,
      cancellationReason: nextStatus === "CANCELLED" ? reason || "Cancelled by staff" : orderRecord.cancellationReason,
      updatedAt: now,
    })
    .where(and(eq(orders.orderId, orderId), eq(orders.tenantId, tenantId)))
    .returning();

  // Record history
  await db.insert(orderStatusHistory).values({
    tenantId,
    orderId,
    fromStatus: orderRecord.status,
    toStatus: nextStatus,
    changedByUserId: staffUserId,
    reason: reason || `Staff transition to ${nextStatus}`,
  });

  // Audit
  await recordAuditEvent({
    tenantId,
    userId: staffUserId,
    action: "hotel.room_service.status_updated",
    resourceType: "order",
    resourceId: orderId,
    payload: {
      actorType: "STAFF",
      orderNumber: updated.orderNumber,
      fromStatus: orderRecord.status,
      toStatus: nextStatus,
      reason,
    },
  });

  const staffDto = await getStaffRoomServiceOrderById({ tenantId, outletId, orderId });

  // Slice 9 Financial Posting: If order reaches DELIVERED status, post food charge to stay folio idempotently
  if (nextStatus === "DELIVERED") {
    try {
      const { postRoomServiceOrderCharge } = await import("./folio-service");
      await postRoomServiceOrderCharge({
        tenantId,
        outletId,
        orderId,
        postedByStaffId: staffUserId,
      });
    } catch (err) {
      // Log warning but do not break operational fulfillment flow
      console.warn("Folio posting error on order delivery:", err);
    }
  }

  // Broadcast realtime updates
  try {
    const hub = getRealtimeHub();
    // To customer room context
    hub.broadcastToContext(tenantId, orderRecord.contextId, "order.updated", {
      orderId,
      orderNumber: updated.orderNumber,
      status: nextStatus,
      displayStatus: mapToCustomerOrderStatus(nextStatus),
    });
    // To staff console
    hub.broadcastToTenant(tenantId, "hotel.room_service.order_updated", {
      orderId,
      orderNumber: updated.orderNumber,
      status: nextStatus,
    });
  } catch {
    // SSE fallback
  }

  return staffDto;
}
