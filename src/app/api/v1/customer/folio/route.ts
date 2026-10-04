import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { AuthenticationError, NotFoundError } from "@/lib/api/errors";
import { getDb } from "@/db/client";
import { hotelRooms, hotelStays } from "@/db/schema/hotel";
import { eq, and, desc } from "drizzle-orm";
import { getFolioDetailByStayId } from "@/lib/hotel/folio-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/customer/folio
 * Securely retrieves the active stay's folio and itemized bill for the authenticated customer session.
 * 
 * Invariants:
 * 1. Strictly requires a valid CUSTOMER session token.
 * 2. Room and active stay are derived server-authoritatively from the session's contextId.
 * 3. Zero chance of IDOR or cross-stay leakage: customer cannot supply arbitrary stay IDs.
 * 4. Internal staff audit identifiers are omitted from the guest presentation.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = extractRequestContext(req, {
      requireAuth: true,
    });

    if (!ctx.user || ctx.user.sessionType !== "CUSTOMER") {
      throw new AuthenticationError("Customer session token required.");
    }

    const tenantId = ctx.tenantId!;
    const contextId = ctx.user.contextId;
    const outletId = ctx.user.outletId;

    if (!contextId || !outletId) {
      throw new AuthenticationError("Customer session lacks room context boundaries.");
    }

    const db = getDb();

    // 1. Locate hotel room from contextId
    const [room] = await db
      .select({
        roomId: hotelRooms.roomId,
        roomNumber: hotelRooms.roomNumber,
      })
      .from(hotelRooms)
      .where(
        and(
          eq(hotelRooms.contextId, contextId),
          eq(hotelRooms.tenantId, tenantId),
          eq(hotelRooms.outletId, outletId)
        )
      )
      .limit(1);

    if (!room) {
      throw new NotFoundError("Hotel Room", "No hotel room is associated with this session context.");
    }

    // 2. Locate active stay for this room
    const [activeStay] = await db
      .select({
        stayId: hotelStays.stayId,
        stayNumber: hotelStays.stayNumber,
        guestId: hotelStays.guestId,
        status: hotelStays.status,
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

    if (!activeStay) {
      return apiSuccess(
        {
          hasActiveStay: false,
          roomNumber: room.roomNumber,
          folio: null,
        },
        ctx.requestId,
        200
      );
    }

    // 3. Fetch server-authoritative folio detail
    const folioDetail = await getFolioDetailByStayId(
      tenantId,
      outletId,
      activeStay.stayId
    );

    // 4. Map into privacy-safe, customer-friendly DTO
    const customerFolio = {
      hasActiveStay: true,
      stayId: activeStay.stayId,
      stayNumber: activeStay.stayNumber,
      roomNumber: room.roomNumber,
      guestName: folioDetail.stay?.guestName || "Valued Guest",
      checkInAt: activeStay.checkInAt ? new Date(activeStay.checkInAt).toISOString() : null,
      expectedCheckOutAt: activeStay.expectedCheckOutAt
        ? new Date(activeStay.expectedCheckOutAt).toISOString()
        : null,
      folio: {
        folioNumber: folioDetail.folioNumber,
        status: folioDetail.status === "OPEN" ? "Active" : "Closed",
        totalCharges: folioDetail.totalCharges,
        totalPayments: folioDetail.totalPayments,
        balanceDue: folioDetail.balanceDue,
        entries: folioDetail.entries.map((e) => ({
          entryId: e.entryId,
          entryType: e.entryType,
          direction: e.direction,
          amount: e.amount,
          description: e.description,
          createdAt: new Date(e.createdAt).toISOString(),
        })),
      },
    };

    return apiSuccess(customerFolio, ctx.requestId, 200);
  } catch (error) {
    return apiError(error, req.headers.get("x-request-id") || "req_customer_folio");
  }
}
