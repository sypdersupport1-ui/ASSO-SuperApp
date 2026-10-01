import { pgTable, uuid, varchar, text, integer, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, outlets, users } from "./core";
import { businessContexts, customerSessions } from "./context";
import { catalogItems } from "./operations";

// Operational table statuses for restaurant vertical
export const RESTAURANT_TABLE_STATUSES = [
  "AVAILABLE",
  "OCCUPIED",
  "RESERVED",
  "CLEANING",
  "OUT_OF_SERVICE",
] as const;
export type RestaurantTableStatus = (typeof RESTAURANT_TABLE_STATUSES)[number];

// Dining session statuses
export const RESTAURANT_SESSION_STATUSES = [
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const;
export type RestaurantSessionStatus = (typeof RESTAURANT_SESSION_STATUSES)[number];

/**
 * Restaurant Tables (Physical Entity, mapped 1:1 to BusinessContext)
 */
export const restaurantTables = pgTable(
  "restaurant_tables",
  {
    tableId: uuid("table_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.organizationId),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.outletId),
    contextId: uuid("context_id")
      .notNull()
      .references(() => businessContexts.contextId),
    tableNumber: varchar("table_number", { length: 50 }).notNull(),
    displayLabel: varchar("display_label", { length: 100 }).notNull(),
    capacity: integer("capacity").notNull().default(4),
    section: varchar("section", { length: 100 }).notNull().default("Main Dining"),
    status: varchar("status", { length: 50 }).notNull().default("AVAILABLE"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_restaurant_tables_outlet_number").on(table.outletId, table.tableNumber),
    index("idx_restaurant_tables_tenant_outlet").on(table.tenantId, table.outletId),
    index("idx_restaurant_tables_context_id").on(table.contextId),
    index("idx_restaurant_tables_status").on(table.tenantId, table.status),
  ]
);

export type RestaurantTable = typeof restaurantTables.$inferSelect;
export type NewRestaurantTable = typeof restaurantTables.$inferInsert;

/**
 * Restaurant Table Sessions (Dining Session Entity)
 * Represents an active or historical dining occupancy at a physical table.
 */
export const restaurantTableSessions = pgTable(
  "restaurant_table_sessions",
  {
    sessionId: uuid("session_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.organizationId),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.outletId),
    tableId: uuid("table_id")
      .notNull()
      .references(() => restaurantTables.tableId),
    sessionNumber: varchar("session_number", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("ACTIVE"),
    guestCount: integer("guest_count").notNull().default(1),
    customerName: varchar("customer_name", { length: 100 }),
    customerPhone: varchar("customer_phone", { length: 50 }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    openedByUserId: uuid("opened_by_user_id").references(() => users.userId),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_restaurant_table_sessions_number").on(table.tenantId, table.sessionNumber),
    uniqueIndex("uq_active_session_per_table")
      .on(table.tableId)
      .where(sql`"status" = 'ACTIVE'`),
    index("idx_restaurant_table_sessions_tenant_table").on(table.tenantId, table.tableId),
    index("idx_restaurant_table_sessions_status").on(table.tenantId, table.status),
  ]
);

export type RestaurantTableSession = typeof restaurantTableSessions.$inferSelect;
export type NewRestaurantTableSession = typeof restaurantTableSessions.$inferInsert;

/**
 * Restaurant Cart Items (Pre-Order / Customer Session Cart)
 * Holds unplaced, draft cart items for a customer dining session.
 * Crucial invariant: Does NOT constitute an order, bill, payment, or financial ledger entry.
 */
export const restaurantCartItems = pgTable(
  "restaurant_cart_items",
  {
    cartItemId: uuid("cart_item_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.organizationId),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => customerSessions.sessionId, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => catalogItems.itemId),
    quantity: integer("quantity").notNull().default(1),
    specialInstructions: text("special_instructions"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_restaurant_cart_session_item").on(table.sessionId, table.itemId),
    index("idx_restaurant_cart_tenant_session").on(table.tenantId, table.sessionId),
  ]
);

export type RestaurantCartItem = typeof restaurantCartItems.$inferSelect;
export type NewRestaurantCartItem = typeof restaurantCartItems.$inferInsert;
