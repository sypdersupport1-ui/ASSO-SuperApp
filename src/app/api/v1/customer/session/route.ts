import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/response";
import { validateCustomerSession } from "@/lib/customer/customer-session-service";
import { AuthenticationError } from "@/lib/api/errors";
import { getDb } from "@/db/client";
import { businessContexts } from "@/db/schema/context";
import { hotelRooms, hotelStays, hotelGuests } from "@/db/schema/hotel";
import { outlets, organizations, customers } from "@/db/schema/core";
import { eq, and, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/customer/session
 * Validates the caller's Customer Bearer token and returns the current room/stay context.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AuthenticationError("Bearer token required in Authorization header.");
    }

    const token = authHeader.substring(7);
    const { user, session } = await validateCustomerSession(token);

    const tenantId = user.tenantId!;
    const contextId = user.contextId!;
    const outletId = user.outletId!;
    const db = getDb();

    // 1. Business Context
    const [context] = await db
      .select()
      .from(businessContexts)
      .where(
        and(
          eq(businessContexts.contextId, contextId),
          eq(businessContexts.tenantId, tenantId),
          eq(businessContexts.isActive, true)
        )
      )
      .limit(1);

    // 2. Hotel Room
    const [room] = await db
      .select()
      .from(hotelRooms)
      .where(
        and(
          eq(hotelRooms.contextId, contextId),
          eq(hotelRooms.tenantId, tenantId),
          eq(hotelRooms.outletId, outletId)
        )
      )
      .limit(1);

    // 3. Property & Organization
    const [property] = await db
      .select({ name: outlets.name })
      .from(outlets)
      .where(and(eq(outlets.outletId, outletId), eq(outlets.tenantId, tenantId)))
      .limit(1);

    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.organizationId, tenantId))
      .limit(1);

    // 4. Active Stay
    let guestFirstName: string | null = null;
    let activeStayData: { checkInDate: string | null; checkOutDate: string | null } = {
      checkInDate: null,
      checkOutDate: null,
    };

    if (room) {
      const [activeStay] = await db
        .select({
          stayId: hotelStays.stayId,
          guestId: hotelStays.guestId,
          checkInAt: hotelStays.checkInAt,
          expectedCheckOutAt: hotelStays.expectedCheckOutAt,
        })
        .from(hotelStays)
        .where(
          and(
            eq(hotelStays.roomId, room.roomId),
            eq(hotelStays.tenantId, tenantId),
            eq(hotelStays.status, "ACTIVE")
          )
        )
        .orderBy(desc(hotelStays.checkInAt))
        .limit(1);

      if (activeStay) {
        const [guestRecord] = await db
          .select({ customerName: customers.fullName })
          .from(hotelGuests)
          .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
          .where(
            and(
              eq(hotelGuests.guestId, activeStay.guestId),
              eq(hotelGuests.tenantId, tenantId)
            )
          )
          .limit(1);

        if (guestRecord?.customerName) {
          guestFirstName = guestRecord.customerName.split(" ")[0];
        }

        activeStayData = {
          checkInDate: activeStay.checkInAt ? new Date(activeStay.checkInAt).toISOString() : null,
          checkOutDate: activeStay.expectedCheckOutAt ? new Date(activeStay.expectedCheckOutAt).toISOString() : null,
        };
      }
    }

    const result = {
      sessionId: session.sessionId,
      expiresAt: session.expiresAt.toISOString(),
      context: {
        contextId,
        identifier: context?.identifier || room?.roomNumber || "Unknown",
        displayLabel: context?.displayLabel || `Room ${room?.roomNumber}`,
        roomId: room?.roomId,
        roomNumber: room?.roomNumber || "Unknown",
        floor: room?.floorNumber,
        propertyName: property?.name || "Hotel Property",
        hotelName: org?.name || "ASSO Hospitality",
      },
      stay: {
        hasActiveStay: !!guestFirstName,
        guestFirstName,
        ...activeStayData,
      },
    };

    return apiSuccess(result, "req_customer_session_check", 200);
  } catch (err) {
    return apiError(err);
  }
}
