import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./core";

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    keyId: uuid("key_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => organizations.organizationId),
    operation: varchar("operation", { length: 100 }).notNull().default("DEFAULT"),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("IN_PROGRESS"), // 'IN_PROGRESS', 'COMPLETED', 'FAILED'
    responseCode: integer("response_code"),
    responseBody: jsonb("response_body"),
    responseHeaders: jsonb("response_headers"),
    resourceId: varchar("resource_id", { length: 128 }),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_idempotency_keys_tenant_op_key").on(
      sql`COALESCE(${table.tenantId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      table.operation,
      table.idempotencyKey
    ),
    index("idx_idempotency_keys_expires_at").on(table.expiresAt),
    index("idx_idempotency_keys_lease").on(table.status, table.leaseExpiresAt),
  ]
);

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;


export const auditEvents = pgTable(
  "audit_events",
  {
    eventId: uuid("event_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => organizations.organizationId),
    userId: uuid("user_id"),
    action: varchar("action", { length: 100 }).notNull(),
    resourceType: varchar("resource_type", { length: 100 }).notNull(),
    resourceId: varchar("resource_id", { length: 100 }),
    payload: jsonb("payload"),
    ipAddress: varchar("ip_address", { length: 50 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

export const fileRecords = pgTable(
  "file_records",
  {
    fileId: uuid("file_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
    uploadedBy: uuid("uploaded_by"),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: varchar("storage_key", { length: 500 }).notNull().unique(),
    isPublic: varchar("is_public", { length: 10 }).notNull().default("false"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  }
);
