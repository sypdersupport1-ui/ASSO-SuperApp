import { pgTable, uuid, varchar, text, numeric, date, timestamp, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations, outlets, staffProfiles } from "./core";

export const expenseCategories = pgTable(
  "expense_categories",
  {
    categoryId: uuid("category_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
    name: varchar("name", { length: 100 }).notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    isActive: varchar("is_active", { length: 10 }).notNull().default("true"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_exp_categories_tenant_code").on(table.tenantId, table.code),
  ]
);

export const expenses = pgTable("expenses", {
  expenseId: uuid("expense_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  outletId: uuid("outlet_id").notNull().references(() => outlets.outletId),
  categoryId: uuid("category_id").notNull().references(() => expenseCategories.categoryId),
  payeeName: varchar("payee_name", { length: 255 }).notNull(),
  amount: numeric("amount", { precision: 14, scale: 4 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(), // 'CASH', 'BANK_TRANSFER', 'UPI', 'CARD'
  status: varchar("status", { length: 50 }).notNull().default("PENDING_APPROVAL"), // 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAID'
  incurredDate: date("incurred_date").notNull(),
  description: text("description").notNull(),
  receiptAttachmentUrl: text("receipt_attachment_url"),
  createdByStaffId: uuid("created_by_staff_id").notNull().references(() => staffProfiles.staffId),
  approvedByStaffId: uuid("approved_by_staff_id").references(() => staffProfiles.staffId),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cashSessions = pgTable("cash_sessions", {
  sessionId: uuid("session_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  outletId: uuid("outlet_id").notNull().references(() => outlets.outletId),
  staffId: uuid("staff_id").notNull().references(() => staffProfiles.staffId),
  openingBalance: numeric("opening_balance", { precision: 14, scale: 4 }).notNull(),
  closingBalance: numeric("closing_balance", { precision: 14, scale: 4 }),
  calculatedCashIn: numeric("calculated_cash_in", { precision: 14, scale: 4 }).default("0"),
  calculatedCashOut: numeric("calculated_cash_out", { precision: 14, scale: 4 }).default("0"),
  discrepancyAmount: numeric("discrepancy_amount", { precision: 14, scale: 4 }).default("0"),
  status: varchar("status", { length: 50 }).notNull().default("OPEN"), // 'OPEN', 'CLOSED', 'RECONCILED'
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Canonical Ledger: Cash Movements (Append-Only)
export const cashMovements = pgTable("cash_movements", {
  movementId: uuid("movement_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  sessionId: uuid("session_id").notNull().references(() => cashSessions.sessionId),
  movementType: varchar("movement_type", { length: 50 }).notNull(), // 'PAYMENT_IN', 'EXPENSE_OUT', 'DROP', 'FLOAT_ADJUSTMENT'
  amount: numeric("amount", { precision: 14, scale: 4 }).notNull(), // Positive for in, negative for out
  referenceId: uuid("reference_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Tax Configurations (Business / Outlet Level GST Configuration)
 * Authoritative source of tax rates per outlet/tenant.
 */
export const taxConfigurations = pgTable(
  "tax_configurations",
  {
    configId: uuid("config_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").references(() => outlets.outletId, { onDelete: "cascade" }),
    taxName: varchar("tax_name", { length: 100 }).notNull().default("GST"),
    taxRate: numeric("tax_rate", { precision: 6, scale: 4 }).notNull().default("0.0000"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_tax_config_tenant_outlet").on(table.tenantId, table.outletId),
    index("idx_tax_config_tenant").on(table.tenantId),
  ]
);

export type TaxConfiguration = typeof taxConfigurations.$inferSelect;
export type NewTaxConfiguration = typeof taxConfigurations.$inferInsert;

/**
 * Platform Fee Configurations (ASSO Super Admin / Platform Level)
 * Distinct financial charge configured at platform or tenant override level.
 */
export const platformFeeConfigurations = pgTable(
  "platform_fee_configurations",
  {
    configId: uuid("config_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => organizations.organizationId, { onDelete: "cascade" }),
    outletId: uuid("outlet_id").references(() => outlets.outletId, { onDelete: "cascade" }),
    feeType: varchar("fee_type", { length: 20 }).notNull().default("PERCENTAGE"), // 'PERCENTAGE', 'FIXED'
    feeRate: numeric("fee_rate", { precision: 6, scale: 4 }).notNull().default("0.0000"),
    fixedAmount: numeric("fixed_amount", { precision: 14, scale: 4 }).notNull().default("0.0000"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_platform_fee_tenant_outlet").on(table.tenantId, table.outletId),
    index("idx_platform_fee_tenant").on(table.tenantId),
  ]
);

export type PlatformFeeConfiguration = typeof platformFeeConfigurations.$inferSelect;
export type NewPlatformFeeConfiguration = typeof platformFeeConfigurations.$inferInsert;

