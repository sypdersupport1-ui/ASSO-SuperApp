import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { signJwt, verifyJwt } from "@/lib/auth/jwt";
import { DEMO_TENANT_ID, ensureHotelSeedData } from "@/lib/hotel/seed";
import { generateOrGetRoomQr } from "@/lib/hotel/qr-service";
import { resolveCustomerQr } from "@/lib/customer/customer-session-service";
import { getDb } from "@/db/client";
import { hotelRooms } from "@/db/schema/hotel";
import { outlets } from "@/db/schema/core";
import { eq } from "drizzle-orm";
import { GET as getRoomsRoute, POST as postRoomRoute } from "@/app/api/v1/hotel/rooms/route";
import { GET as getFrontOfficeRoute } from "@/app/api/v1/hotel/front-office/route";
import { POST as postRotateQrRoute } from "@/app/api/v1/hotel/rooms/[id]/qr/rotate/route";
import { POST as postCustomerServiceRequestRoute } from "@/app/api/v1/customer/service-requests/route";
import { GET as getSingleCustomerServiceRequestRoute } from "@/app/api/v1/customer/service-requests/[id]/route";

describe("Phase 7 Hotel Vertical — Slice 7 Customer Session & QR Security Suite", () => {
  let customerSessionToken: string;
  let roomId: string;
  let demoOutletId: string;
  const TENANT_B_ID = "22222222-2222-2222-2222-222222222222";

  beforeAll(async () => {
    await ensureHotelSeedData(DEMO_TENANT_ID);
    await ensureHotelSeedData(TENANT_B_ID);

    const db = getDb();
    const [room] = await db
      .select()
      .from(hotelRooms)
      .where(eq(hotelRooms.tenantId, DEMO_TENANT_ID))
      .limit(1);

    roomId = room.roomId;
    demoOutletId = room.outletId;

    // Create Room QR and Customer session for Tenant A
    const qr = await generateOrGetRoomQr(DEMO_TENANT_ID, demoOutletId, roomId);
    const res = await resolveCustomerQr(qr.opaqueToken);
    customerSessionToken = res.sessionToken;
  }, 30000);

  describe("1. Privilege Separation: Strict Denial of Staff Operations", () => {
    it("denies customer session access to Front Office operations (403 Forbidden)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/front-office?outletId=${demoOutletId}`, {
        headers: { Authorization: `Bearer ${customerSessionToken}` },
      });
      const res = await getFrontOfficeRoute(req);
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("PERMISSION_DENIED");
    });

    it("denies customer session access to Room creation/mutation (403 Forbidden)", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/hotel/rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerSessionToken}`,
        },
        body: JSON.stringify({
          outletId: demoOutletId,
          roomNumber: "999",
          roomTypeId: "00000000-0000-0000-0000-000000000001",
        }),
      });
      const res = await postRoomRoute(req);
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("PERMISSION_DENIED");
    });

    it("denies customer session access to staff QR rotation API (403 Forbidden)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/rooms/${roomId}/qr/rotate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerSessionToken}`,
        },
        body: JSON.stringify({ outletId: demoOutletId }),
      });
      const res = await postRotateQrRoute(req, { params: Promise.resolve({ id: roomId }) });
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("PERMISSION_DENIED");
    });
  });

  describe("2. Cross-Tenant Boundary Enforcement", () => {
    it("prevents Tenant A customer session from submitting requests to Tenant B", async () => {
      const db = getDb();
      const [outletB] = await db
        .select()
        .from(outlets)
        .where(eq(outlets.tenantId, TENANT_B_ID))
        .limit(1);

      const [roomB] = await db
        .select()
        .from(hotelRooms)
        .where(eq(hotelRooms.tenantId, TENANT_B_ID))
        .limit(1);

      // Create customer token for Tenant B
      const tenantBCustomer = signJwt({
        sub: "cust_b_isolated",
        tenantId: TENANT_B_ID,
        outletId: roomB.outletId,
        contextId: roomB.contextId,
        sessionType: "CUSTOMER",
        roles: [],
        permissions: [],
        isSuperAdmin: false,
      });

      const req = new NextRequest("http://localhost:3000/api/v1/customer/service-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tenantBCustomer}`,
        },
        body: JSON.stringify({
          requestType: "HOUSEKEEPING",
          title: "Tenant B Request",
          description: "Isolated to Tenant B",
          priority: "NORMAL",
        }),
      });

      const res = await postCustomerServiceRequestRoute(req);
      expect(res.status).toBe(201); // Created strictly scoped to Tenant B
      const json = await res.json();
      expect(json.data.roomNumber).toBe(roomB.roomNumber);

      // Now verify Tenant A customer cannot access this Tenant B service request (returns 404)
      const reqGetTenantA = new NextRequest(`http://localhost:3000/api/v1/customer/service-requests/${json.data.requestId}`, {
        headers: { Authorization: `Bearer ${customerSessionToken}` },
      });
      const resGetTenantA = await getSingleCustomerServiceRequestRoute(reqGetTenantA, {
        params: Promise.resolve({ id: json.data.requestId }),
      });
      expect(resGetTenantA.status).toBe(404);
    });
  });

  describe("3. Expired Session & Tampering Protection", () => {
    it("rejects expired customer session token (401)", async () => {
      const expiredCustomerToken = signJwt(
        {
          sub: "cust_expired",
          tenantId: DEMO_TENANT_ID,
          outletId: demoOutletId,
          contextId: "11111111-1111-1111-1111-000000000101",
          sessionType: "CUSTOMER",
          roles: [],
          permissions: [],
          isSuperAdmin: false,
        },
        -10 // Expired 10 seconds ago
      );

      const req = new NextRequest("http://localhost:3000/api/v1/customer/service-requests", {
        headers: { Authorization: `Bearer ${expiredCustomerToken}` },
      });
      const res = await postCustomerServiceRequestRoute(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("AUTHENTICATION_REQUIRED");
    });

    it("rejects tampered customer JWT signature (401)", async () => {
      const tamperedToken = customerSessionToken.slice(0, -6) + "abcdef";

      const req = new NextRequest("http://localhost:3000/api/v1/customer/service-requests", {
        headers: { Authorization: `Bearer ${tamperedToken}` },
      });
      const res = await postCustomerServiceRequestRoute(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("AUTHENTICATION_REQUIRED");
    });
  });
});
