import { eq, and, sql, desc, or, ilike, lte, gte } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  hotelReservations,
  hotelStays,
  hotelRooms,
  hotelRoomTypes,
  hotelGuests,
} from "@/db/schema/hotel";
import { customers } from "@/db/schema/core";
import { listRooms } from "./service";

export interface FrontOfficeKPIs {
  todayArrivalsCount: number;
  todayDeparturesCount: number;
  activeStaysCount: number;
  totalRoomsCount: number;
  availableCleanRoomsCount: number;
  availableDirtyRoomsCount: number;
  occupiedRoomsCount: number;
  outOfServiceRoomsCount: number;
  occupancyRatePct: number;
  attentionItemsCount: number;
}

export interface FrontOfficeArrival {
  reservationId: string;
  reservationNumber: string;
  guestId: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  vipStatus: string;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeCode: string;
  assignedRoomId: string | null;
  assignedRoomNumber: string | null;
  assignedRoomOperationalStatus: string | null;
  assignedRoomHousekeepingStatus: string | null;
  arrivalDate: Date;
  departureDate: Date;
  adultCount: number;
  childrenCount: number;
  specialRequests: string | null;
  status: string;
}

export interface FrontOfficeDeparture {
  stayId: string;
  stayNumber: string;
  reservationId: string;
  reservationNumber: string;
  guestId: string;
  guestName: string;
  guestPhone: string | null;
  vipStatus: string;
  roomId: string;
  roomNumber: string;
  roomTypeName: string;
  checkInAt: Date;
  expectedCheckOutAt: Date;
  status: string;
  isOverdue: boolean;
}

export interface FrontOfficeInHouseStay {
  stayId: string;
  stayNumber: string;
  reservationId: string;
  reservationNumber: string;
  guestId: string;
  guestName: string;
  guestPhone: string | null;
  vipStatus: string;
  roomId: string;
  roomNumber: string;
  floorNumber: string | null;
  roomTypeName: string;
  checkInAt: Date;
  expectedCheckOutAt: Date;
  adultCount: number;
  childrenCount: number;
  notes: string | null;
}

export interface FrontOfficeAttentionItem {
  id: string;
  type: "UNASSIGNED_ARRIVAL" | "ROOM_NOT_READY" | "DEPARTURE_OVERDUE" | "DIRTY_VACANT" | "OUT_OF_ORDER_ROOM";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  targetId: string;
  actionLabel: string;
  actionHref?: string;
}

export interface FrontOfficeSummary {
  kpis: FrontOfficeKPIs;
  arrivals: FrontOfficeArrival[];
  departures: FrontOfficeDeparture[];
  inHouse: FrontOfficeInHouseStay[];
  attentionItems: FrontOfficeAttentionItem[];
  roomReadiness: {
    cleanAvailable: number;
    dirtyAvailable: number;
    occupied: number;
    outOfService: number;
    cleaning: number;
    inspected: number;
  };
}

/**
 * Aggregates all Front Office operational data for an outlet/property in a single,
 * efficient set of queries with zero N+1 latency.
 */
export async function getFrontOfficeSummary(
  tenantId: string,
  outletId: string,
  search?: string
): Promise<FrontOfficeSummary> {
  const db = getDb();
  const now = new Date();

  // Define today boundaries
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // 1. Fetch Rooms for this property to compute live availability and readiness
  const allRooms = await listRooms(tenantId, outletId);
  const totalRooms = allRooms.length;

  let cleanAvailable = 0;
  let dirtyAvailable = 0;
  let occupiedRooms = 0;
  let outOfServiceRooms = 0;
  let cleaningRooms = 0;
  let inspectedRooms = 0;

  for (const r of allRooms) {
    if (r.operationalStatus === "OCCUPIED" || r.isOccupied) {
      occupiedRooms++;
    } else if (r.operationalStatus === "OUT_OF_SERVICE" || r.operationalStatus === "OUT_OF_ORDER") {
      outOfServiceRooms++;
    } else if (r.operationalStatus === "AVAILABLE") {
      if (r.housekeepingStatus === "CLEAN") {
        cleanAvailable++;
      } else if (r.housekeepingStatus === "INSPECTED") {
        inspectedRooms++;
        cleanAvailable++; // Inspected rooms are clean and available
      } else if (r.housekeepingStatus === "DIRTY") {
        dirtyAvailable++;
      } else if (r.housekeepingStatus === "CLEANING") {
        cleaningRooms++;
      }
    }
  }

  // 2. Fetch Today's Arrivals
  // Confirmed reservations with arrivalDate <= todayEnd
  const arrivalsRaw = await db
    .select({
      reservationId: hotelReservations.reservationId,
      reservationNumber: hotelReservations.reservationNumber,
      guestId: hotelReservations.guestId,
      guestName: customers.fullName,
      guestPhone: customers.phone,
      guestEmail: customers.email,
      vipStatus: hotelGuests.vipStatus,
      roomTypeId: hotelReservations.roomTypeId,
      roomTypeName: hotelRoomTypes.name,
      roomTypeCode: hotelRoomTypes.code,
      assignedRoomId: hotelReservations.assignedRoomId,
      assignedRoomNumber: hotelRooms.roomNumber,
      assignedRoomOperationalStatus: hotelRooms.operationalStatus,
      assignedRoomHousekeepingStatus: hotelRooms.housekeepingStatus,
      arrivalDate: hotelReservations.arrivalDate,
      departureDate: hotelReservations.departureDate,
      adultCount: hotelReservations.adultCount,
      childrenCount: hotelReservations.childrenCount,
      specialRequests: hotelReservations.specialRequests,
      status: hotelReservations.status,
    })
    .from(hotelReservations)
    .innerJoin(hotelGuests, eq(hotelReservations.guestId, hotelGuests.guestId))
    .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
    .innerJoin(hotelRoomTypes, eq(hotelReservations.roomTypeId, hotelRoomTypes.roomTypeId))
    .leftJoin(hotelRooms, eq(hotelReservations.assignedRoomId, hotelRooms.roomId))
    .where(
      and(
        eq(hotelReservations.tenantId, tenantId),
        eq(hotelReservations.outletId, outletId),
        eq(hotelReservations.status, "CONFIRMED"),
        lte(hotelReservations.arrivalDate, todayEnd)
      )
    )
    .orderBy(hotelReservations.arrivalDate);

  const arrivals: FrontOfficeArrival[] = arrivalsRaw.map((r) => ({
    ...r,
    guestPhone: r.guestPhone,
    guestEmail: r.guestEmail,
    vipStatus: r.vipStatus || "STANDARD",
  }));

  // 3. Fetch In-House Active Stays (with optional search filter)
  let inHouseConditions = and(
    eq(hotelStays.tenantId, tenantId),
    eq(hotelStays.outletId, outletId),
    eq(hotelStays.status, "ACTIVE")
  );

  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`;
    inHouseConditions = and(
      inHouseConditions,
      or(
        ilike(customers.fullName, term),
        ilike(hotelRooms.roomNumber, term),
        ilike(hotelStays.stayNumber, term),
        ilike(hotelReservations.reservationNumber, term)
      )
    );
  }

  const inHouseRaw = await db
    .select({
      stayId: hotelStays.stayId,
      stayNumber: hotelStays.stayNumber,
      reservationId: hotelStays.reservationId,
      reservationNumber: hotelReservations.reservationNumber,
      guestId: hotelStays.guestId,
      guestName: customers.fullName,
      guestPhone: customers.phone,
      vipStatus: hotelGuests.vipStatus,
      roomId: hotelStays.roomId,
      roomNumber: hotelRooms.roomNumber,
      floorNumber: hotelRooms.floorNumber,
      roomTypeName: hotelRoomTypes.name,
      checkInAt: hotelStays.checkInAt,
      expectedCheckOutAt: hotelStays.expectedCheckOutAt,
      adultCount: hotelStays.adultCount,
      childrenCount: hotelStays.childrenCount,
      notes: hotelStays.notes,
    })
    .from(hotelStays)
    .innerJoin(hotelReservations, eq(hotelStays.reservationId, hotelReservations.reservationId))
    .innerJoin(hotelGuests, eq(hotelStays.guestId, hotelGuests.guestId))
    .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
    .innerJoin(hotelRooms, eq(hotelStays.roomId, hotelRooms.roomId))
    .innerJoin(hotelRoomTypes, eq(hotelRooms.roomTypeId, hotelRoomTypes.roomTypeId))
    .where(inHouseConditions)
    .orderBy(desc(hotelStays.checkInAt));

  const inHouse: FrontOfficeInHouseStay[] = inHouseRaw.map((r) => ({
    ...r,
    guestPhone: r.guestPhone,
    vipStatus: r.vipStatus || "STANDARD",
  }));

  // 4. Fetch Today's Departures
  // Active stays where expectedCheckOutAt <= todayEnd
  const departuresRaw = await db
    .select({
      stayId: hotelStays.stayId,
      stayNumber: hotelStays.stayNumber,
      reservationId: hotelStays.reservationId,
      reservationNumber: hotelReservations.reservationNumber,
      guestId: hotelStays.guestId,
      guestName: customers.fullName,
      guestPhone: customers.phone,
      vipStatus: hotelGuests.vipStatus,
      roomId: hotelStays.roomId,
      roomNumber: hotelRooms.roomNumber,
      roomTypeName: hotelRoomTypes.name,
      checkInAt: hotelStays.checkInAt,
      expectedCheckOutAt: hotelStays.expectedCheckOutAt,
      status: hotelStays.status,
    })
    .from(hotelStays)
    .innerJoin(hotelReservations, eq(hotelStays.reservationId, hotelReservations.reservationId))
    .innerJoin(hotelGuests, eq(hotelStays.guestId, hotelGuests.guestId))
    .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
    .innerJoin(hotelRooms, eq(hotelStays.roomId, hotelRooms.roomId))
    .innerJoin(hotelRoomTypes, eq(hotelRooms.roomTypeId, hotelRoomTypes.roomTypeId))
    .where(
      and(
        eq(hotelStays.tenantId, tenantId),
        eq(hotelStays.outletId, outletId),
        eq(hotelStays.status, "ACTIVE"),
        lte(hotelStays.expectedCheckOutAt, todayEnd)
      )
    )
    .orderBy(hotelStays.expectedCheckOutAt);

  const departures: FrontOfficeDeparture[] = departuresRaw.map((d) => ({
    ...d,
    guestPhone: d.guestPhone,
    vipStatus: d.vipStatus || "STANDARD",
    isOverdue: new Date(d.expectedCheckOutAt) < now,
  }));

  // 5. Generate Attention Items (Operational Exceptions derived strictly from live state)
  const attentionItems: FrontOfficeAttentionItem[] = [];

  // Attention A: Arrivals without an assigned physical room
  for (const arr of arrivals) {
    if (!arr.assignedRoomId) {
      attentionItems.push({
        id: `att-unassigned-${arr.reservationId}`,
        type: "UNASSIGNED_ARRIVAL",
        severity: "warning",
        title: `Unassigned Room for ${arr.guestName}`,
        description: `Arrival ${arr.reservationNumber} (${arr.roomTypeName}) requires a room allocation before check-in.`,
        targetId: arr.reservationId,
        actionLabel: "Assign Room",
        actionHref: `/hotel/reservations`,
      });
    } else {
      // Attention B: Assigned room is not clean and ready
      const assignedRoom = allRooms.find((r) => r.roomId === arr.assignedRoomId);
      if (assignedRoom) {
        if (assignedRoom.operationalStatus === "OCCUPIED") {
          attentionItems.push({
            id: `att-occupied-${arr.reservationId}`,
            type: "ROOM_NOT_READY",
            severity: "critical",
            title: `Assigned Room ${assignedRoom.roomNumber} Still Occupied`,
            description: `Room ${assignedRoom.roomNumber} for ${arr.guestName} is occupied by an active stay. Departure or reassignment required.`,
            targetId: arr.reservationId,
            actionLabel: "Reassign Room",
            actionHref: `/hotel/reservations`,
          });
        } else if (assignedRoom.operationalStatus === "OUT_OF_ORDER" || assignedRoom.operationalStatus === "OUT_OF_SERVICE") {
          attentionItems.push({
            id: `att-maintenance-${arr.reservationId}`,
            type: "ROOM_NOT_READY",
            severity: "critical",
            title: `Assigned Room ${assignedRoom.roomNumber} ${assignedRoom.operationalStatus.replace(/_/g, " ")}`,
            description: `Room ${assignedRoom.roomNumber} for ${arr.guestName} is currently ${assignedRoom.operationalStatus.replace(/_/g, " ")}. Maintenance intervention or reassignment required.`,
            targetId: arr.reservationId,
            actionLabel: "Reassign Room",
            actionHref: `/hotel/reservations`,
          });
        } else if (assignedRoom.housekeepingStatus === "DIRTY" || assignedRoom.housekeepingStatus === "CLEANING" || assignedRoom.housekeepingStatus === "MAINTENANCE") {
          attentionItems.push({
            id: `att-dirty-${arr.reservationId}`,
            type: "ROOM_NOT_READY",
            severity: "warning",
            title: `Room ${assignedRoom.roomNumber} Not Ready (${assignedRoom.housekeepingStatus})`,
            description: `Assigned room ${assignedRoom.roomNumber} is currently ${assignedRoom.housekeepingStatus}. Needs priority attention before arrival.`,
            targetId: assignedRoom.roomId,
            actionLabel: "View Room",
            actionHref: `/hotel/rooms`,
          });
        }
      }
    }
  }

  // Attention C: Departures past scheduled checkout time
  for (const dep of departures) {
    if (dep.isOverdue) {
      attentionItems.push({
        id: `att-overdue-${dep.stayId}`,
        type: "DEPARTURE_OVERDUE",
        severity: "critical",
        title: `Departure Overdue: Room ${dep.roomNumber}`,
        description: `Stay ${dep.stayNumber} (${dep.guestName}) was expected to depart at ${new Date(dep.expectedCheckOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
        targetId: dep.stayId,
        actionLabel: "Check Out",
        actionHref: `/hotel/stays`,
      });
    }
  }

  // Attention D: Available rooms that are dirty
  if (dirtyAvailable > 0) {
    attentionItems.push({
      id: "att-dirty-vacant-rooms",
      type: "DIRTY_VACANT",
      severity: "info",
      title: `${dirtyAvailable} Vacant Room${dirtyAvailable > 1 ? "s" : ""} Dirty`,
      description: `${dirtyAvailable} vacant rooms are ready to clean to release more guest inventory.`,
      targetId: "rooms-dirty",
      actionLabel: "View Rack",
      actionHref: "/hotel/rooms",
    });
  }

  // Attention E: Out of Order / Out of Service rooms
  if (outOfServiceRooms > 0) {
    attentionItems.push({
      id: "att-out-of-order-rooms",
      type: "OUT_OF_ORDER_ROOM",
      severity: "critical",
      title: `${outOfServiceRooms} Room${outOfServiceRooms > 1 ? "s" : ""} Out of Service / Order`,
      description: `${outOfServiceRooms} room${outOfServiceRooms > 1 ? "s are" : " is"} currently unavailable due to maintenance or service restrictions.`,
      targetId: "rooms-maintenance",
      actionLabel: "View Maintenance",
      actionHref: `/hotel/maintenance`,
    });
  }

  // 6. Calculate KPIs
  const occupancyRatePct = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  return {
    kpis: {
      todayArrivalsCount: arrivals.length,
      todayDeparturesCount: departures.length,
      activeStaysCount: inHouse.length,
      totalRoomsCount: totalRooms,
      availableCleanRoomsCount: cleanAvailable,
      availableDirtyRoomsCount: dirtyAvailable,
      occupiedRoomsCount: occupiedRooms,
      outOfServiceRoomsCount: outOfServiceRooms,
      occupancyRatePct,
      attentionItemsCount: attentionItems.length,
    },
    arrivals,
    departures,
    inHouse,
    attentionItems,
    roomReadiness: {
      cleanAvailable,
      dirtyAvailable,
      occupied: occupiedRooms,
      outOfService: outOfServiceRooms,
      cleaning: cleaningRooms,
      inspected: inspectedRooms,
    },
  };
}
