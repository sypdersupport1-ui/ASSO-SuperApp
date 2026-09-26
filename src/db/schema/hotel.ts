import { pgTable, uuid, varchar, text, integer, boolean, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, outlets } from "./core";
import { businessContexts } from "./context";

// Operational and housekeeping status enums for type safety
export const HOTEL_OPERATIONAL_STATUSES = [
  "AVAILABLE",
  "OCCUPIED",
  "RESERVED",
  "OUT_OF_SERVICE",
  "OUT_OF_ORDER",
] as const;
export type HotelOperationalStatus = typeof HOTEL_OPERATIONAL_STATUSES[number];

export const HOTEL_HOUSEKEEPING_STATUSES = [
  "CLEAN",
  "DIRTY",
  "INSPECTED",
  "CLEANING",
  "MAINTENANCE",
] as const;
export type HotelHousekeepingStatus = typeof HOTEL_HOUSEKEEPING_STATUSES[number];

/**
 * Hotel Room Types (Domain Entity)
 */
export const hotelRoomTypes = pgTable(
  "hotel_room_types",
  {
    roomTypeId: uuid("room_type_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
    outletId: uuid("outlet_id").notNull().references(() => outlets.outletId),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    baseOccupancy: integer("base_occupancy").notNull().default(2),
    maxOccupancy: integer("max_occupancy").notNull().default(3),
    baseRate: numeric("base_rate", { precision: 14, scale: 4 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_room_types_outlet_code").on(table.outletId, table.code),
  ]
);

export type HotelRoomType = typeof hotelRoomTypes.$inferSelect;
export type NewHotelRoomType = typeof hotelRoomTypes.$inferInsert;

/**
 * Hotel Rooms (Physical Entity, mapped 1:1 to BusinessContext)
 */
export const hotelRooms = pgTable(
  "hotel_rooms",
  {
    roomId: uuid("room_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
    outletId: uuid("outlet_id").notNull().references(() => outlets.outletId),
    contextId: uuid("context_id").notNull().references(() => businessContexts.contextId),
    roomTypeId: uuid("room_type_id").notNull().references(() => hotelRoomTypes.roomTypeId),
    roomNumber: varchar("room_number", { length: 50 }).notNull(),
    floorNumber: varchar("floor_number", { length: 20 }),
    operationalStatus: varchar("operational_status", { length: 50 }).notNull().default("AVAILABLE"),
    housekeepingStatus: varchar("housekeeping_status", { length: 50 }).notNull().default("CLEAN"),
    isOccupied: boolean("is_occupied").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_hotel_rooms_outlet_number").on(table.outletId, table.roomNumber),
  ]
);

export type HotelRoom = typeof hotelRooms.$inferSelect;
export type NewHotelRoom = typeof hotelRooms.$inferInsert;
