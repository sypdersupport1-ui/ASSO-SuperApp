import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { restaurantCartItems } from "@/db/schema/restaurant";
import { catalogItems } from "@/db/schema/operations";
import { customerSessions } from "@/db/schema/context";
import { NotFoundError, ValidationError, BusinessRuleError } from "@/lib/api/errors";

export interface CartItemDto {
  cartItemId: string;
  itemId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
  specialInstructions: string | null;
  lineSubtotal: string;
  isAvailable: boolean;
}

export interface RestaurantCartDto {
  sessionId: string;
  items: CartItemDto[];
  totalItems: number;
  subtotalAmount: string;
  estimatedTaxAmount: string;
  estimatedTotalAmount: string;
  isPreOrderNotice: string;
}

/**
 * Validates that an active customer session exists for the tenant.
 */
async function assertActiveSession(tenantId: string, sessionId: string) {
  const db = getDb();
  const [session] = await db
    .select()
    .from(customerSessions)
    .where(
      and(
        eq(customerSessions.sessionId, sessionId),
        eq(customerSessions.tenantId, tenantId),
        eq(customerSessions.sessionStatus, "ACTIVE")
      )
    )
    .limit(1);

  if (!session) {
    throw new NotFoundError("Customer Session", "Active customer session not found or expired.");
  }
  return session;
}

/**
 * Retrieves the current customer pre-order cart with authoritative server pricing.
 * Invariant: Client-provided totals or prices are never trusted.
 */
export async function getCart(
  tenantId: string,
  sessionId: string
): Promise<RestaurantCartDto> {
  await assertActiveSession(tenantId, sessionId);
  const db = getDb();

  const cartRows = await db
    .select({
      cartItemId: restaurantCartItems.cartItemId,
      sessionId: restaurantCartItems.sessionId,
      itemId: restaurantCartItems.itemId,
      quantity: restaurantCartItems.quantity,
      specialInstructions: restaurantCartItems.specialInstructions,
      name: catalogItems.name,
      description: catalogItems.description,
      imageUrl: catalogItems.imageUrl,
      basePrice: catalogItems.basePrice,
      taxRate: catalogItems.taxRate,
      isAvailable: catalogItems.isAvailable,
    })
    .from(restaurantCartItems)
    .innerJoin(catalogItems, eq(restaurantCartItems.itemId, catalogItems.itemId))
    .where(
      and(
        eq(restaurantCartItems.tenantId, tenantId),
        eq(restaurantCartItems.sessionId, sessionId)
      )
    );

  let totalItems = 0;
  let subtotalNum = 0;

  const items: CartItemDto[] = cartRows.map((row) => {
    const unitPriceNum = parseFloat(row.basePrice) || 0;
    const qty = row.quantity;
    const lineSubtotalNum = unitPriceNum * qty;

    totalItems += qty;
    subtotalNum += lineSubtotalNum;

    return {
      cartItemId: row.cartItemId,
      itemId: row.itemId,
      name: row.name,
      description: row.description,
      imageUrl: row.imageUrl,
      unitPrice: unitPriceNum.toFixed(2),
      quantity: qty,
      specialInstructions: row.specialInstructions,
      lineSubtotal: lineSubtotalNum.toFixed(2),
      isAvailable: row.isAvailable,
    };
  });

  const estimatedTaxNum = subtotalNum * 0.05; // 5% GST preview
  const estimatedTotalNum = subtotalNum + estimatedTaxNum;

  return {
    sessionId,
    items,
    totalItems,
    subtotalAmount: subtotalNum.toFixed(2),
    estimatedTaxAmount: estimatedTaxNum.toFixed(2),
    estimatedTotalAmount: estimatedTotalNum.toFixed(2),
    isPreOrderNotice: "Pre-order cart preview. Digital ordering will be finalized in Slice 3.",
  };
}

/**
 * Adds an item to the dining cart or increments existing quantity.
 */
export async function addItemToCart(
  tenantId: string,
  sessionId: string,
  input: {
    itemId: string;
    quantity?: number;
    specialInstructions?: string;
  }
): Promise<RestaurantCartDto> {
  await assertActiveSession(tenantId, sessionId);
  const db = getDb();

  const quantity = input.quantity ?? 1;
  if (quantity < 1 || quantity > 50) {
    throw new ValidationError("Quantity must be between 1 and 50.");
  }

  // Authoritative item lookup & stock check
  const [catalogItem] = await db
    .select()
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.itemId, input.itemId),
        eq(catalogItems.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!catalogItem) {
    throw new NotFoundError("Catalog Item", "Item was not found in restaurant menu.");
  }

  if (!catalogItem.isAvailable) {
    throw new BusinessRuleError(`"${catalogItem.name}" is currently unavailable for ordering.`);
  }

  // Check if item already exists in session cart
  const [existingCartItem] = await db
    .select()
    .from(restaurantCartItems)
    .where(
      and(
        eq(restaurantCartItems.sessionId, sessionId),
        eq(restaurantCartItems.itemId, input.itemId)
      )
    )
    .limit(1);

  if (existingCartItem) {
    const newQty = Math.min(50, existingCartItem.quantity + quantity);
    await db
      .update(restaurantCartItems)
      .set({
        quantity: newQty,
        specialInstructions: input.specialInstructions?.trim() || existingCartItem.specialInstructions,
        updatedAt: new Date(),
      })
      .where(eq(restaurantCartItems.cartItemId, existingCartItem.cartItemId));
  } else {
    await db.insert(restaurantCartItems).values({
      tenantId,
      sessionId,
      itemId: input.itemId,
      quantity,
      specialInstructions: input.specialInstructions?.trim() || null,
    });
  }

  return getCart(tenantId, sessionId);
}

/**
 * Updates quantity of an existing cart line item.
 * Setting quantity <= 0 removes the item.
 */
export async function updateCartItemQuantity(
  tenantId: string,
  sessionId: string,
  cartItemId: string,
  quantity: number
): Promise<RestaurantCartDto> {
  await assertActiveSession(tenantId, sessionId);
  const db = getDb();

  if (quantity <= 0) {
    return removeCartItem(tenantId, sessionId, cartItemId);
  }

  if (quantity > 50) {
    throw new ValidationError("Maximum quantity per item is 50.");
  }

  const [cartItem] = await db
    .select()
    .from(restaurantCartItems)
    .where(
      and(
        eq(restaurantCartItems.cartItemId, cartItemId),
        eq(restaurantCartItems.sessionId, sessionId),
        eq(restaurantCartItems.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!cartItem) {
    throw new NotFoundError("Cart Item", "Item was not found in cart.");
  }

  await db
    .update(restaurantCartItems)
    .set({
      quantity,
      updatedAt: new Date(),
    })
    .where(eq(restaurantCartItems.cartItemId, cartItemId));

  return getCart(tenantId, sessionId);
}

/**
 * Removes an item from the cart.
 */
export async function removeCartItem(
  tenantId: string,
  sessionId: string,
  cartItemId: string
): Promise<RestaurantCartDto> {
  await assertActiveSession(tenantId, sessionId);
  const db = getDb();

  await db
    .delete(restaurantCartItems)
    .where(
      and(
        eq(restaurantCartItems.cartItemId, cartItemId),
        eq(restaurantCartItems.sessionId, sessionId),
        eq(restaurantCartItems.tenantId, tenantId)
      )
    );

  return getCart(tenantId, sessionId);
}

/**
 * Clears all items in the customer cart.
 */
export async function clearCart(
  tenantId: string,
  sessionId: string
): Promise<RestaurantCartDto> {
  await assertActiveSession(tenantId, sessionId);
  const db = getDb();

  await db
    .delete(restaurantCartItems)
    .where(
      and(
        eq(restaurantCartItems.sessionId, sessionId),
        eq(restaurantCartItems.tenantId, tenantId)
      )
    );

  return getCart(tenantId, sessionId);
}
