import { pgTable, uuid, varchar, text, boolean, integer, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations, outlets } from "./core";

/**
 * Transactional Outbox for Domain Events
 * Guarantees atomic business mutation + durable event publication.
 */
export const domainOutboxEvents = pgTable(
  "domain_outbox_events",
  {
    outboxId: uuid("outbox_id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
    outletId: uuid("outlet_id").references(() => outlets.outletId),
    vertical: varchar("vertical", { length: 30 }).notNull(), // 'HOTEL', 'RESTAURANT', 'CINEMA'
    eventType: varchar("event_type", { length: 100 }).notNull(),
    aggregateType: varchar("aggregate_type", { length: 100 }).notNull(),
    aggregateId: varchar("aggregate_id", { length: 100 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"), // 'PENDING', 'PROCESSING', 'COMPLETED', 'RETRY_WAITING', 'FAILED', 'DEAD_LETTER'
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    providerRef: varchar("provider_ref", { length: 255 }),
    claimedBy: varchar("claimed_by", { length: 100 }),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("uq_outbox_event_id").on(table.eventId),
    uniqueIndex("uq_outbox_idempotency_key").on(table.idempotencyKey),
    index("idx_outbox_tenant_status").on(table.tenantId, table.status),
    index("idx_outbox_created_at").on(table.createdAt),
    index("idx_outbox_claimable").on(table.status, table.nextRetryAt, table.claimExpiresAt),
    index("idx_outbox_claimed_by").on(table.claimedBy),
  ]
);

/**
 * Communication Template Model
 * Decouples message wording and provider template configurations from business logic.
 */
export const communicationTemplates = pgTable(
  "communication_templates",
  {
    templateId: uuid("template_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => organizations.organizationId), // Nullable for global defaults
    vertical: varchar("vertical", { length: 30 }).notNull(), // 'HOTEL', 'RESTAURANT', 'CINEMA'
    eventType: varchar("event_type", { length: 100 }).notNull(),
    channel: varchar("channel", { length: 30 }).notNull(), // 'IN_APP', 'SMS_DLT', 'WHATSAPP'
    templateIdentifier: varchar("template_identifier", { length: 100 }).notNull(),
    titleTemplate: varchar("255", { length: 255 }).notNull(),
    bodyTemplate: text("body_template").notNull(),
    supportedVariables: jsonb("supported_variables").notNull().default("[]"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_comm_tpl_lookup").on(table.tenantId, table.vertical, table.eventType, table.channel),
    index("idx_comm_tpl_identifier").on(table.templateIdentifier),
  ]
);

/**
 * In-App Notifications
 * Durable storage for user/staff notifications triggered by trusted domain events.
 */
export const inAppNotifications = pgTable(
  "in_app_notifications",
  {
    notificationId: uuid("notification_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
    outletId: uuid("outlet_id").references(() => outlets.outletId),
    recipientType: varchar("recipient_type", { length: 20 }).notNull(), // 'CUSTOMER', 'STAFF'
    recipientId: varchar("recipient_id", { length: 100 }).notNull(), // Customer ID or Staff Profile ID
    roleScope: varchar("role_scope", { length: 50 }), // e.g. 'FRONT_DESK', 'HOTEL_ADMIN' for team broadcasts
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    deepLink: text("deep_link"),
    metadata: jsonb("metadata").default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_in_app_tenant_recipient").on(table.tenantId, table.recipientType, table.recipientId),
    index("idx_in_app_tenant_role_scope").on(table.tenantId, table.roleScope),
    index("idx_in_app_created_at").on(table.createdAt),
  ]
);

/**
 * Communication Delivery Audit Logs
 * Records the outcome of dispatching events through communication adapters.
 */
export const communicationDeliveryLogs = pgTable(
  "communication_delivery_logs",
  {
    logId: uuid("log_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
    outboxId: uuid("outbox_id").references(() => domainOutboxEvents.outboxId),
    eventId: uuid("event_id").notNull(),
    channel: varchar("channel", { length: 30 }).notNull(), // 'IN_APP', 'SMS_DLT', 'WHATSAPP'
    recipient: varchar("recipient", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(), // 'DELIVERED', 'FAILED', 'SKIPPED'
    providerReference: varchar("provider_reference", { length: 255 }),
    errorMessage: text("error_message"),
    attemptNumber: integer("attempt_number").notNull().default(1),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_comm_logs_tenant_outbox").on(table.tenantId, table.outboxId),
    index("idx_comm_logs_event_id").on(table.eventId),
  ]
);

export type DomainOutboxEvent = typeof domainOutboxEvents.$inferSelect;
export type InsertDomainOutboxEvent = typeof domainOutboxEvents.$inferInsert;
export type CommunicationTemplate = typeof communicationTemplates.$inferSelect;
export type InsertCommunicationTemplate = typeof communicationTemplates.$inferInsert;
export type InAppNotification = typeof inAppNotifications.$inferSelect;
export type InsertInAppNotification = typeof inAppNotifications.$inferInsert;
export type CommunicationDeliveryLog = typeof communicationDeliveryLogs.$inferSelect;
export type InsertCommunicationDeliveryLog = typeof communicationDeliveryLogs.$inferInsert;
