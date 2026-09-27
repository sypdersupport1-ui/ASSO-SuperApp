import { NextRequest } from "next/server";
import { signJwt } from "@/lib/auth/jwt";
import { apiSuccess } from "@/lib/api/response";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Generate development staff demo token for localhost and preview staff UI
  const token = signJwt(
    {
      sub: "00000000-0000-0000-0000-000000000001",
      email: "hotel.admin@assohospitality.com",
      tenantId: DEMO_TENANT_ID,
      roles: ["HOTEL_ADMIN"],
      permissions: [
        "hotel.*",
        "hotel.read",
        "hotel.manage",
        "hotel.rooms.manage",
        "hotel.reservations.read",
        "hotel.reservations.manage",
        "hotel.stays.read",
        "hotel.stays.manage",
        "hotel.housekeeping.read",
        "hotel.housekeeping.manage",
        "hotel.housekeeping.clean",
        "hotel.housekeeping.inspect",
        "hotel.maintenance.read",
        "hotel.maintenance.manage",
        "hotel.maintenance.assign",
        "service.read",
        "service.create",
        "service.update",
      ],
      sessionType: "STAFF",
      isSuperAdmin: false,
    },
    86400 // 24 hours
  );

  return apiSuccess({ token }, "req_demo_token", 200);
}
