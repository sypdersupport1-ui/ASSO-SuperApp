import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET as sectionsGet, POST as sectionsPost } from "@/app/api/v1/restaurant/sections/route";
import {
  GET as sectionDetailGet,
  PUT as sectionDetailPut,
  DELETE as sectionDetailDelete,
} from "@/app/api/v1/restaurant/sections/[id]/route";
import { GET as tablesGet, POST as tablesPost } from "@/app/api/v1/restaurant/tables/route";
import { GET as tableGet, PATCH as tablePatch } from "@/app/api/v1/restaurant/tables/[id]/route";
import { PUT as tableLayoutPut } from "@/app/api/v1/restaurant/tables/[id]/layout/route";
import { PUT as tablesBatchLayoutPut } from "@/app/api/v1/restaurant/tables/layout/route";
import { POST as tableStatusPost } from "@/app/api/v1/restaurant/tables/[id]/status/route";
import { GET as tableQrGet } from "@/app/api/v1/restaurant/tables/[id]/qr/route";
import { GET as sessionsGet, POST as sessionsPost } from "@/app/api/v1/restaurant/sessions/route";
import { GET as sessionDetailGet } from "@/app/api/v1/restaurant/sessions/[id]/route";
import { POST as sessionClosePost } from "@/app/api/v1/restaurant/sessions/[id]/close/route";
import { POST as sessionTransferPost } from "@/app/api/v1/restaurant/sessions/[id]/transfer/route";
import { POST as ordersPost } from "@/app/api/v1/restaurant/orders/route";
import { GET as outletsGet, POST as outletsPost } from "@/app/api/v1/restaurant/outlets/route";
import { signJwt } from "@/lib/auth/jwt";
import { setTenantEntitlements } from "@/lib/entitlements/checker";
import { getDb } from "@/db/client";
import { catalogItems, catalogs, catalogCategories, orders } from "@/db/schema/operations";

describe("ASSO Restaurant Vertical — Slice 3.4 Floor / Table Map & Advanced Operations", () => {
  const TENANT_A = "11111111-1111-1111-1111-111111111111";
  const TENANT_B = "22222222-2222-2222-2222-222222222222";

  // Auth tokens
  const restaurantManagerTokenA = signJwt({
    sub: "usr_rest_manager_a",
    tenantId: TENANT_A,
    roles: ["RESTAURANT_MANAGER"],
    permissions: ["restaurant.*"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const restaurantStaffTokenA = signJwt({
    sub: "usr_rest_staff_a",
    tenantId: TENANT_A,
    roles: ["RESTAURANT_STAFF"],
    permissions: ["restaurant.tables.view", "restaurant.tables.status", "restaurant.sessions.manage"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const hotelAdminTokenA = signJwt({
    sub: "usr_hotel_admin_a",
    tenantId: TENANT_A,
    roles: ["HOTEL_ADMIN"],
    permissions: ["hotel.*"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const unprivilegedTokenA = signJwt({
    sub: "usr_guest_a",
    tenantId: TENANT_A,
    roles: ["GUEST"],
    permissions: ["customer.read"],
    sessionType: "CUSTOMER",
    isSuperAdmin: false,
  });

  const restaurantManagerTokenB = signJwt({
    sub: "usr_rest_manager_b",
    tenantId: TENANT_B,
    roles: ["RESTAURANT_MANAGER"],
    permissions: ["restaurant.*"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  let outletIdA: string;
  let outletIdB: string;
  let sectionIdA: string;
  let testItemIdA: string;

  beforeAll(async () => {
    // Entitlements
    setTenantEntitlements(TENANT_A, ["CORE", "RESTAURANT", "ORDERING", "POS"]);
    setTenantEntitlements(TENANT_B, ["CORE", "RESTAURANT", "ORDERING", "POS"]);

    // Create Outlet for Tenant A
    const outACode = `OUT_FL_${Date.now().toString().slice(-4)}`;
    const reqA = new NextRequest("http://localhost:3000/api/v1/restaurant/outlets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${restaurantManagerTokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Grand Emerald Dining", code: outACode }),
    });
    const resA = await outletsPost(reqA);
    const jsonA = await resA.json();
    expect(resA.status).toBe(201);
    outletIdA = jsonA.data.outletId;

    // Create Outlet for Tenant B
    const outBCode = `OUT_B_${Date.now().toString().slice(-4)}`;
    const reqB = new NextRequest("http://localhost:3000/api/v1/restaurant/outlets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${restaurantManagerTokenB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Blue Bistro", code: outBCode }),
    });
    const resB = await outletsPost(reqB);
    const jsonB = await resB.json();
    expect(resB.status).toBe(201);
    outletIdB = jsonB.data.outletId;

    // Seed a catalog item for order tests in Tenant A
    const db = getDb();
    const [cat] = await db
      .insert(catalogs)
      .values({
        tenantId: TENANT_A,
        outletId: outletIdA,
        name: "Main Menu",
      })
      .returning();

    const [category] = await db
      .insert(catalogCategories)
      .values({
        tenantId: TENANT_A,
        catalogId: cat.catalogId,
        name: "Mains",
      })
      .returning();

    const [item] = await db
      .insert(catalogItems)
      .values({
        tenantId: TENANT_A,
        categoryId: category.categoryId,
        name: "Butter Chicken",
        basePrice: "450.0000",
        isAvailable: true,
      })
      .returning();
    testItemIdA = item.itemId;
  });

  describe("1. Restaurant Section / Floor Grouping", () => {
    it("allows Restaurant Manager to create a new section", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/sections", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantManagerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          name: "Rooftop Terrace",
          code: "ROOF",
          displayOrder: 1,
        }),
      });

      const res = await sectionsPost(req);
      const json = await res.json();
      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.name).toBe("Rooftop Terrace");
      expect(json.data.code).toBe("ROOF");
      sectionIdA = json.data.sectionId;
    });

    it("rejects duplicate section names within the same outlet", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/sections", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantManagerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          name: "Rooftop Terrace",
          code: "ROOF2",
        }),
      });

      const res = await sectionsPost(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.code).toBe("BUSINESS_RULE_VIOLATION");
    });

    it("lists all sections for an outlet including default generated ones", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/sections?outletId=${outletIdA}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${restaurantManagerTokenA}`,
        },
      });

      const res = await sectionsGet(req);
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.some((s: any) => s.name === "Rooftop Terrace")).toBe(true);
    });

    it("allows updating an existing section", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/sections/${sectionIdA}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${restaurantManagerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          name: "Rooftop Sky Lounge",
          code: "SKY",
        }),
      });

      const res = await sectionDetailPut(req, { params: Promise.resolve({ id: sectionIdA }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.name).toBe("Rooftop Sky Lounge");
      expect(json.data.code).toBe("SKY");
    });
  });

  describe("2. Table Placement & Spatial Layout Metadata", () => {
    let placedTableId: string;

    it("creates table with spatial metadata (posX, posY, shape, sectionId)", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/tables", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantManagerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableNumber: "T-SKY-01",
          displayLabel: "Skyline View 1",
          capacity: 4,
          sectionId: sectionIdA,
          posX: 120,
          posY: 180,
          width: 100,
          height: 100,
          shape: "ROUND",
        }),
      });

      const res = await tablesPost(req);
      const json = await res.json();
      expect(res.status).toBe(201);
      expect(json.data.tableNumber).toBe("T-SKY-01");
      expect(json.data.posX).toBe(120);
      expect(json.data.posY).toBe(180);
      expect(json.data.shape).toBe("ROUND");
      expect(json.data.sectionId).toBe(sectionIdA);
      placedTableId = json.data.tableId;
    });

    it("updates table spatial layout via PUT /tables/[id]/layout", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${placedTableId}/layout`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${restaurantManagerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          posX: 240,
          posY: 300,
          width: 120,
          height: 80,
          shape: "RECTANGLE",
          rotation: 90,
        }),
      });

      const res = await tableLayoutPut(req, { params: Promise.resolve({ id: placedTableId }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.posX).toBe(240);
      expect(json.data.posY).toBe(300);
      expect(json.data.shape).toBe("RECTANGLE");
      expect(json.data.rotation).toBe(90);
    });

    it("batch updates floor map table positions safely", async () => {
      // Create a second table for batch test
      const createReq = new NextRequest("http://localhost:3000/api/v1/restaurant/tables", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantManagerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableNumber: "T-SKY-02",
          displayLabel: "Skyline View 2",
          capacity: 2,
          sectionId: sectionIdA,
        }),
      });
      const createRes = await tablesPost(createReq);
      const table2 = (await createRes.json()).data;

      const batchReq = new NextRequest("http://localhost:3000/api/v1/restaurant/tables/layout", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${restaurantManagerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tables: [
            { tableId: placedTableId, posX: 300, posY: 100 },
            { tableId: table2.tableId, posX: 450, posY: 100 },
          ],
        }),
      });

      const batchRes = await tablesBatchLayoutPut(batchReq);
      const batchJson = await batchRes.json();
      expect(batchRes.status).toBe(200);
      expect(batchJson.data.length).toBe(2);
      expect(batchJson.data.find((t: any) => t.tableId === placedTableId).posX).toBe(300);
      expect(batchJson.data.find((t: any) => t.tableId === table2.tableId).posX).toBe(450);
    });

    it("prevents deleting section if tables are still assigned to it", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/sections/${sectionIdA}?outletId=${outletIdA}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${restaurantManagerTokenA}`,
        },
      });

      const res = await sectionDetailDelete(req, { params: Promise.resolve({ id: sectionIdA }) });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(json.error.message).toContain("contains assigned tables");
    });
  });

  describe("3. Table QR Continuity & Active Session Preservation", () => {
    let qrTableId: string;
    let originalQrToken: string;

    it("creates table and obtains high-entropy QR token", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/tables", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantManagerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableNumber: "T-QR-CONTINUITY",
          displayLabel: "Center Table",
          capacity: 4,
        }),
      });

      const res = await tablesPost(req);
      const json = await res.json();
      expect(res.status).toBe(201);
      qrTableId = json.data.tableId;
      originalQrToken = json.data.qrOpaqueToken;
      expect(originalQrToken).toBeDefined();
    });

    it("guarantees QR token is UNCHANGED after moving table position on floor map", async () => {
      const moveReq = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${qrTableId}/layout`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${restaurantManagerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          posX: 500,
          posY: 500,
        }),
      });
      await tableLayoutPut(moveReq, { params: Promise.resolve({ id: qrTableId }) });

      // Fetch table QR
      const qrReq = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${qrTableId}/qr?outletId=${outletIdA}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${restaurantManagerTokenA}` },
      });
      const qrRes = await tableQrGet(qrReq, { params: Promise.resolve({ id: qrTableId }) });
      const qrJson = await qrRes.json();
      expect(qrJson.data.opaqueToken).toBe(originalQrToken);
    });

    it("guarantees QR token is UNCHANGED after updating table display label or capacity", async () => {
      const editReq = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${qrTableId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${restaurantManagerTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          displayLabel: "Renamed Center Table",
          capacity: 6,
        }),
      });
      await tablePatch(editReq, { params: Promise.resolve({ id: qrTableId }) });

      const qrReq = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${qrTableId}/qr?outletId=${outletIdA}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${restaurantManagerTokenA}` },
      });
      const qrRes = await tableQrGet(qrReq, { params: Promise.resolve({ id: qrTableId }) });
      const qrJson = await qrRes.json();
      expect(qrJson.data.opaqueToken).toBe(originalQrToken);
    });
  });

  describe("4. Table Session Operations & Safe Atomic Transfer", () => {
    let sourceTableId: string;
    let sourceTableContextId: string;
    let targetTableId: string;
    let occupiedTableId: string;
    let activeSessionId: string;

    beforeAll(async () => {
      // Table 1 (Source)
      const res1 = await tablesPost(
        new NextRequest("http://localhost:3000/api/v1/restaurant/tables", {
          method: "POST",
          headers: { Authorization: `Bearer ${restaurantManagerTokenA}`, "Content-Type": "application/json" },
          body: JSON.stringify({ outletId: outletIdA, tableNumber: "T-XFER-SRC", capacity: 4 }),
        })
      );
      const json1 = await res1.json();
      sourceTableId = json1.data.tableId;
      sourceTableContextId = json1.data.contextId;

      // Table 2 (Target)
      const res2 = await tablesPost(
        new NextRequest("http://localhost:3000/api/v1/restaurant/tables", {
          method: "POST",
          headers: { Authorization: `Bearer ${restaurantManagerTokenA}`, "Content-Type": "application/json" },
          body: JSON.stringify({ outletId: outletIdA, tableNumber: "T-XFER-DST", capacity: 6 }),
        })
      );
      targetTableId = (await res2.json()).data.tableId;

      // Table 3 (Occupied collision target)
      const res3 = await tablesPost(
        new NextRequest("http://localhost:3000/api/v1/restaurant/tables", {
          method: "POST",
          headers: { Authorization: `Bearer ${restaurantManagerTokenA}`, "Content-Type": "application/json" },
          body: JSON.stringify({ outletId: outletIdA, tableNumber: "T-XFER-OCC", capacity: 4 }),
        })
      );
      occupiedTableId = (await res3.json()).data.tableId;

      // Open dining session on Table 3 so it is OCCUPIED
      await sessionsPost(
        new NextRequest("http://localhost:3000/api/v1/restaurant/sessions", {
          method: "POST",
          headers: { Authorization: `Bearer ${restaurantManagerTokenA}`, "Content-Type": "application/json" },
          body: JSON.stringify({ outletId: outletIdA, tableId: occupiedTableId, guestCount: 2 }),
        })
      );
    });

    it("opens a dining session on source table and verifies state transitions to OCCUPIED", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantStaffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          tableId: sourceTableId,
          guestCount: 3,
          customerName: "Alice Walker",
          notes: "Anniversary celebration",
        }),
      });

      const res = await sessionsPost(req);
      const json = await res.json();
      expect(res.status).toBe(201);
      expect(json.data.status).toBe("ACTIVE");
      expect(json.data.tableId).toBe(sourceTableId);
      activeSessionId = json.data.sessionId;

      // Source table must now be OCCUPIED
      const tReq = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${sourceTableId}?outletId=${outletIdA}`, {
        headers: { Authorization: `Bearer ${restaurantStaffTokenA}` },
      });
      const tRes = await tableGet(tReq, { params: Promise.resolve({ id: sourceTableId }) });
      const tJson = await tRes.json();
      expect(tJson.data.status).toBe("OCCUPIED");
    });

    it("places an order attached to the active dining session", async () => {
      const db = getDb();
      const [testOrder] = await db
        .insert(orders)
        .values({
          tenantId: TENANT_A,
          outletId: outletIdA,
          contextId: sourceTableContextId,
          tableId: sourceTableId,
          tableSessionId: activeSessionId,
          orderNumber: `ORD-FP-${Date.now().toString().slice(-4)}`,
          orderSource: "STAFF_POS",
          diningContext: "DINE_IN",
          status: "PLACED",
          subtotalAmount: "45.0000",
          taxAmount: "4.5000",
          platformFeeAmount: "0.0000",
          totalAmount: "49.5000",
        })
        .returning();

      expect(testOrder).toBeDefined();
      expect(testOrder.tableSessionId).toBe(activeSessionId);
    });

    it("rejects transfer to a table that already has an active session", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/sessions/${activeSessionId}/transfer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantStaffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          targetTableId: occupiedTableId,
        }),
      });

      const res = await sessionTransferPost(req, { params: Promise.resolve({ id: activeSessionId }) });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.code).toBe("BUSINESS_RULE_VIOLATION");
      expect(json.error.message).toContain("already has an active dining session");
    });

    it("rejects transfer to self (same table)", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/sessions/${activeSessionId}/transfer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantStaffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          targetTableId: sourceTableId,
        }),
      });

      const res = await sessionTransferPost(req, { params: Promise.resolve({ id: activeSessionId }) });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.message).toContain("Cannot transfer session to the same table");
    });

    it("atomically transfers session to target table: source becomes CLEANING, target becomes OCCUPIED", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/sessions/${activeSessionId}/transfer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantStaffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          targetTableId: targetTableId,
          notes: "Guests moved to larger booth",
        }),
      });

      const res = await sessionTransferPost(req, { params: Promise.resolve({ id: activeSessionId }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.session.tableId).toBe(targetTableId);
      expect(json.data.sourceTable.status).toBe("CLEANING");
      expect(json.data.targetTable.status).toBe("OCCUPIED");

      // Verify source table is CLEANING
      const srcReq = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${sourceTableId}?outletId=${outletIdA}`, {
        headers: { Authorization: `Bearer ${restaurantStaffTokenA}` },
      });
      const srcRes = await tableGet(srcReq, { params: Promise.resolve({ id: sourceTableId }) });
      expect((await srcRes.json()).data.status).toBe("CLEANING");

      // Verify target table is OCCUPIED
      const dstReq = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${targetTableId}?outletId=${outletIdA}`, {
        headers: { Authorization: `Bearer ${restaurantStaffTokenA}` },
      });
      const dstRes = await tableGet(dstReq, { params: Promise.resolve({ id: targetTableId }) });
      expect((await dstRes.json()).data.status).toBe("OCCUPIED");
    });

    it("preserves active session orders intact under target table after transfer", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/sessions/${activeSessionId}?outletId=${outletIdA}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${restaurantStaffTokenA}` },
      });

      const res = await sessionDetailGet(req, { params: Promise.resolve({ id: activeSessionId }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.table.tableId).toBe(targetTableId);
      expect(json.data.orders.length).toBeGreaterThan(0);
      expect(json.data.orders[0].tableSessionId).toBe(activeSessionId);
    });

    it("safely closes active session and transitions table to CLEANING", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/sessions/${activeSessionId}/close`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restaurantStaffTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletId: outletIdA,
          nextTableStatus: "CLEANING",
          notes: "Dining completed successfully",
        }),
      });

      const res = await sessionClosePost(req, { params: Promise.resolve({ id: activeSessionId }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe("COMPLETED");

      // Table 2 must now be CLEANING
      const dstReq = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${targetTableId}?outletId=${outletIdA}`, {
        headers: { Authorization: `Bearer ${restaurantStaffTokenA}` },
      });
      const dstRes = await tableGet(dstReq, { params: Promise.resolve({ id: targetTableId }) });
      expect((await dstRes.json()).data.status).toBe("CLEANING");
    });
  });

  describe("5. Tenancy & Multi-Tenant Boundary Enforcement", () => {
    it("Tenant B cannot read Tenant A floor sections", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/sections/${sectionIdA}?outletId=${outletIdA}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${restaurantManagerTokenB}` },
      });

      const res = await sectionDetailGet(req, { params: Promise.resolve({ id: sectionIdA }) });
      expect(res.status).toBe(404);
    });

    it("Tenant B cannot mutate Tenant A table layout", async () => {
      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/sections/${sectionIdA}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${restaurantManagerTokenB}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Hacked Section" }),
      });

      const res = await sectionDetailPut(req, { params: Promise.resolve({ id: sectionIdA }) });
      expect(res.status).toBe(404);
    });
  });

  describe("6. RBAC & Operational Authorization Security", () => {
    it("rejects unprivileged customer/guest token from mutating sections (403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/sections", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${unprivilegedTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Unauthorized Section" }),
      });

      const res = await sectionsPost(req);
      expect(res.status).toBe(403);
    });

    it("rejects Hotel Admin from managing restaurant floor map (isolated vertical scope)", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/restaurant/sections", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hotelAdminTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Hotel Breach Section" }),
      });

      const res = await sectionsPost(req);
      expect(res.status).toBe(403);
    });

    it("rejects staff without session management permission from transferring sessions", async () => {
      const readOnlyStaffToken = signJwt({
        sub: "usr_read_only",
        tenantId: TENANT_A,
        roles: ["STAFF"],
        permissions: ["restaurant.tables.view"],
        sessionType: "STAFF",
        isSuperAdmin: false,
      });

      const req = new NextRequest(`http://localhost:3000/api/v1/restaurant/sessions/00000000-0000-0000-0000-000000000000/transfer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${readOnlyStaffToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ targetTableId: "00000000-0000-0000-0000-000000000001" }),
      });

      const res = await sessionTransferPost(req, { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) });
      expect(res.status).toBe(403);
    });
  });
});
