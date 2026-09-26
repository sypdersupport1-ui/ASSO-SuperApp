import { pgTable, uuid, varchar, text, integer, boolean, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";
import { organizations, outlets, users, staffProfiles } from "./core";
import { businessContexts, customerSessions } from "./context";

export const catalogs = pgTable("catalogs", {
  catalogId: uuid("catalog_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  outletId: uuid("outlet_id").references(() => outlets.outletId),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const catalogCategories = pgTable("catalog_categories", {
  categoryId: uuid("category_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  catalogId: uuid("catalog_id").notNull().references(() => catalogs.catalogId, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const catalogItems = pgTable("catalog_items", {
  itemId: uuid("item_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  categoryId: uuid("category_id").notNull().references(() => catalogCategories.categoryId),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sku: varchar("sku", { length: 100 }),
  basePrice: numeric("base_price", { precision: 14, scale: 4 }).notNull(),
  taxRate: numeric("tax_rate", { precision: 6, scale: 4 }).notNull().default("0.0500"),
  isAvailable: boolean("is_available").notNull().default(true),
  fulfillmentStation: varchar("fulfillment_station", { length: 50 }).notNull().default("KITCHEN"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  orderId: uuid("order_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  outletId: uuid("outlet_id").notNull().references(() => outlets.outletId),
  contextId: uuid("context_id").notNull().references(() => businessContexts.contextId),
  sessionId: uuid("session_id").references(() => customerSessions.sessionId),
  createdByStaffId: uuid("created_by_staff_id").references(() => staffProfiles.staffId),
  orderNumber: varchar("order_number", { length: 50 }).notNull(),
  orderSource: varchar("order_source", { length: 50 }).notNull(), // 'QR_CUSTOMER', 'STAFF_POS', 'DESK_ORDER'
  status: varchar("status", { length: 50 }).notNull().default("PLACED"),
  cancellationReason: text("cancellation_reason"),
  idempotencyKey: varchar("idempotency_key", { length: 100 }),
  subtotalAmount: numeric("subtotal_amount", { precision: 14, scale: 4 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 4 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 14, scale: 4 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 4 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderItems = pgTable("order_items", {
  orderItemId: uuid("order_item_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  orderId: uuid("order_id").notNull().references(() => orders.orderId, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => catalogItems.itemId),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 4 }).notNull(),
  quantity: integer("quantity").notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 4 }).notNull(),
  fulfillmentStation: varchar("fulfillment_station", { length: 50 }).notNull().default("KITCHEN"),
  itemStatus: varchar("item_status", { length: 50 }).notNull().default("PLACED"),
  specialNotes: text("special_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderStatusHistory = pgTable("order_status_history", {
  historyId: uuid("history_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  orderId: uuid("order_id").notNull().references(() => orders.orderId, { onDelete: "cascade" }),
  fromStatus: varchar("from_status", { length: 50 }).notNull(),
  toStatus: varchar("to_status", { length: 50 }).notNull(),
  changedByUserId: uuid("changed_by_user_id").references(() => users.userId),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bills = pgTable("bills", {
  billId: uuid("bill_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  outletId: uuid("outlet_id").notNull().references(() => outlets.outletId),
  contextId: uuid("context_id").references(() => businessContexts.contextId),
  billNumber: varchar("bill_number", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("OPEN"),
  subtotalAmount: numeric("subtotal_amount", { precision: 14, scale: 4 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 4 }).notNull().default("0"),
  discountAmount: numeric("discount_amount", { precision: 14, scale: 4 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 4 }).notNull().default("0"),
  settledAmount: numeric("settled_amount", { precision: 14, scale: 4 }).notNull().default("0"),
  idempotencyKey: varchar("idempotency_key", { length: 100 }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Canonical Ledger: Payment Transactions
export const paymentTransactions = pgTable("payment_transactions", {
  paymentId: uuid("payment_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  outletId: uuid("outlet_id").notNull().references(() => outlets.outletId),
  billId: uuid("bill_id").references(() => bills.billId),
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(), // 'CASH', 'UPI', 'CARD', 'NETBANKING', 'GATEWAY', 'HOUSE_ACCOUNT'
  gatewayProvider: varchar("gateway_provider", { length: 50 }).notNull().default("MOCK"),
  gatewayTransactionReference: varchar("gateway_transaction_reference", { length: 100 }),
  gatewayMetadata: jsonb("gateway_metadata").default({}),
  amount: numeric("amount", { precision: 14, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  status: varchar("status", { length: 50 }).notNull().default("PENDING"),
  idempotencyKey: varchar("idempotency_key", { length: 100 }).unique(),
  errorCode: varchar("error_code", { length: 100 }),
  errorDescription: text("error_description"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Canonical Ledger: Payment Refunds
export const paymentRefunds = pgTable("payment_refunds", {
  refundId: uuid("refund_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  paymentId: uuid("payment_id").notNull().references(() => paymentTransactions.paymentId),
  refundAmount: numeric("refund_amount", { precision: 14, scale: 4 }).notNull(),
  gatewayRefundId: varchar("gateway_refund_id", { length: 100 }),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("PENDING"),
  approvedByStaffId: uuid("approved_by_staff_id").references(() => staffProfiles.staffId),
  idempotencyKey: varchar("idempotency_key", { length: 100 }).unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
