import { pgTable, uuid, varchar, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { organizations, outlets, customers } from "./core";

export const businessContexts = pgTable("business_contexts", {
  contextId: uuid("context_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  outletId: uuid("outlet_id").notNull().references(() => outlets.outletId),
  contextType: varchar("context_type", { length: 50 }).notNull(), // 'ROOM', 'TABLE', 'SEAT', 'SCREEN_AREA', 'COUNTER'
  identifier: varchar("identifier", { length: 100 }).notNull(),
  displayLabel: varchar("display_label", { length: 100 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("AVAILABLE"),
  metadata: jsonb("metadata").default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const qrTokens = pgTable("qr_tokens", {
  tokenId: uuid("token_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  outletId: uuid("outlet_id").notNull().references(() => outlets.outletId),
  contextId: uuid("context_id").notNull().references(() => businessContexts.contextId),
  opaqueToken: varchar("opaque_token", { length: 128 }).notNull().unique(),
  tokenStatus: varchar("token_status", { length: 50 }).notNull().default("ACTIVE"), // 'ACTIVE', 'SUSPENDED', 'REVOKED'
  revocationReason: text("revocation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customerSessions = pgTable("customer_sessions", {
  sessionId: uuid("session_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  outletId: uuid("outlet_id").notNull().references(() => outlets.outletId),
  contextId: uuid("context_id").notNull().references(() => businessContexts.contextId),
  tokenId: uuid("token_id").notNull().references(() => qrTokens.tokenId),
  customerId: uuid("customer_id").references(() => customers.customerId),
  deviceFingerprint: varchar("device_fingerprint", { length: 255 }).notNull(),
  customerPhone: varchar("customer_phone", { length: 50 }),
  customerName: varchar("customer_name", { length: 100 }),
  sessionStatus: varchar("session_status", { length: 50 }).notNull().default("ACTIVE"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CustomerSession = typeof customerSessions.$inferSelect;
export type NewCustomerSession = typeof customerSessions.$inferInsert;

