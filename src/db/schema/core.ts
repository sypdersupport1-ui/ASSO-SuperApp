import { pgTable, uuid, varchar, text, boolean, timestamp, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const organizations = pgTable(
  "organizations",
  {
    organizationId: uuid("organization_id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    legalName: varchar("legal_name", { length: 255 }),
    taxIdentifier: varchar("tax_identifier", { length: 100 }),
    primaryBusinessType: varchar("primary_business_type", { length: 50 }).notNull(),
    subscriptionStatus: varchar("subscription_status", { length: 50 }).notNull().default("TRIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  }
);

export const outlets = pgTable(
  "outlets",
  {
    outletId: uuid("outlet_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
    name: varchar("name", { length: 255 }).notNull(),
    code: varchar("code", { length: 50 }).notNull(),
    verticalType: varchar("vertical_type", { length: 50 }).notNull(),
    timezone: varchar("timezone", { length: 100 }).notNull().default("Asia/Kolkata"),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_outlets_tenant_vertical").on(table.tenantId, table.verticalType),
  ]
);

export const users = pgTable(
  "users",
  {
    userId: uuid("user_id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).unique(),
    phone: varchar("phone", { length: 50 }).unique(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  }
);

export const staffProfiles = pgTable(
  "staff_profiles",
  {
    staffId: uuid("staff_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
    userId: uuid("user_id").notNull().references(() => users.userId),
    outletId: uuid("outlet_id").references(() => outlets.outletId),
    employeeCode: varchar("employee_code", { length: 50 }),
    department: varchar("department", { length: 100 }),
    jobTitle: varchar("job_title", { length: 100 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

export const roles = pgTable(
  "roles",
  {
    roleId: uuid("role_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => organizations.organizationId), // null for system role
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    isSystemRole: boolean("is_system_role").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

export const permissions = pgTable(
  "permissions",
  {
    permissionId: uuid("permission_id").primaryKey().defaultRandom(),
    moduleCode: varchar("module_code", { length: 50 }).notNull(),
    actionCode: varchar("action_code", { length: 50 }).notNull(),
    fullCode: varchar("full_code", { length: 100 }).notNull().unique(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

export const customers = pgTable(
  "customers",
  {
    customerId: uuid("customer_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }),
    email: varchar("email", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_customers_tenant_phone").on(table.tenantId, table.phone),
    index("idx_customers_tenant_email").on(table.tenantId, table.email),
  ]
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
