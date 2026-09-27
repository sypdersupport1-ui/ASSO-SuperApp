import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { signJwt, verifyJwt } from "@/lib/auth/jwt";
import { DEMO_TENANT_ID, ensureHotelSeedData } from "@/lib/hotel/seed";
import { generateOrGetRoomQr, rotateRoomQr, revokeRoomQr, getRoomActiveQr } from "@/lib/hotel/qr-service";
import { resolveCustomerQr, validateCustomerSession } from "@/lib/customer/customer-session-service";
import { createCustomerServiceRequest, listCustomerServiceRequests, getCustomerServiceRequestById } from "@/lib/customer/customer-service-request-service";
import { getDb } from "@/db/client";
import { hotelRooms } from "@/db/schema/hotel";
import { outlets } from "@/db/schema/core";
import { eq, and } from "drizzle-orm";
import { GET as getRoomQrRoute } from "@/app/api/v1/hotel/rooms/[id]/qr/route";
import { POST as rotateRoomQrRoute } from "@/app/api/v1/hotel/rooms/[id]/qr/rotate/route";
import { POST as revokeRoomQrRoute } from "@/app/api/v1/hotel/rooms/[id]/qr/revoke/route";
import { GET as resolveCustomerQrRoute } from "@/app/api/v1/customer/qr/[token]/route";
import { GET as customerSessionRoute } from "@/app/api/v1/customer/session/route";
import { GET as customerServiceRequestsGetRoute, POST as customerServiceRequestsPostRoute } from "@/app/api/v1/customer/service-requests/route";
import { GET as customerServiceRequestDetailRoute } from "@/app/api/v1/customer/service-requests/[id]/route";

describe("Phase 7 Hotel Vertical — Slice 7 (QR + Customer Digital Experience) Integration Suite", () => {
  let staffToken: string;
  let demoOutletId: string;
  let room101Id: string;
  let room102Id: string;
  let room101ContextId: string;
  let room102ContextId: string;

  beforeAll(async () => {
    // 1. Seed base hotel data
    await ensureHotelSeedData(DEMO_TENANT_ID);
    const db = getDb();

    // 2. Query property and test rooms
    const [property] = await db
      .select()
      .from(outlets)
      .where(eq(outlets.tenantId, DEMO_TENANT_ID))
      .limit(1);

    demoOutletId = property.outletId;

    const rooms = await db
      .select()
      .from(hotelRooms)
      .where(
        and(
          eq(hotelRooms.tenantId, DEMO_TENANT_ID),
          eq(hotelRooms.outletId, demoOutletId)
        )
      );

    const r101 = rooms.find((r: typeof hotelRooms.$inferSelect) => r.roomNumber === "101") || rooms[0];
    const r102 = rooms.find((r: typeof hotelRooms.$inferSelect) => r.roomNumber === "102") || rooms[1];

    room101Id = r101.roomId;
    room101ContextId = r101.contextId;
    room102Id = r102.roomId;
    room102ContextId = r102.contextId;

    // 3. Issue staff JWT
    staffToken = signJwt({
      sub: "00000000-0000-0000-0000-000000000001",
      email: "staff.admin@hotel.com",
      tenantId: DEMO_TENANT_ID,
      outletId: demoOutletId,
      roles: ["HOTEL_ADMIN"],
      permissions: ["hotel.*", "hotel.rooms.manage", "hotel.read"],
      sessionType: "STAFF",
      isSuperAdmin: false,
    });
  });

  describe("1. Staff QR Administration & Visual Rendering", () => {
    it("generates an active, high-entropy QR token and SVG visual representation for Room 101", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/rooms/${room101Id}/qr?outletId=${demoOutletId}`, {
        headers: { Authorization: `Bearer ${staffToken}` },
      });
      const res = await getRoomQrRoute(req, { params: Promise.resolve({ id: room101Id }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.roomId).toBe(room101Id);
      expect(json.data.roomNumber).toBe("101");
      expect(json.data.tokenStatus).toBe("ACTIVE");
      expect(json.data.opaqueToken).toBeDefined();
      expect(json.data.opaqueToken.length).toBeGreaterThan(30);
      expect(json.data.qrUrl).toContain("/hotel/guest?token=");
      expect(json.data.qrSvgDataUri).toContain("data:image/svg+xml");
    });

    it("retrieves the existing active QR token consistently on repeat calls", async () => {
      const qr1 = await getRoomActiveQr(DEMO_TENANT_ID, demoOutletId, room101Id);
      const qr2 = await getRoomActiveQr(DEMO_TENANT_ID, demoOutletId, room101Id);

      expect(qr1).not.toBeNull();
      expect(qr2).not.toBeNull();
      expect(qr1!.tokenId).toBe(qr2!.tokenId);
      expect(qr1!.opaqueToken).toBe(qr2!.opaqueToken);
    });
  });

  describe("2. Public Server-Side QR Token Resolution & Ephemeral Customer Session", () => {
    it("resolves valid QR token and issues a room-scoped, ephemeral customer session", async () => {
      const qr = await getRoomActiveQr(DEMO_TENANT_ID, demoOutletId, room101Id);
      expect(qr).not.toBeNull();

      const req = new NextRequest(`http://localhost:3000/api/v1/customer/qr/${encodeURIComponent(qr!.opaqueToken)}`, {
        headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)" },
      });
      const res = await resolveCustomerQrRoute(req, { params: Promise.resolve({ token: qr!.opaqueToken }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.sessionToken).toBeDefined();
      expect(json.data.context.roomNumber).toBe("101");
      expect(json.data.context.contextId).toBe(room101ContextId);
      expect(json.data.availableServices).toContain("HOUSEKEEPING");
      expect(json.data.availableServices).toContain("AMENITY");

      // Verify decoded JWT claims
      const decoded = verifyJwt(json.data.sessionToken);
      expect(decoded.sessionType).toBe("CUSTOMER");
      expect(decoded.tenantId).toBe(DEMO_TENANT_ID);
      expect(decoded.outletId).toBe(demoOutletId);
      expect(decoded.contextId).toBe(room101ContextId);
      expect(decoded.isSuperAdmin).toBe(false);
      expect(decoded.permissions).toEqual([]);
      expect(decoded.roles).toEqual([]);
    });

    it("rejects resolution of unknown/malformed opaque QR token with 404", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/customer/qr/invalid_nonexistent_token_12345");
      const res = await resolveCustomerQrRoute(req, { params: Promise.resolve({ token: "invalid_nonexistent_token_12345" }) });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("RESOURCE_NOT_FOUND");
    });
  });

  describe("3. Customer Service Request Submission & Invariant Enforcement", () => {
    let customer101Token: string;

    beforeAll(async () => {
      const qr = await getRoomActiveQr(DEMO_TENANT_ID, demoOutletId, room101Id);
      const resolution = await resolveCustomerQr(qr!.opaqueToken);
      customer101Token = resolution.sessionToken;
    });

    it("submits a valid housekeeping request bound to Room 101", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/customer/service-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer101Token}`,
        },
        body: JSON.stringify({
          requestType: "HOUSEKEEPING",
          title: "Fresh Bath Towels",
          description: "Please bring 2 extra bath towels to the room.",
          priority: "NORMAL",
        }),
      });

      const res = await customerServiceRequestsPostRoute(req);
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.requestId).toBeDefined();
      expect(json.data.requestType).toBe("HOUSEKEEPING");
      expect(json.data.title).toBe("Fresh Bath Towels");
      expect(json.data.roomNumber).toBe("101");
      expect(json.data.displayStatus).toBe("Submitted");
    });

    it("submits an amenity request with urgent priority", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/customer/service-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer101Token}`,
        },
        body: JSON.stringify({
          requestType: "AMENITY",
          title: "Dental Kit & Shaving Kit",
          description: "Need 2 dental kits and 1 shaving kit urgently.",
          priority: "URGENT",
        }),
      });

      const res = await customerServiceRequestsPostRoute(req);
      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.priority).toBe("URGENT");
      expect(json.data.displayStatus).toBe("Submitted");
    });

    it("rejects request payload with invalid/missing title or description", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/customer/service-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customer101Token}`,
        },
        body: JSON.stringify({
          requestType: "HOUSEKEEPING",
          title: "ab", // Too short
          description: "",
        }),
      });

      const res = await customerServiceRequestsPostRoute(req);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("VALIDATION_FAILED");
    });

    it("lists only requests created for the customer's room context", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/customer/service-requests", {
        headers: { Authorization: `Bearer ${customer101Token}` },
      });
      const res = await customerServiceRequestsGetRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(2);
      expect(json.data.every((r: any) => r.roomNumber === "101")).toBe(true);
    });
  });

  describe("4. Cross-Room Request Security & Context Isolation", () => {
    let customer101Token: string;
    let customer102Token: string;
    let room102RequestId: string;

    beforeAll(async () => {
      // Setup Room 101 session
      const qr101 = await generateOrGetRoomQr(DEMO_TENANT_ID, demoOutletId, room101Id);
      const res101 = await resolveCustomerQr(qr101.opaqueToken);
      customer101Token = res101.sessionToken;

      // Setup Room 102 session and request
      const qr102 = await generateOrGetRoomQr(DEMO_TENANT_ID, demoOutletId, room102Id);
      const res102 = await resolveCustomerQr(qr102.opaqueToken);
      customer102Token = res102.sessionToken;

      const created102 = await createCustomerServiceRequest(verifyJwt(customer102Token), {
        requestType: "MAINTENANCE",
        title: "Room 102 Light Repair",
        description: "Bathroom light is flickering.",
        priority: "NORMAL",
      });
      room102RequestId = created102.requestId;
    });

    it("prevents Room 101 customer from accessing Room 102 request detail (404/Isolated)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/customer/service-requests/${room102RequestId}`, {
        headers: { Authorization: `Bearer ${customer101Token}` },
      });
      const res = await customerServiceRequestDetailRoute(req, { params: Promise.resolve({ id: room102RequestId }) });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("RESOURCE_NOT_FOUND");
    });

    it("allows Room 102 customer to access their own request detail", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/customer/service-requests/${room102RequestId}`, {
        headers: { Authorization: `Bearer ${customer102Token}` },
      });
      const res = await customerServiceRequestDetailRoute(req, { params: Promise.resolve({ id: room102RequestId }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.requestId).toBe(room102RequestId);
      expect(json.data.roomNumber).toBe("102");
    });
  });

  describe("5. QR Token Rotation & Old Token Invalidation", () => {
    it("atomically rotates QR token, invalidates old token, and creates a functional new token", async () => {
      const oldQr = await getRoomActiveQr(DEMO_TENANT_ID, demoOutletId, room101Id);
      expect(oldQr).not.toBeNull();

      // Perform staff rotation
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/rooms/${room101Id}/qr/rotate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({ outletId: demoOutletId, reason: "PERIODIC_SECURITY_ROTATION" }),
      });
      const res = await rotateRoomQrRoute(req, { params: Promise.resolve({ id: room101Id }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.opaqueToken).not.toBe(oldQr!.opaqueToken);
      expect(json.data.tokenStatus).toBe("ACTIVE");

      // 1. Attempting resolution with old token must now fail with 422 QR_REVOKED
      const oldReq = new NextRequest(`http://localhost:3000/api/v1/customer/qr/${encodeURIComponent(oldQr!.opaqueToken)}`);
      const oldRes = await resolveCustomerQrRoute(oldReq, { params: Promise.resolve({ token: oldQr!.opaqueToken }) });
      expect(oldRes.status).toBe(422);

      const oldJson = await oldRes.json();
      expect(oldJson.success).toBe(false);
      expect(oldJson.error.code).toBe("BUSINESS_RULE_VIOLATION");

      // 2. Resolution with new token must succeed
      const newReq = new NextRequest(`http://localhost:3000/api/v1/customer/qr/${encodeURIComponent(json.data.opaqueToken)}`);
      const newRes = await resolveCustomerQrRoute(newReq, { params: Promise.resolve({ token: json.data.opaqueToken }) });
      expect(newRes.status).toBe(200);
    });
  });

  describe("6. QR Token Revocation Lifecycle", () => {
    it("revokes active QR token and blocks subsequent customer resolution", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/hotel/rooms/${room101Id}/qr/revoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({ outletId: demoOutletId, reason: "MAINTENANCE_LOCKDOWN" }),
      });
      const res = await revokeRoomQrRoute(req, { params: Promise.resolve({ id: room101Id }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.revokedCount).toBeGreaterThanOrEqual(1);

      // Active QR lookup returns null
      const activeQr = await getRoomActiveQr(DEMO_TENANT_ID, demoOutletId, room101Id);
      expect(activeQr).toBeNull();
    });
  });
});
