import { NextRequest } from "next/server";
import { extractRequestContext } from "@/lib/api/context";
import { apiSuccess, apiError } from "@/lib/api/response";
import { listHotelCatalog } from "@/lib/hotel/room-service-service";
import { AuthenticationError } from "@/lib/api/errors";
import { resolveCustomerQr } from "@/lib/customer/customer-session-service";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const searchParams = req.nextUrl.searchParams;
    const qrToken = searchParams.get("token");

    let tenantId: string | null = null;
    let outletId: string | null = null;
    let requestId = "req_menu";

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const ctx = extractRequestContext(req, { requireAuth: true });
      tenantId = ctx.tenantId || null;
      outletId = ctx.outletId || null;
      requestId = ctx.requestId;
    } else if (qrToken) {
      const resolved = await resolveCustomerQr(qrToken);
      const ctx = extractRequestContext(
        new NextRequest(req.url, {
          headers: { Authorization: `Bearer ${resolved.sessionToken}` },
        }),
        { requireAuth: true }
      );
      tenantId = ctx.tenantId || null;
      outletId = ctx.outletId || null;
      requestId = ctx.requestId;
    }

    if (!tenantId || !outletId) {
      throw new AuthenticationError("Customer session token or valid QR token required to view menu.");
    }

    const menu = await listHotelCatalog(tenantId, outletId, false);
    return apiSuccess(menu, requestId, 200);
  } catch (error) {
    return apiError(error);
  }
}
