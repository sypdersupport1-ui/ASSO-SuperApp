import { pgTable, uuid, varchar, integer, numeric, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations, outlets } from "./core";

/**
 * Analytics / Reporting Read Model: Daily Outlet Metrics Projection
 * Asynchronously projected from transactional domain events (OrderConfirmed, OrderCompleted, etc.)
 * Strictly non-authoritative derived data with deterministic rebuild/replay support.
 */
export const analyticsDailyOutletMetrics = pgTable(
  "analytics_daily_outlet_metrics",
  {
    metricId: uuid("metric_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => organizations.organizationId),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.outletId),
    vertical: varchar("vertical", { length: 30 }).notNull(), // 'RESTAURANT', 'HOTEL', 'CINEMA'
    metricDate: varchar("metric_date", { length: 10 }).notNull(), // 'YYYY-MM-DD'
    orderCount: integer("order_count").notNull().default(0),
    grossSalesAmount: numeric("gross_sales_amount", { precision: 14, scale: 4 }).notNull().default("0"),
    netSalesAmount: numeric("net_sales_amount", { precision: 14, scale: 4 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 4 }).notNull().default("0"),
    platformFeeAmount: numeric("platform_fee_amount", { precision: 14, scale: 4 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 4 }).notNull().default("0"),
    completedOrderCount: integer("completed_order_count").notNull().default(0),
    cancelledOrderCount: integer("cancelled_order_count").notNull().default(0),
    guestCount: integer("guest_count").notNull().default(0),
    lastEventId: uuid("last_event_id"),
    lastProcessedAt: timestamp("last_processed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_analytics_daily_tenant_outlet_date").on(
      table.tenantId,
      table.outletId,
      table.metricDate
    ),
    index("idx_analytics_daily_tenant_date").on(table.tenantId, table.metricDate),
  ]
);

export type AnalyticsDailyOutletMetric = typeof analyticsDailyOutletMetrics.$inferSelect;
export type NewAnalyticsDailyOutletMetric = typeof analyticsDailyOutletMetrics.$inferInsert;
