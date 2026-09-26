import { pgTable, uuid, varchar, text, integer, boolean, numeric, timestamp, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { organizations, outlets, customers } from "./core";
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

export const HOTEL_RESERVATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type HotelReservationStatus = typeof HOTEL_RESERVATION_STATUSES[number];

/**
 * Hotel Guests (Hotel-specific guest profile attached to shared Customer)
 */
export const hotelGuests = pgTable("hotel_guests", {
  guestId: uuid("guest_id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
  customerId: uuid("customer_id").notNull().references(() => customers.customerId),
  idProofType: varchar("id_proof_type", { length: 50 }),
  idProofNumberMasked: varchar("id_proof_number_masked", { length: 50 }),
  nationality: varchar("nationality", { length: 50 }).default("INDIAN"),
  vipStatus: varchar("vip_status", { length: 50 }).default("STANDARD"),
  preferences: jsonb("preferences").default({}),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type HotelGuest = typeof hotelGuests.$inferSelect;
export type NewHotelGuest = typeof hotelGuests.$inferInsert;

/**
 * Hotel Reservations (Planned booking domain entity)
 */
export const hotelReservations = pgTable(
  "hotel_reservations",
  {
    reservationId: uuid("reservation_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
    outletId: uuid("outlet_id").notNull().references(() => outlets.outletId),
    guestId: uuid("guest_id").notNull().references(() => hotelGuests.guestId),
    reservationNumber: varchar("reservation_number", { length: 50 }).notNull(),
    roomTypeId: uuid("room_type_id").notNull().references(() => hotelRoomTypes.roomTypeId),
    assignedRoomId: uuid("assigned_room_id").references(() => hotelRooms.roomId),
    arrivalDate: timestamp("arrival_date", { withTimezone: true }).notNull(),
    departureDate: timestamp("departure_date", { withTimezone: true }).notNull(),
    adultCount: integer("adult_count").notNull().default(1),
    childrenCount: integer("children_count").notNull().default(0),
    status: varchar("status", { length: 50 }).notNull().default("CONFIRMED"),
    specialRequests: text("special_requests"),
    totalAmount: numeric("total_amount", { precision: 14, scale: 4 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_hotel_reservations_outlet_number").on(table.outletId, table.reservationNumber),
  ]
);

export type HotelReservation = typeof hotelReservations.$inferSelect;
export type NewHotelReservation = typeof hotelReservations.$inferInsert;
