import { pgTable, uuid, varchar, text, integer, boolean, numeric, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./core";

export const commercialPlans = pgTable("commercial_plans", {
  planId: uuid("plan_id").primaryKey().defaultRandom(),
  planCode: varchar("plan_code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  tierLevel: integer("tier_level").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const platformModules = pgTable("platform_modules", {
  moduleCode: varchar("module_code", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isCore: boolean("is_core").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const planModules = pgTable("plan_modules", {
  planId: uuid("plan_id").notNull().references(() => commercialPlans.planId, { onDelete: "cascade" }),
  moduleCode: varchar("module_code", { length: 50 }).notNull().references(() => platformModules.moduleCode),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pricingConfigurations = pgTable("pricing_configurations", {
  pricingId: uuid("pricing_id").primaryKey().defaultRandom(),
  targetType: varchar("target_type", { length: 50 }).notNull(),
  targetCode: varchar("target_code", { length: 50 }).notNull(),
  versionNumber: integer("version_number").notNull().default(1),
  billingPeriod: varchar("billing_period", { length: 50 }).notNull(),
  basePrice: numeric("base_price", { precision: 14, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  effectiveUntil: timestamp("effective_until", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantEntitlements = pgTable("tenant_entitlements", {
  entitlementId: uuid("entitlement_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId, { onDelete: "cascade" }),
  moduleCode: varchar("module_code", { length: 50 }).notNull().references(() => platformModules.moduleCode),
  isEnabled: boolean("is_enabled").notNull().default(true),
  grantedVia: varchar("granted_via", { length: 50 }).notNull(),
  pricingVersionId: uuid("pricing_version_id").references(() => pricingConfigurations.pricingId),
  appliedPrice: numeric("applied_price", { precision: 14, scale: 4 }),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
