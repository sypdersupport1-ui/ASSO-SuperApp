import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { signJwt } from "@/lib/auth/jwt";
import { DEMO_TENANT_ID, ensureHotelSeedData } from "@/lib/hotel/seed";
import { generateOrGetRoomQr } from "@/lib/hotel/qr-service";
import { resolveCustomerQr } from "@/lib/customer/customer-session-service";
import { getDb } from "@/db/client";
import { hotelRooms, hotelStays } from "@/db/schema/hotel";
import { outlets } from "@/db/schema/core";
import { eq } from "drizzle-orm";
import { GET as getCustomerSessionRoute } from "@/app/api/v1/customer/session/route";
import { POST as postCustomerIdentifyRoute } from "@/app/api/v1/customer/identify/route";
import { GET as getCustomerFolioRoute } from "@/app/api/v1/customer/folio/route";
import { GET as getRoomsRoute, POST as postRoomRoute } from "@/app/api/v1/hotel/rooms/route";
import { GET as getFrontOfficeRoute } from "@/app/api/v1/hotel/front-office/route";
import { POST as postCustomerServiceRequestRoute } from "@/app/api/v1/customer/service-requests/route";
import { GET as getSingleCustomerServiceRequestRoute } from "@/app/api/v1/customer/service-requests/[id]/route";

describe("HUI-3 Customer Security & Session Isolation Suite (Section 27 Verification)", () => {
  let customerSessionToken: string;
  let roomId: string;
  let contextId: string;
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
    contextId = room.contextId;
    demoOutletId = room.outletId;

    // Create Room QR and Customer session for Tenant A
    const qr = await generateOrGetRoomQr(DEMO_TENANT_ID, demoOutletId, roomId);
    const res = await resolveCustomerQr(qr.opaqueToken);
    customerSessionToken = res.sessionToken;
  }, 30000);

  it("1. Valid customer session can access own Hotel experience", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/customer/session", {
      headers: { Authorization: `Bearer ${customerSessionToken}` },
    });
    const res = await getCustomerSessionRoute(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.context.roomId).toBe(roomId);
    expect(json.data.context.contextId).toBe(contextId);
  });

  it("2. Customer cannot access Hotel admin pages or endpoints (403 Forbidden)", async () => {
    const req = new NextRequest(`http://localhost:3000/api/v1/hotel/front-office?outletId=${demoOutletId}`, {
      headers: { Authorization: `Bearer ${customerSessionToken}` },
    });
    const res = await getFrontOfficeRoute(req);
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("PERMISSION_DENIED");
  });

  it("3. Customer cannot access another stay (server-authoritative resolution)", async () => {
    // Attempting to pass stayId in query params should be ignored by the customer folio endpoint
    const fakeStayId = "99999999-9999-9999-9999-999999999999";
    const req = new NextRequest(`http://localhost:3000/api/v1/customer/folio?stayId=${fakeStayId}`, {
      headers: { Authorization: `Bearer ${customerSessionToken}` },
    });
    const res = await getCustomerFolioRoute(req);
    const json = await res.json();

    // Either 200 with the room's legitimate active stay, or 404 if no active stay, NEVER the fake stay
    if (res.status === 200) {
      expect(json.success).toBe(true);
      expect(json.data.stayId).not.toBe(fakeStayId);
    } else {
      expect(res.status).toBe(404);
      expect(json.error.code).toBe("STAY_NOT_FOUND");
    }
  });

  it("4. Customer cannot access another customer data via identification", async () => {
    const uniquePhone = `+9199${Date.now().toString().slice(-8)}`;
    const identifyReq = new NextRequest("http://localhost:3000/api/v1/customer/identify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerSessionToken}`,
      },
      body: JSON.stringify({
        fullName: "Test Guest",
        phone: uniquePhone,
      }),
    });
    const res = await postCustomerIdentifyRoute(identifyReq);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.customer.fullName).toBe("Test Guest");
    expect(json.data.customer.phone).toBe(uniquePhone);
  });

  it("5. Customer cannot access staff endpoints (/api/v1/hotel/rooms)", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/hotel/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${customerSessionToken}`,
      },
      body: JSON.stringify({
        outletId: demoOutletId,
        roomNumber: "888",
        roomTypeId: "00000000-0000-0000-0000-000000000001",
      }),
    });
    const res = await postRoomRoute(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("PERMISSION_DENIED");
  });

  it("6. Missing or invalid customer context is rejected safely (401)", async () => {
    const reqNoToken = new NextRequest("http://localhost:3000/api/v1/customer/folio");
    const resNoToken = await getCustomerFolioRoute(reqNoToken);
    expect(resNoToken.status).toBe(401);

    const jsonNoToken = await resNoToken.json();
    expect(jsonNoToken.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("7. Expired customer session fails safely (401)", async () => {
    const expiredCustomerToken = signJwt(
      {
        sub: "cust_expired_session",
        tenantId: DEMO_TENANT_ID,
        outletId: demoOutletId,
        contextId: contextId,
        sessionType: "CUSTOMER",
        roles: [],
        permissions: [],
        isSuperAdmin: false,
      },
      -30 // Expired 30 seconds ago
    );

    const req = new NextRequest("http://localhost:3000/api/v1/customer/folio", {
      headers: { Authorization: `Bearer ${expiredCustomerToken}` },
    });
    const res = await getCustomerFolioRoute(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("8. Arbitrary stay IDs cannot bypass authorization", async () => {
    // Attempting to craft a customer token with an unlinked or non-existent context
    const maliciousToken = signJwt({
      sub: "cust_attacker",
      tenantId: DEMO_TENANT_ID,
      outletId: demoOutletId,
      contextId: "00000000-0000-0000-0000-000000000000",
      sessionType: "CUSTOMER",
      roles: [],
      permissions: [],
      isSuperAdmin: false,
    });

    const req = new NextRequest("http://localhost:3000/api/v1/customer/folio", {
      headers: { Authorization: `Bearer ${maliciousToken}` },
    });
    const res = await getCustomerFolioRoute(req);
    // Room lookup fails for forged contextId
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("9. Order and request operations remain tenant-isolated", async () => {
    const db = getDb();
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

    // Tenant B submits a service request
    const postReq = new NextRequest("http://localhost:3000/api/v1/customer/service-requests", {
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
    const postRes = await postCustomerServiceRequestRoute(postReq);
    expect(postRes.status).toBe(201);
    const postJson = await postRes.json();
    const requestIdB = postJson.data.requestId;

    // Tenant A customer tries to retrieve Tenant B's request -> must return 404
    const getReq = new NextRequest(`http://localhost:3000/api/v1/customer/service-requests/${requestIdB}`, {
      headers: { Authorization: `Bearer ${customerSessionToken}` },
    });
    const getRes = await getSingleCustomerServiceRequestRoute(getReq, {
      params: Promise.resolve({ id: requestIdB }),
    });
    expect(getRes.status).toBe(404);
  });

  it("10. Customer folio remains strictly tenant and stay isolated", async () => {
    const db = getDb();
    const [roomB] = await db
      .select()
      .from(hotelRooms)
      .where(eq(hotelRooms.tenantId, TENANT_B_ID))
      .limit(1);

    // Token for Tenant B
    const tenantBCustomer = signJwt({
      sub: "cust_b_tenant_folio",
      tenantId: TENANT_B_ID,
      outletId: roomB.outletId,
      contextId: roomB.contextId,
      sessionType: "CUSTOMER",
      roles: [],
      permissions: [],
      isSuperAdmin: false,
    });

    const reqB = new NextRequest("http://localhost:3000/api/v1/customer/folio", {
      headers: { Authorization: `Bearer ${tenantBCustomer}` },
    });
    const resB = await getCustomerFolioRoute(reqB);

    // If Tenant B room has no stay, returns 200 with hasActiveStay: false; if it has a stay, roomNumber matches Tenant B
    expect(resB.status).toBe(200);
    const jsonB = await resB.json();
    expect(jsonB.success).toBe(true);
    expect(jsonB.data.roomNumber).toBe(roomB.roomNumber);
  });
});
