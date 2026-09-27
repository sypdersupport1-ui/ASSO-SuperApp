import { NextRequest } from "next/server";
import { signJwt } from "@/lib/auth/jwt";
import { apiError, apiSuccess } from "@/lib/api/response";
import { PermissionDeniedError } from "@/lib/api/errors";
import { DEMO_TENANT_ID } from "@/lib/hotel/seed";
import { env } from "@/config/env";

export const dynamic = "force-dynamic";

/**
 * DEVELOPMENT/TEST ONLY AUTHENTICATION HELPER
 * 
 * Purpose:
 * Provides a pre-configured demo staff JWT for local development, automated testing,
 * and preview UI exploration before a full identity provider (IdP) login UI is integrated.
 * 
 * Security Controls:
 * 1. Strictly disabled in production (returns 403 Forbidden).
 * 2. Hardcoded to a single demo staff identity (sub: 00000000-0000-0000-0000-000000000001).
 * 3. Never accepts request parameters/payload to mint arbitrary identities or permissions.
 * 4. isSuperAdmin is strictly false; cannot elevate privileges or bypass tenant isolation.
 * 5. Scoped strictly to DEMO_TENANT_ID; respects standard RLS and RBAC policies.
 */
export async function GET(req: NextRequest) {
  // Guard 1: Block completely in production runtime
  if (env.NODE_ENV === "production" || process.env.NODE_ENV === "production") {
    return apiError(
      new PermissionDeniedError(
        "auth.demo",
        "Demo authentication helper is disabled in production environments."
      ),
      "req_demo_token"
    );
  }

  // Guard 2: Strictly static, predetermined staff claims (no dynamic/query overrides)
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
    86400 // 24 hours in dev/test
  );

  return apiSuccess({ token }, "req_demo_token", 200);
}

