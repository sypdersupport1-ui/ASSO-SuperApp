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
import { listHotelGuests, createHotelGuest } from "./guest-service";
import { listReservations, createReservation } from "./reservation-service";
import { listStays, executeCheckIn } from "./stay-service";
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

  // 6. Ensure sample guests exist
  const existingGuests = await listHotelGuests(tenantId, { limit: 1 });
  let primaryGuestId: string | undefined;

  if (existingGuests.total === 0) {
    const guest1 = await createHotelGuest(tenantId, {
      fullName: "Dr. Vikram Sethi",
      phone: "+919876543210",
      email: "vikram.sethi@example.com",
      vipStatus: "VIP",
      nationality: "INDIAN",
      notes: "Prefers high floor quiet room with extra pillows.",
    });
    await createHotelGuest(tenantId, {
      fullName: "Meera Rajput",
      phone: "+919812345678",
      email: "meera.rajput@example.com",
      vipStatus: "STANDARD",
      nationality: "INDIAN",
    });
    await createHotelGuest(tenantId, {
      fullName: "Rohan Verma",
      phone: "+919823456789",
      email: "rohan.verma@example.com",
      vipStatus: "VVIP",
      nationality: "INDIAN",
    });
    primaryGuestId = guest1.guestId;
    logger.info({ message: "Seeded demo hotel guests", details: { count: 3 } });
  } else {
    primaryGuestId = existingGuests.guests[0].guestId;
  }

  // 7. Ensure sample reservations exist
  const existingReservations = await listReservations(tenantId, outletId, { limit: 1 });
  if (existingReservations.total === 0 && primaryGuestId && deluxeType) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const inThreeDays = new Date();
    inThreeDays.setDate(inThreeDays.getDate() + 3);

    await createReservation(tenantId, outletId, {
      guestId: primaryGuestId,
      roomTypeId: deluxeType.roomTypeId,
      arrivalDate: tomorrow,
      departureDate: inThreeDays,
      adultCount: 2,
      childrenCount: 0,
      specialRequests: "Anniversary stay. Non-smoking room preferred.",
      status: "CONFIRMED",
    });
    logger.info({ message: "Seeded demo hotel reservation" });
  }

  // 8. Ensure sample active stay exists
  const existingStays = await listStays(tenantId, { outletId, status: "ACTIVE", limit: 1 });
  if (existingStays.length === 0 && primaryGuestId && deluxeType) {
    const allRooms = await listRooms(tenantId, outletId);
    let targetRoomId = allRooms.find(
      (r) => r.roomTypeId === deluxeType!.roomTypeId && r.operationalStatus === "AVAILABLE" && !r.isOccupied
    )?.roomId;

    if (!targetRoomId) {
      const created = await createRoom(tenantId, outletId, {
        roomNumber: `10${allRooms.length + 1}`,
        floorNumber: "1",
        roomTypeId: deluxeType.roomTypeId,
        operationalStatus: "AVAILABLE",
        housekeepingStatus: "CLEAN",
      });
      targetRoomId = created.roomId;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const inTwoDays = new Date();
    inTwoDays.setDate(inTwoDays.getDate() + 2);

    const seedRes = await createReservation(tenantId, outletId, {
      guestId: primaryGuestId,
      roomTypeId: deluxeType.roomTypeId,
      assignedRoomId: targetRoomId,
      arrivalDate: yesterday,
      departureDate: inTwoDays,
      adultCount: 1,
      status: "CONFIRMED",
    });

    await executeCheckIn(tenantId, outletId, {
      reservationId: seedRes.reservationId,
      roomId: targetRoomId,
      notes: "Demo active in-house stay",
    });
    logger.info({ message: "Seeded demo hotel active stay" });
  }

  return {
    property,
    roomTypes: await listRoomTypes(tenantId, outletId),
    roomsCount: (await listRooms(tenantId, outletId)).length,
    guestsCount: (await listHotelGuests(tenantId, { limit: 100 })).total,
    reservationsCount: (await listReservations(tenantId, outletId, { limit: 100 })).total,
    staysCount: (await listStays(tenantId, { outletId, limit: 100 })).length,
  };
}
