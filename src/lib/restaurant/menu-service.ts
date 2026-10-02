import { eq, and, asc, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  catalogs,
  catalogCategories,
  catalogItems,
} from "@/db/schema/operations";
import { outlets } from "@/db/schema/core";
import { recordAuditEvent } from "@/lib/audit";
import { realtimeHub } from "@/lib/realtime/sse";
import { NotFoundError, ValidationError, BusinessRuleError } from "@/lib/api/errors";

export interface MenuItemDto {
  itemId: string;
  categoryId: string;
  name: string;
  description: string | null;
  sku: string | null;
  basePrice: string;
  taxRate: string;
  isAvailable: boolean;
  fulfillmentStation: string;
  imageUrl: string | null;
}

export interface MenuCategoryDto {
  categoryId: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  items: MenuItemDto[];
}

export interface RestaurantMenuDto {
  catalogId: string;
  catalogName: string;
  categories: MenuCategoryDto[];
}

/**
 * Standard Restaurant Menu Definition for Dining Outlets
 */
export const DEFAULT_RESTAURANT_MENU = [
  {
    categoryName: "Starters & Small Plates",
    displayOrder: 1,
    items: [
      {
        name: "Galouti Kebab Sliders",
        description: "Melt-in-mouth spiced minced mutton patties on mini saffron sheermal with mint chutney.",
        basePrice: "480.0000",
        sku: "REST-STARTER-GALOUTI",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600&auto=format&fit=crop&q=80",
      },
      {
        name: "Crispy Lotus Stem in Sweet Chili",
        description: "Wok-tossed crunchy lotus stem tossed with scallions, sesame seeds, and kaffir lime honey glaze.",
        basePrice: "380.0000",
        sku: "REST-STARTER-LOTUS",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80",
      },
      {
        name: "Bhatti Da Murgh Tikka",
        description: "Smoky boneless chicken chunks marinated in black pepper, hung curd, and roasted bhatti masala.",
        basePrice: "460.0000",
        sku: "REST-STARTER-BHATTI",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600&auto=format&fit=crop&q=80",
      },
      {
        name: "Truffle & Edamame Dumplings",
        description: "Steamed crystal dumplings filled with mashed edamame and water chestnuts, drizzled with truffle broth.",
        basePrice: "420.0000",
        sku: "REST-STARTER-DUMP",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=600&auto=format&fit=crop&q=80",
      },
    ],
  },
  {
    categoryName: "Signature Biryanis & Rice",
    displayOrder: 2,
    items: [
      {
        name: "Awadhi Dum Gosht Biryani",
        description: "Aged long-grain Basmati rice slow-cooked on dum with tender mutton shanks, saffron, and ittar.",
        basePrice: "680.0000",
        sku: "REST-MAIN-MUTTON-BIRYANI",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80",
      },
      {
        name: "Royal Subz Dum Biryani",
        description: "Fragrant basmati layered with baby vegetables, paneer, caramelized onions, and fresh mint.",
        basePrice: "490.0000",
        sku: "REST-MAIN-VEG-BIRYANI",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1642821373181-696a54913e9a?w=600&auto=format&fit=crop&q=80",
      },
      {
        name: "Hyderabadi Zafrani Murgh Biryani",
        description: "Marinated chicken infused with saffron, pot-roasted in seal pot, served with mirchi ka salan.",
        basePrice: "560.0000",
        sku: "REST-MAIN-CHICKEN-BIRYANI",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=600&auto=format&fit=crop&q=80",
      },
    ],
  },
  {
    categoryName: "Royal Curries & Gravies",
    displayOrder: 3,
    items: [
      {
        name: "Nalli Nihari Khas",
        description: "Slow-simmered lamb shank in velvety bone-marrow gravy with julienned ginger and lemon.",
        basePrice: "720.0000",
        sku: "REST-CURRY-NIHARI",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1545247181-516773cae754?w=600&auto=format&fit=crop&q=80",
      },
      {
        name: "Dal Makhani 24-Hour Simmered",
        description: "Black lentils slow-cooked overnight on charcoal embers with churned white butter and cream.",
        basePrice: "420.0000",
        sku: "REST-CURRY-DAL",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&auto=format&fit=crop&q=80",
      },
      {
        name: "Paneer Lababdar",
        description: "Handcrafted paneer cubes tossed in onion-tomato gravy with crushed coriander and kasuri methi.",
        basePrice: "460.0000",
        sku: "REST-CURRY-PANEER",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop&q=80",
      },
      {
        name: "Old Delhi Butter Chicken",
        description: "Char-grilled chicken tikka cooked in rich makhani gravy with fenugreek and butter.",
        basePrice: "540.0000",
        sku: "REST-CURRY-BUTTER-CHICKEN",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&auto=format&fit=crop&q=80",
      },
    ],
  },
  {
    categoryName: "Tandoor Breads & Accompaniments",
    displayOrder: 4,
    items: [
      {
        name: "Smoked Garlic & Rosemary Naan",
        description: "Clay oven baked refined flour bread infused with roasted garlic and fresh rosemary butter.",
        basePrice: "120.0000",
        sku: "REST-BREAD-NAAN",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1533777857889-4be7c70b33f7?w=600&auto=format&fit=crop&q=80",
      },
      {
        name: "Laccha Paratha Pudina",
        description: "Multi-layered flaky whole wheat bread dusted with crushed dried mint and ghee.",
        basePrice: "110.0000",
        sku: "REST-BREAD-PARATHA",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80",
      },
      {
        name: "Burani Garlic Raita",
        description: "Thick Greek hung yogurt tempered with browned garlic, roasted cumin, and black salt.",
        basePrice: "160.0000",
        sku: "REST-SIDE-RAITA",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=600&auto=format&fit=crop&q=80",
      },
    ],
  },
  {
    categoryName: "Beverages & Mocktails",
    displayOrder: 5,
    items: [
      {
        name: "Kokum & Cumin Cooler",
        description: "Wild kokum extract with roasted cumin, rock salt, and sparkling soda.",
        basePrice: "240.0000",
        sku: "REST-BEV-KOKUM",
        fulfillmentStation: "BAR",
        imageUrl: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80",
      },
      {
        name: "Saffron & Rose Petal Shikanji",
        description: "Hand-squeezed lemon cooler infused with Kashmiri saffron strands and dried Damascus rose petals.",
        basePrice: "260.0000",
        sku: "REST-BEV-SHIKANJI",
        fulfillmentStation: "BAR",
        imageUrl: "https://images.unsplash.com/photo-1536935338788-846bb9981813?w=600&auto=format&fit=crop&q=80",
      },
      {
        name: "Chilled Mango Cardamom Lassi",
        description: "Creamy Alphonso mango pulp churned with artisanal yogurt and crushed green cardamom.",
        basePrice: "220.0000",
        sku: "REST-BEV-LASSI",
        fulfillmentStation: "BAR",
        imageUrl: "https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=600&auto=format&fit=crop&q=80",
      },
    ],
  },
  {
    categoryName: "Artisanal Desserts",
    displayOrder: 6,
    items: [
      {
        name: "Baked Shahi Tukda with Pistachio Cream",
        description: "Ghee-crisped brioche steeped in saffron rabdi, finished with silver vark and Iranian pistachios.",
        basePrice: "340.0000",
        sku: "REST-DES-TUKDA",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop&q=80",
      },
      {
        name: "Elaneer Tender Coconut Payasam",
        description: "Delicate tender coconut pulp simmered in coconut milk, jaggery, and green cardamom.",
        basePrice: "320.0000",
        sku: "REST-DES-PAYASAM",
        fulfillmentStation: "KITCHEN",
        imageUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80",
      },
    ],
  },
];

/**
 * Ensures a dining catalog and default menu items exist for the restaurant outlet.
 */
export async function ensureRestaurantMenuCatalog(
  tenantId: string,
  outletId: string
): Promise<string> {
  const db = getDb();

  // 1. Verify outlet existence
  const [outlet] = await db
    .select()
    .from(outlets)
    .where(and(eq(outlets.outletId, outletId), eq(outlets.tenantId, tenantId)))
    .limit(1);

  if (!outlet) {
    throw new NotFoundError("Outlet", `Restaurant outlet '${outletId}' not found.`);
  }

  // 2. Check if a catalog exists for this outlet
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
        name: `${outlet.name} Dining Menu`,
        description: "Authoritative Digital Menu for Table Dining",
        isActive: true,
      })
      .returning();
    catalogId = newCat.catalogId;
  }

  // 3. Ensure categories and items are seeded
  for (const catDef of DEFAULT_RESTAURANT_MENU) {
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
          imageUrl: itemDef.imageUrl,
        });
      } else if (!existingItem[0].imageUrl && itemDef.imageUrl) {
        // Upgrade legacy items with high quality image
        await db
          .update(catalogItems)
          .set({ imageUrl: itemDef.imageUrl })
          .where(eq(catalogItems.itemId, existingItem[0].itemId));
      }
    }
  }

  return catalogId;
}

/**
 * Retrieves the restaurant digital menu.
 * 
 * Rules:
 * - Customers receive ONLY available items and active categories.
 * - Admin calls can pass { includeUnavailable: true } to see disabled items for management.
 * - Authoritative prices and stock states come directly from PostgreSQL.
 */
export async function getRestaurantMenu(
  tenantId: string,
  outletId: string,
  options: { includeUnavailable?: boolean } = {}
): Promise<RestaurantMenuDto> {
  const db = getDb();

  // Fast path: find active catalog for this outlet directly
  let [catalog] = await db
    .select({ catalogId: catalogs.catalogId, name: catalogs.name })
    .from(catalogs)
    .where(and(eq(catalogs.tenantId, tenantId), eq(catalogs.outletId, outletId), eq(catalogs.isActive, true)))
    .limit(1);

  if (!catalog) {
    const ensuredCatalogId = await ensureRestaurantMenuCatalog(tenantId, outletId);
    const [fetched] = await db
      .select({ catalogId: catalogs.catalogId, name: catalogs.name })
      .from(catalogs)
      .where(and(eq(catalogs.catalogId, ensuredCatalogId), eq(catalogs.tenantId, tenantId)))
      .limit(1);
    if (!fetched) {
      throw new NotFoundError("Catalog", "Restaurant catalog not found.");
    }
    catalog = fetched;
  }

  // Fetch categories for this catalog
  const categoryConditions = [
    eq(catalogCategories.catalogId, catalog.catalogId),
    eq(catalogCategories.tenantId, tenantId),
  ];
  if (!options.includeUnavailable) {
    categoryConditions.push(eq(catalogCategories.isActive, true));
  }

  const visibleCategories = await db
    .select()
    .from(catalogCategories)
    .where(and(...categoryConditions))
    .orderBy(asc(catalogCategories.displayOrder));

  if (visibleCategories.length === 0) {
    return {
      catalogId: catalog.catalogId,
      catalogName: catalog.name,
      categories: [],
    };
  }

  const categoryIds = visibleCategories.map((c) => c.categoryId);

  // Fetch items scoped strictly to this catalog's categories
  const itemConditions = [
    eq(catalogItems.tenantId, tenantId),
    inArray(catalogItems.categoryId, categoryIds),
  ];
  if (!options.includeUnavailable) {
    itemConditions.push(eq(catalogItems.isAvailable, true));
  }

  const itemRows = await db
    .select()
    .from(catalogItems)
    .where(and(...itemConditions));

  const itemsByCategoryId = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    let list = itemsByCategoryId.get(item.categoryId);
    if (!list) {
      list = [];
      itemsByCategoryId.set(item.categoryId, list);
    }
    list.push(item);
  }

  const categories: MenuCategoryDto[] = visibleCategories.map((cat) => {
    const catItems = itemsByCategoryId.get(cat.categoryId) || [];

    return {
      categoryId: cat.categoryId,
      name: cat.name,
      displayOrder: cat.displayOrder,
      isActive: cat.isActive,
      items: catItems.map((item) => ({
        itemId: item.itemId,
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        sku: item.sku,
        basePrice: item.basePrice,
        taxRate: item.taxRate,
        isAvailable: item.isAvailable,
        fulfillmentStation: item.fulfillmentStation,
        imageUrl: item.imageUrl,
      })),
    };
  });

  return {
    catalogId: catalog.catalogId,
    catalogName: catalog.name,
    categories,
  };
}

/**
 * Updates availability status of a menu item (e.g. 86ing / out-of-stock).
 */
export async function updateMenuItemAvailability(
  tenantId: string,
  outletId: string,
  itemId: string,
  isAvailable: boolean,
  userId?: string
): Promise<MenuItemDto> {
  const db = getDb();

  const [item] = await db
    .select()
    .from(catalogItems)
    .where(and(eq(catalogItems.itemId, itemId), eq(catalogItems.tenantId, tenantId)))
    .limit(1);

  if (!item) {
    throw new NotFoundError("Menu Item", `Item '${itemId}' not found.`);
  }

  const [updated] = await db
    .update(catalogItems)
    .set({
      isAvailable,
      updatedAt: new Date(),
    })
    .where(and(eq(catalogItems.itemId, itemId), eq(catalogItems.tenantId, tenantId)))
    .returning();

  // Audit event
  await recordAuditEvent({
    tenantId,
    userId,
    action: "restaurant.menu.item_availability_updated",
    resourceType: "catalog_item",
    resourceId: itemId,
    payload: {
      name: item.name,
      previousAvailable: item.isAvailable,
      newAvailable: isAvailable,
    },
  });

  // Realtime notification
  await realtimeHub.broadcastToTenant(tenantId, "restaurant:menu_updated", {
    itemId,
    isAvailable,
    name: item.name,
  });

  return {
    itemId: updated.itemId,
    categoryId: updated.categoryId,
    name: updated.name,
    description: updated.description,
    sku: updated.sku,
    basePrice: updated.basePrice,
    taxRate: updated.taxRate,
    isAvailable: updated.isAvailable,
    fulfillmentStation: updated.fulfillmentStation,
    imageUrl: updated.imageUrl,
  };
}

/**
 * Updates menu item price.
 * Protected by distinct RBAC permission 'restaurant.menu.price.manage'.
 */
export async function updateMenuItemPrice(
  tenantId: string,
  outletId: string,
  itemId: string,
  newPrice: string,
  userId?: string
): Promise<MenuItemDto> {
  const db = getDb();

  const numericPrice = parseFloat(newPrice);
  if (isNaN(numericPrice) || numericPrice < 0) {
    throw new ValidationError("Base price must be a valid non-negative number.");
  }

  const formattedPrice = numericPrice.toFixed(4);

  const [item] = await db
    .select()
    .from(catalogItems)
    .where(and(eq(catalogItems.itemId, itemId), eq(catalogItems.tenantId, tenantId)))
    .limit(1);

  if (!item) {
    throw new NotFoundError("Menu Item", `Item '${itemId}' not found.`);
  }

  const [updated] = await db
    .update(catalogItems)
    .set({
      basePrice: formattedPrice,
      updatedAt: new Date(),
    })
    .where(and(eq(catalogItems.itemId, itemId), eq(catalogItems.tenantId, tenantId)))
    .returning();

  // Audit event
  await recordAuditEvent({
    tenantId,
    userId,
    action: "restaurant.menu.item_price_updated",
    resourceType: "catalog_item",
    resourceId: itemId,
    payload: {
      name: item.name,
      previousPrice: item.basePrice,
      newPrice: formattedPrice,
    },
  });

  // Realtime notification
  await realtimeHub.broadcastToTenant(tenantId, "restaurant:menu_updated", {
    itemId,
    basePrice: formattedPrice,
    name: item.name,
  });

  return {
    itemId: updated.itemId,
    categoryId: updated.categoryId,
    name: updated.name,
    description: updated.description,
    sku: updated.sku,
    basePrice: updated.basePrice,
    taxRate: updated.taxRate,
    isAvailable: updated.isAvailable,
    fulfillmentStation: updated.fulfillmentStation,
    imageUrl: updated.imageUrl,
  };
}

/**
 * Toggles category active status.
 */
export async function toggleCategoryStatus(
  tenantId: string,
  outletId: string,
  categoryId: string,
  isActive: boolean,
  userId?: string
): Promise<void> {
  const db = getDb();

  const [category] = await db
    .select()
    .from(catalogCategories)
    .where(
      and(
        eq(catalogCategories.categoryId, categoryId),
        eq(catalogCategories.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!category) {
    throw new NotFoundError("Category", `Category '${categoryId}' not found.`);
  }

  await db
    .update(catalogCategories)
    .set({
      isActive,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(catalogCategories.categoryId, categoryId),
        eq(catalogCategories.tenantId, tenantId)
      )
    );

  await recordAuditEvent({
    tenantId,
    userId,
    action: "restaurant.menu.category_status_updated",
    resourceType: "catalog_category",
    resourceId: categoryId,
    payload: {
      name: category.name,
      isActive,
    },
  });

  await realtimeHub.broadcastToTenant(tenantId, "restaurant:menu_updated", {
    categoryId,
    isActive,
  });
}
