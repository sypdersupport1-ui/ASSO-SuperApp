import { getDb } from "@/db/client";
import { organizations, outlets } from "@/db/schema/core";
import { setTenantEntitlements } from "@/lib/entitlements/checker";
import {
  listHotelProperties,
  createHotelProperty,
  createRoomType,
  createRoom,
  listRoomTypes,
  listRooms,
} from "./service";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const DEMO_TENANT_ID = "11111111-1111-1111-1111-111111111111";

/**
 * Ensures demo organization and hotel property exist with proper entitlements and seed rooms
 */
export async function ensureHotelSeedData(tenantId: string = DEMO_TENANT_ID) {
  const db = getDb();

  // 1. Ensure Organization exists
  const existingOrgs = await db
    .select()
    .from(organizations)
    .where(eq(organizations.organizationId, tenantId))
    .limit(1);

  if (existingOrgs.length === 0) {
    await db.insert(organizations).values({
      organizationId: tenantId,
      name: "ASSO Hospitality Group",
      legalName: "ASSO Hospitality Group Private Limited",
      primaryBusinessType: "HOTEL",
      subscriptionStatus: "ACTIVE",
    });
    logger.info({ message: "Seeded demo organization", tenantId });
  }

  // 2. Ensure HOTEL entitlement is granted
  setTenantEntitlements(tenantId, ["CORE", "HOTEL", "POS", "ORDERING"]);

  // 3. Check for existing hotel outlet
  const properties = await listHotelProperties(tenantId);
  let property = properties[0];

  if (!property) {
    property = await createHotelProperty(tenantId, {
      name: "ASSO Grand Hotel & Residences",
      code: "AGH-BLR",
      timezone: "Asia/Kolkata",
      currency: "INR",
    });
    logger.info({ message: "Seeded demo hotel property", details: { outletId: property.outletId } });
  }

  const outletId = property.outletId;

  // 4. Ensure Room Types exist
  const roomTypes = await listRoomTypes(tenantId, outletId);
  let deluxeType = roomTypes.find((rt) => rt.code === "DELUXE");
  let execType = roomTypes.find((rt) => rt.code === "EXEC");
  let presType = roomTypes.find((rt) => rt.code === "PRES");

  if (!deluxeType) {
    deluxeType = await createRoomType(tenantId, outletId, {
      code: "DELUXE",
      name: "Deluxe King Room",
      description: "Spacious 350 sq.ft room with king bed, workspace, and city skyline view.",
      baseOccupancy: 2,
      maxOccupancy: 3,
      baseRate: "4500.00",
    });
  }

  if (!execType) {
    execType = await createRoomType(tenantId, outletId, {
      code: "EXEC",
      name: "Executive Suite",
      description: "Premium 600 sq.ft suite with private lounge, king bed, and complimentary lounge access.",
      baseOccupancy: 2,
      maxOccupancy: 4,
      baseRate: "8500.00",
    });
  }

  if (!presType) {
    presType = await createRoomType(tenantId, outletId, {
      code: "PRES",
      name: "Presidential Penthouse",
      description: "Luxury 1200 sq.ft top-floor penthouse with private balcony and jacuzzi.",
      baseOccupancy: 4,
      maxOccupancy: 6,
      baseRate: "22000.00",
    });
  }

  // 5. Ensure sample rooms exist
  const existingRooms = await listRooms(tenantId, outletId);
  if (existingRooms.length === 0) {
    const demoRooms = [
      // Floor 1 - Deluxe Rooms
      { roomNumber: "101", floorNumber: "1", roomTypeId: deluxeType.roomTypeId, op: "AVAILABLE", hk: "CLEAN" },
      { roomNumber: "102", floorNumber: "1", roomTypeId: deluxeType.roomTypeId, op: "OCCUPIED", hk: "DIRTY" },
      { roomNumber: "103", floorNumber: "1", roomTypeId: deluxeType.roomTypeId, op: "AVAILABLE", hk: "CLEANING" },
      { roomNumber: "104", floorNumber: "1", roomTypeId: deluxeType.roomTypeId, op: "RESERVED", hk: "INSPECTED" },
      // Floor 2 - Executive Suites
      { roomNumber: "201", floorNumber: "2", roomTypeId: execType.roomTypeId, op: "AVAILABLE", hk: "CLEAN" },
      { roomNumber: "202", floorNumber: "2", roomTypeId: execType.roomTypeId, op: "OCCUPIED", hk: "DIRTY" },
      { roomNumber: "203", floorNumber: "2", roomTypeId: execType.roomTypeId, op: "OUT_OF_SERVICE", hk: "MAINTENANCE" },
      // Floor 3 - Presidential Suite
      { roomNumber: "301", floorNumber: "3", roomTypeId: presType.roomTypeId, op: "AVAILABLE", hk: "INSPECTED" },
    ] as const;

    for (const r of demoRooms) {
      await createRoom(tenantId, outletId, {
        roomNumber: r.roomNumber,
        floorNumber: r.floorNumber,
        roomTypeId: r.roomTypeId,
        operationalStatus: r.op as any,
        housekeepingStatus: r.hk as any,
      });
    }
    logger.info({ message: "Seeded demo hotel rooms", details: { count: demoRooms.length } });
  }

  return {
    property,
    roomTypes: await listRoomTypes(tenantId, outletId),
    roomsCount: (await listRooms(tenantId, outletId)).length,
  };
}
