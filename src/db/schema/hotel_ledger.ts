import { pgTable, uuid, varchar, text, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, outlets, staffProfiles } from "./core";

// Canonical Folio Header (Financial Settlement Projection)
export const hotelFolios = pgTable(
  "hotel_folios",
  {
    folioId: uuid("folio_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
    outletId: uuid("outlet_id").notNull().references(() => outlets.outletId),
    stayId: uuid("stay_id"), // Reference to vertical stay record when vertical is active
    folioNumber: varchar("folio_number", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("OPEN"), // 'OPEN', 'SETTLED', 'CLOSED'
    totalCharges: numeric("total_charges", { precision: 14, scale: 4 }).notNull().default("0"),
    totalPayments: numeric("total_payments", { precision: 14, scale: 4 }).notNull().default("0"),
    balanceDue: numeric("balance_due", { precision: 14, scale: 4 }).notNull().default("0"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_hotel_folios_outlet_number").on(table.outletId, table.folioNumber),
  ]
);

// Canonical Ledger: Hotel Folio Entries (Strictly Immutable Financial Ledger)
export const hotelFolioEntries = pgTable("hotel_folio_entries", {
  entryId: uuid("entry_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  folioId: uuid("folio_id").notNull().references(() => hotelFolios.folioId),
  entryType: varchar("entry_type", { length: 50 }).notNull(), // 'ROOM_CHARGE', 'TAX', 'SERVICE', 'PAYMENT', 'ADJUSTMENT', 'REVERSAL'
  amount: numeric("amount", { precision: 14, scale: 4 }).notNull(), // Negative for payments/reversals
  description: text("description").notNull(),
  referenceId: uuid("reference_id"), // bill_id, payment_id, or original entry_id
  reversesEntryId: uuid("reverses_entry_id"), // Self-reference for compensating entries
  postedByStaffId: uuid("posted_by_staff_id").references(() => staffProfiles.staffId),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
