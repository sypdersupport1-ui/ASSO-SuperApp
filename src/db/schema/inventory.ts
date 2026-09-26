import { pgTable, uuid, varchar, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { organizations, outlets, users } from "./core";

export const inventoryUnits = pgTable("inventory_units", {
  unitId: uuid("unit_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  name: varchar("name", { length: 100 }).notNull(),
  symbol: varchar("symbol", { length: 20 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventorySuppliers = pgTable("inventory_suppliers", {
  supplierId: uuid("supplier_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  name: varchar("name", { length: 255 }).notNull(),
  contactEmail: varchar("contact_email", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  taxIdentifier: varchar("tax_identifier", { length: 100 }),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryItems = pgTable("inventory_items", {
  itemId: uuid("item_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  name: varchar("name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 100 }).notNull(),
  unitId: uuid("unit_id").notNull().references(() => inventoryUnits.unitId),
  reorderLevel: numeric("reorder_level", { precision: 12, scale: 3 }).notNull().default("0"),
  currentCost: numeric("current_cost", { precision: 14, scale: 4 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryLocations = pgTable("inventory_locations", {
  locationId: uuid("location_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  outletId: uuid("outlet_id").references(() => outlets.outletId),
  name: varchar("name", { length: 255 }).notNull(),
  locationType: varchar("location_type", { length: 50 }).notNull().default("CENTRAL_STORE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryStockBalances = pgTable("inventory_stock_balances", {
  balanceId: uuid("balance_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  itemId: uuid("item_id").notNull().references(() => inventoryItems.itemId),
  locationId: uuid("location_id").notNull().references(() => inventoryLocations.locationId),
  quantityOnHand: numeric("quantity_on_hand", { precision: 14, scale: 4 }).notNull().default("0"),
  reservedQuantity: numeric("reserved_quantity", { precision: 14, scale: 4 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Canonical Ledger: Inventory Stock Movements (Strictly Append-Only)
export const inventoryStockMovements = pgTable("inventory_stock_movements", {
  movementId: uuid("movement_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  itemId: uuid("item_id").notNull().references(() => inventoryItems.itemId),
  fromLocationId: uuid("from_location_id").references(() => inventoryLocations.locationId),
  toLocationId: uuid("to_location_id").references(() => inventoryLocations.locationId),
  movementType: varchar("movement_type", { length: 50 }).notNull(), // 'PURCHASE_RECEIPT', 'INTERNAL_TRANSFER', 'DEPLETION_USAGE', 'WASTAGE', 'RETURN', 'AUDIT_ADJUSTMENT'
  quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 14, scale: 4 }).notNull(),
  referenceId: varchar("reference_id", { length: 100 }),
  referenceType: varchar("reference_type", { length: 50 }),
  performedByUserId: uuid("performed_by_user_id").references(() => users.userId),
  reason: text("reason"),
  idempotencyKey: varchar("idempotency_key", { length: 100 }).unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
