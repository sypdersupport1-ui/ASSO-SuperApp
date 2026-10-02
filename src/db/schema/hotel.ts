import { pgTable, uuid, varchar, text, integer, boolean, numeric, timestamp, uniqueIndex, index, jsonb } from "drizzle-orm/pg-core";
import { organizations, outlets, customers, users } from "./core";
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
    index("idx_hotel_rooms_tenant_outlet").on(table.tenantId, table.outletId),
    index("idx_hotel_rooms_context").on(table.contextId),
    index("idx_hotel_rooms_room_type").on(table.roomTypeId),
    index("idx_hotel_rooms_status").on(table.tenantId, table.operationalStatus),
  ]
);

export type HotelRoom = typeof hotelRooms.$inferSelect;
export type NewHotelRoom = typeof hotelRooms.$inferInsert;

export const HOTEL_RESERVATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "COMPLETED",
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

export const HOTEL_STAY_STATUSES = [
  "ACTIVE",
  "CHECKED_OUT",
] as const;
export type HotelStayStatus = typeof HOTEL_STAY_STATUSES[number];

/**
 * Hotel Stays (Actual in-house occupancy lifecycle)
 */
export const hotelStays = pgTable(
  "hotel_stays",
  {
    stayId: uuid("stay_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
    outletId: uuid("outlet_id").notNull().references(() => outlets.outletId),
    reservationId: uuid("reservation_id").notNull().references(() => hotelReservations.reservationId),
    guestId: uuid("guest_id").notNull().references(() => hotelGuests.guestId),
    roomId: uuid("room_id").notNull().references(() => hotelRooms.roomId),
    stayNumber: varchar("stay_number", { length: 50 }).notNull(),
    checkInAt: timestamp("check_in_at", { withTimezone: true }).notNull().defaultNow(),
    expectedCheckOutAt: timestamp("expected_check_out_at", { withTimezone: true }).notNull(),
    actualCheckOutAt: timestamp("actual_check_out_at", { withTimezone: true }),
    status: varchar("status", { length: 50 }).notNull().default("ACTIVE"),
    adultCount: integer("adult_count").notNull().default(1),
    childrenCount: integer("children_count").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_hotel_stays_outlet_number").on(table.outletId, table.stayNumber),
    index("idx_hotel_stays_tenant_status").on(table.tenantId, table.status),
    index("idx_hotel_stays_tenant_outlet").on(table.tenantId, table.outletId),
    index("idx_hotel_stays_room_status").on(table.tenantId, table.roomId, table.status),
    index("idx_hotel_stays_reservation").on(table.reservationId),
    index("idx_hotel_stays_room").on(table.roomId),
    index("idx_hotel_stays_guest").on(table.guestId),
  ]
);

export type HotelStay = typeof hotelStays.$inferSelect;
export type NewHotelStay = typeof hotelStays.$inferInsert;

export const HOTEL_HOUSEKEEPING_TASK_TYPES = [
  "DEPARTURE_TURNOVER",
  "ROUTINE_CLEANING",
  "DEEP_CLEANING",
  "INSPECTION",
] as const;
export type HotelHousekeepingTaskType = typeof HOTEL_HOUSEKEEPING_TASK_TYPES[number];

export const HOTEL_HOUSEKEEPING_TASK_STATUSES = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "CLEANED",
  "INSPECTED",
  "CANCELLED",
] as const;
export type HotelHousekeepingTaskStatus = typeof HOTEL_HOUSEKEEPING_TASK_STATUSES[number];

export const HOTEL_HOUSEKEEPING_TASK_PRIORITIES = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
] as const;
export type HotelHousekeepingTaskPriority = typeof HOTEL_HOUSEKEEPING_TASK_PRIORITIES[number];

/**
 * Hotel Housekeeping Tasks (Operational work items associated with physical rooms)
 */
export const hotelHousekeepingTasks = pgTable(
  "hotel_housekeeping_tasks",
  {
    taskId: uuid("task_id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => organizations.organizationId),
    outletId: uuid("outlet_id").notNull().references(() => outlets.outletId),
    roomId: uuid("room_id").notNull().references(() => hotelRooms.roomId),
    taskType: varchar("task_type", { length: 50 }).notNull().default("DEPARTURE_TURNOVER"),
    triggerSource: varchar("trigger_source", { length: 50 }).notNull().default("MANUAL"),
    assignedStaffId: uuid("assigned_staff_id").references(() => users.userId),
    status: varchar("status", { length: 50 }).notNull().default("PENDING"),
    priority: varchar("priority", { length: 50 }).notNull().default("NORMAL"),
    notes: text("notes"),
    inspectionNotes: text("inspection_notes"),
    inspectedBy: uuid("inspected_by").references(() => users.userId),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    inspectedAt: timestamp("inspected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_hk_tasks_tenant_outlet").on(table.tenantId, table.outletId),
    index("idx_hk_tasks_tenant_outlet_status").on(table.tenantId, table.outletId, table.status),
    index("idx_hk_tasks_room").on(table.roomId),
    index("idx_hk_tasks_status").on(table.status),
    index("idx_hk_tasks_assigned").on(table.assignedStaffId),
    index("idx_hk_tasks_created_at").on(table.createdAt),
  ]
);

export type HotelHousekeepingTask = typeof hotelHousekeepingTasks.$inferSelect;
export type NewHotelHousekeepingTask = typeof hotelHousekeepingTasks.$inferInsert;

