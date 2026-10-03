import { pgTable, uuid, varchar, text, integer, boolean, numeric, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, outlets, users, customers, staffProfiles } from "./core";
import { businessContexts, customerSessions } from "./context";
import { catalogItems, bills, orderItems } from "./operations";

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

// Table shapes for visual floor map
export const RESTAURANT_TABLE_SHAPES = [
  "RECTANGLE",
  "ROUND",
  "SQUARE",
] as const;
export type RestaurantTableShape = (typeof RESTAURANT_TABLE_SHAPES)[number];

/**
 * Restaurant Sections (Floor / Dining Area Groupings, e.g. Main Hall, Outdoor, Patio, Bar)
 */
export const restaurantSections = pgTable(
  "restaurant_sections",
  {
    sectionId: uuid("section_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.organizationId),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.outletId),
    name: varchar("name", { length: 100 }).notNull(),
    code: varchar("code", { length: 50 }),
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_restaurant_sections_outlet_name").on(table.outletId, table.name),
    index("idx_restaurant_sections_tenant_outlet").on(table.tenantId, table.outletId),
    index("idx_restaurant_sections_tenant_outlet_order").on(table.tenantId, table.outletId, table.displayOrder),
  ]
);

export type RestaurantSection = typeof restaurantSections.$inferSelect;
export type NewRestaurantSection = typeof restaurantSections.$inferInsert;

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
    sectionId: uuid("section_id").references(() => restaurantSections.sectionId),
    tableNumber: varchar("table_number", { length: 50 }).notNull(),
    displayLabel: varchar("display_label", { length: 100 }).notNull(),
    capacity: integer("capacity").notNull().default(4),
    section: varchar("section", { length: 100 }).notNull().default("Main Dining"),
    status: varchar("status", { length: 50 }).notNull().default("AVAILABLE"),
    posX: integer("pos_x").notNull().default(0),
    posY: integer("pos_y").notNull().default(0),
    width: integer("width").notNull().default(90),
    height: integer("height").notNull().default(90),
    shape: varchar("shape", { length: 20 }).notNull().default("RECTANGLE"),
    rotation: integer("rotation").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_restaurant_tables_outlet_number").on(table.outletId, table.tableNumber),
    index("idx_restaurant_tables_tenant_outlet").on(table.tenantId, table.outletId),
    index("idx_restaurant_tables_context_id").on(table.contextId),
    index("idx_restaurant_tables_status").on(table.tenantId, table.status),
    index("idx_restaurant_tables_tenant_outlet_status").on(table.tenantId, table.outletId, table.status),
    index("idx_restaurant_tables_tenant_outlet_sec").on(table.tenantId, table.outletId, table.section),
    index("idx_restaurant_tables_section_id").on(table.sectionId),
    index("idx_restaurant_tables_tenant_outlet_section_id").on(table.tenantId, table.outletId, table.sectionId),
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
    index("idx_restaurant_table_sessions_tenant_outlet_status").on(table.tenantId, table.outletId, table.status),
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

/**
 * Restaurant Reservations (Advance Table Bookings & Table Assignments)
 */
export const RESTAURANT_RESERVATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "SEATED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type RestaurantReservationStatus = (typeof RESTAURANT_RESERVATION_STATUSES)[number];

export const RESTAURANT_RESERVATION_SOURCES = [
  "CUSTOMER_WEB",
  "STAFF_POS",
  "PHONE",
] as const;
export type RestaurantReservationSource = (typeof RESTAURANT_RESERVATION_SOURCES)[number];

export const restaurantReservations = pgTable(
  "restaurant_reservations",
  {
    reservationId: uuid("reservation_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.organizationId),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.outletId),
    customerId: uuid("customer_id")
      .references(() => customers.customerId),
    customerName: varchar("customer_name", { length: 255 }).notNull(),
    customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
    customerEmail: varchar("customer_email", { length: 255 }),
    partySize: integer("party_size").notNull(),
    reservationDate: varchar("reservation_date", { length: 10 }).notNull(), // YYYY-MM-DD
    reservationTime: varchar("reservation_time", { length: 10 }).notNull(), // HH:MM
    durationMinutes: integer("duration_minutes").notNull().default(90),
    status: varchar("status", { length: 50 }).notNull().default("CONFIRMED"),
    assignedTableId: uuid("assigned_table_id")
      .references(() => restaurantTables.tableId, { onDelete: "set null" }),
    sectionId: uuid("section_id")
      .references(() => restaurantSections.sectionId, { onDelete: "set null" }),
    notes: text("notes"),
    source: varchar("source", { length: 50 }).notNull().default("CUSTOMER_WEB"),
    seatedSessionId: uuid("seated_session_id")
      .references(() => restaurantTableSessions.sessionId, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id")
      .references(() => users.userId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_restaurant_reservations_tenant_outlet_date").on(table.tenantId, table.outletId, table.reservationDate),
    index("idx_restaurant_reservations_tenant_outlet_status").on(table.tenantId, table.outletId, table.status),
    index("idx_restaurant_reservations_assigned_table").on(table.tenantId, table.assignedTableId, table.reservationDate),
    index("idx_restaurant_reservations_customer_phone").on(table.tenantId, table.customerPhone),
  ]
);

export type RestaurantReservation = typeof restaurantReservations.$inferSelect;
export type NewRestaurantReservation = typeof restaurantReservations.$inferInsert;

/**
 * Restaurant Waitlist (Live Walk-In Dining Queue)
 */
export const RESTAURANT_WAITLIST_STATUSES = [
  "WAITING",
  "CALLED",
  "SEATED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type RestaurantWaitlistStatus = (typeof RESTAURANT_WAITLIST_STATUSES)[number];

export const restaurantWaitlist = pgTable(
  "restaurant_waitlist",
  {
    waitlistId: uuid("waitlist_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.organizationId),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.outletId),
    customerId: uuid("customer_id")
      .references(() => customers.customerId),
    customerName: varchar("customer_name", { length: 255 }).notNull(),
    customerPhone: varchar("customer_phone", { length: 50 }).notNull(),
    partySize: integer("party_size").notNull(),
    preferredSectionId: uuid("preferred_section_id")
      .references(() => restaurantSections.sectionId, { onDelete: "set null" }),
    queuePosition: integer("queue_position").notNull(),
    estimatedWaitMinutes: integer("estimated_wait_minutes").notNull().default(15),
    status: varchar("status", { length: 50 }).notNull().default("WAITING"),
    assignedTableId: uuid("assigned_table_id")
      .references(() => restaurantTables.tableId, { onDelete: "set null" }),
    seatedSessionId: uuid("seated_session_id")
      .references(() => restaurantTableSessions.sessionId, { onDelete: "set null" }),
    notes: text("notes"),
    calledAt: timestamp("called_at", { withTimezone: true }),
    seatedAt: timestamp("seated_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_restaurant_waitlist_tenant_outlet_queue").on(table.tenantId, table.outletId, table.status, table.queuePosition),
    index("idx_restaurant_waitlist_tenant_outlet_created").on(table.tenantId, table.outletId, table.createdAt),
    index("idx_restaurant_waitlist_customer_phone").on(table.tenantId, table.customerPhone),
  ]
);

export type RestaurantWaitlistItem = typeof restaurantWaitlist.$inferSelect;
export type NewRestaurantWaitlistItem = typeof restaurantWaitlist.$inferInsert;

// ============================================================================
// Restaurant R3.6: Bill Splits, Portions, Items & Tip Distribution
// ============================================================================

export const RESTAURANT_SPLIT_TYPES = [
  "EQUAL",
  "ITEM",
  "CUSTOM",
] as const;
export type RestaurantSplitType = (typeof RESTAURANT_SPLIT_TYPES)[number];

export const RESTAURANT_SPLIT_STATUSES = [
  "ACTIVE",
  "SETTLED",
  "CANCELLED",
] as const;
export type RestaurantSplitStatus = (typeof RESTAURANT_SPLIT_STATUSES)[number];

export const RESTAURANT_PORTION_STATUSES = [
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
] as const;
export type RestaurantPortionStatus = (typeof RESTAURANT_PORTION_STATUSES)[number];

/**
 * Restaurant Bill Splits (Splitting Scheme Header)
 */
export const restaurantBillSplits = pgTable(
  "restaurant_bill_splits",
  {
    splitId: uuid("split_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.organizationId),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.outletId),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.billId, { onDelete: "cascade" }),
    splitType: varchar("split_type", { length: 50 }).notNull(), // 'EQUAL', 'ITEM', 'CUSTOM'
    totalPortions: integer("total_portions").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("ACTIVE"), // 'ACTIVE', 'SETTLED', 'CANCELLED'
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_restaurant_bill_splits_tenant_bill").on(table.tenantId, table.billId),
    index("idx_restaurant_bill_splits_tenant_status").on(table.tenantId, table.status),
  ]
);

export type RestaurantBillSplit = typeof restaurantBillSplits.$inferSelect;
export type NewRestaurantBillSplit = typeof restaurantBillSplits.$inferInsert;

/**
 * Restaurant Bill Split Portions (Individual Portion / Share)
 */
export const restaurantBillSplitPortions = pgTable(
  "restaurant_bill_split_portions",
  {
    portionId: uuid("portion_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.organizationId),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.outletId),
    splitId: uuid("split_id")
      .notNull()
      .references(() => restaurantBillSplits.splitId, { onDelete: "cascade" }),
    portionNumber: integer("portion_number").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    allocatedAmount: numeric("allocated_amount", { precision: 14, scale: 4 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 4 }).notNull().default("0"),
    platformFeeAmount: numeric("platform_fee_amount", { precision: 14, scale: 4 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 4 }).notNull().default("0"),
    tipAmount: numeric("tip_amount", { precision: 14, scale: 4 }).notNull().default("0"),
    totalAmount: numeric("total_amount", { precision: 14, scale: 4 }).notNull(),
    paidAmount: numeric("paid_amount", { precision: 14, scale: 4 }).notNull().default("0"),
    status: varchar("status", { length: 50 }).notNull().default("UNPAID"), // 'UNPAID', 'PARTIALLY_PAID', 'PAID'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_restaurant_split_portions_tenant_split").on(table.tenantId, table.splitId),
    index("idx_restaurant_split_portions_tenant_status").on(table.tenantId, table.status),
  ]
);

export type RestaurantBillSplitPortion = typeof restaurantBillSplitPortions.$inferSelect;
export type NewRestaurantBillSplitPortion = typeof restaurantBillSplitPortions.$inferInsert;

/**
 * Restaurant Bill Split Items (Order Item Allocations for Item Splits)
 */
export const restaurantBillSplitItems = pgTable(
  "restaurant_bill_split_items",
  {
    splitItemId: uuid("split_item_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.organizationId),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.outletId),
    portionId: uuid("portion_id")
      .notNull()
      .references(() => restaurantBillSplitPortions.portionId, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.orderItemId, { onDelete: "cascade" }),
    allocatedQuantity: integer("allocated_quantity").notNull(),
    allocatedAmount: numeric("allocated_amount", { precision: 14, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_restaurant_split_items_tenant_portion").on(table.tenantId, table.portionId),
    index("idx_restaurant_split_items_order_item").on(table.orderItemId),
  ]
);

export type RestaurantBillSplitItem = typeof restaurantBillSplitItems.$inferSelect;
export type NewRestaurantBillSplitItem = typeof restaurantBillSplitItems.$inferInsert;

/**
 * Restaurant Tip Distributions
 */
export const restaurantTipDistributions = pgTable(
  "restaurant_tip_distributions",
  {
    tipDistributionId: uuid("tip_distribution_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.organizationId),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.outletId),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.billId, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .references(() => staffProfiles.staffId, { onDelete: "set null" }),
    recipientName: varchar("recipient_name", { length: 100 }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 4 }).notNull(),
    percentage: numeric("percentage", { precision: 6, scale: 4 }),
    notes: text("notes"),
    distributedByUserId: uuid("distributed_by_user_id")
      .references(() => users.userId, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_restaurant_tip_dist_tenant_bill").on(table.tenantId, table.billId),
    index("idx_restaurant_tip_dist_staff").on(table.tenantId, table.staffId),
  ]
);

export type RestaurantTipDistribution = typeof restaurantTipDistributions.$inferSelect;
export type NewRestaurantTipDistribution = typeof restaurantTipDistributions.$inferInsert;
