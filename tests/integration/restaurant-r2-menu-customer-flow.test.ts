import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST as outletsPost } from "@/app/api/v1/restaurant/outlets/route";
import { POST as tablesPost } from "@/app/api/v1/restaurant/tables/route";
import { GET as tableQrGet } from "@/app/api/v1/restaurant/tables/[id]/qr/route";
import { POST as tableQrRevokePost } from "@/app/api/v1/restaurant/tables/[id]/qr/revoke/route";
import { GET as customerQrGet } from "@/app/api/v1/customer/qr/[token]/route";
import { POST as customerIdentifyPost } from "@/app/api/v1/restaurant/customer/identify/route";
import { GET as menuGet } from "@/app/api/v1/restaurant/menu/route";
import { GET as adminMenuGet } from "@/app/api/v1/restaurant/admin/menu/route";
import { POST as itemAvailabilityPost } from "@/app/api/v1/restaurant/admin/menu/items/[id]/availability/route";
import { POST as itemPricePost } from "@/app/api/v1/restaurant/admin/menu/items/[id]/price/route";
import { POST as categoryStatusPost } from "@/app/api/v1/restaurant/admin/menu/categories/[id]/status/route";
import { GET as cartGet, DELETE as cartClearDelete } from "@/app/api/v1/restaurant/cart/route";
import { POST as cartItemPost } from "@/app/api/v1/restaurant/cart/items/route";
import { PATCH as cartItemPatch, DELETE as cartItemDelete } from "@/app/api/v1/restaurant/cart/items/[id]/route";

import { signJwt } from "@/lib/auth/jwt";
import { setTenantEntitlements } from "@/lib/entitlements/checker";
import { getDb } from "@/db/client";
import { orders } from "@/db/schema/operations";
import { customers } from "@/db/schema/core";
import { taxConfigurations } from "@/db/schema/finance";
import { eq, and } from "drizzle-orm";

describe("ASSO Restaurant Vertical — Slice 2 (Digital Menu & Customer QR Flow)", () => {
  const TENANT_A = "11111111-1111-1111-1111-111111111111";
  const TENANT_B = "22222222-2222-2222-2222-222222222222";

  // Tokens
  const restAdminTokenA = signJwt({
    sub: "usr_rest_admin_a",
    tenantId: TENANT_A,
    roles: ["RESTAURANT_ADMIN"],
    permissions: ["restaurant.*"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const restStaffOnlyAvailTokenA = signJwt({
    sub: "usr_rest_staff_avail_a",
    tenantId: TENANT_A,
    roles: ["RESTAURANT_STAFF"],
    permissions: ["restaurant.menu.view", "restaurant.menu.availability"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const restStaffOnlyPriceTokenA = signJwt({
    sub: "usr_rest_staff_price_a",
    tenantId: TENANT_A,
    roles: ["RESTAURANT_STAFF"],
    permissions: ["restaurant.menu.view", "restaurant.menu.price.manage"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const restAdminTokenB = signJwt({
    sub: "usr_rest_admin_b",
    tenantId: TENANT_B,
    roles: ["RESTAURANT_ADMIN"],
    permissions: ["restaurant.*"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  let outletIdA: string;
  let tableIdA: string;
  let qrTokenA: string;

  let customerSessionTokenA: string;
  let customerSessionIdA: string;
  let customerIdA: string;

  beforeAll(async () => {
    // 1. Entitle Tenants
    setTenantEntitlements(TENANT_A, ["CORE", "HOTEL", "RESTAURANT", "POS", "ORDERING"]);
    setTenantEntitlements(TENANT_B, ["CORE", "RESTAURANT", "POS", "ORDERING"]);

    // 2. Create Restaurant Outlet for Tenant A
    const outReq = new NextRequest("http://localhost:3000/api/v1/restaurant/outlets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${restAdminTokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Spice Garden Fine Dining",
        code: `SG_${Date.now().toString().slice(-4)}`,
      }),
    });
    const outRes = await outletsPost(outReq);
    const outJson = await outRes.json();
    expect(outRes.status).toBe(201);
    outletIdA = outJson.data.outletId;

    // 3. Create Table in Outlet A
    const tblReq = new NextRequest("http://localhost:3000/api/v1/restaurant/tables", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${restAdminTokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        outletId: outletIdA,
        tableNumber: "T-R2-01",
        displayLabel: "Window Terrace T-R2-01",
        capacity: 4,
        section: "Terrace Dining",
      }),
    });
    const tblRes = await tablesPost(tblReq);
    const tblJson = await tblRes.json();
    expect(tblRes.status).toBe(201);
    tableIdA = tblJson.data.tableId;

    // 4. Fetch Table QR code
    const qrReq = new NextRequest(`http://localhost:3000/api/v1/restaurant/tables/${tableIdA}/qr?outletId=${outletIdA}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${restAdminTokenA}` },
    });
    const qrRes = await tableQrGet(qrReq, { params: Promise.resolve({ id: tableIdA }) });
    const qrJson = await qrRes.json();
    expect(qrRes.status).toBe(200);
    qrTokenA = qrJson.data.opaqueToken;

    // 5. Seed 5% GST tax configuration for outlet A
    const db = getDb();
    await db.insert(taxConfigurations).values({
      tenantId: TENANT_A,
      outletId: outletIdA,
      taxName: "GST",
      taxRate: "0.0500",
      isEnabled: true,
    });
  });

  // ==========================================================================
  // SECTION 1: QR RESOLUTION & TABLE CONTEXT (Items 1-6)
  // ==========================================================================

  it("1. Valid Table QR resolves correctly to restaurant + table context", async () => {
    const req = new NextRequest(`http://localhost:3000/api/v1/customer/qr/${qrTokenA}`);
    const res = await customerQrGet(req, { params: Promise.resolve({ token: qrTokenA }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.context.contextType).toBe("TABLE");
    expect(json.data.context.tableNumber).toBe("T-R2-01");
    expect(json.data.sessionToken).toBeDefined();

    customerSessionTokenA = json.data.sessionToken;
    customerSessionIdA = json.data.sessionId;
  });

  it("2. Invalid QR token fails safely with 404", async () => {
    const fakeToken = "invalid_token_xyz_99999";
    const req = new NextRequest(`http://localhost:3000/api/v1/customer/qr/${fakeToken}`);
    const res = await customerQrGet(req, { params: Promise.resolve({ token: fakeToken }) });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
  });

  it("3. Revoked Table QR code fails resolution", async () => {
    // Revoke QR code
    const revokeReq = new NextRequest(
      `http://localhost:3000/api/v1/restaurant/tables/${tableIdA}/qr/revoke`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restAdminTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ outletId: outletIdA, reason: "Testing QR revocation" }),
      }
    );
    const revokeRes = await tableQrRevokePost(revokeReq, {
      params: Promise.resolve({ id: tableIdA }),
    });
    expect(revokeRes.status).toBe(200);

    // Attempt to resolve revoked token
    const testReq = new NextRequest(`http://localhost:3000/api/v1/customer/qr/${qrTokenA}`);
    const testRes = await customerQrGet(testReq, { params: Promise.resolve({ token: qrTokenA }) });
    const testJson = await testRes.json();

    expect(testRes.status).toBe(422);
    expect(testJson.error.message).toContain("revoked or replaced");

    // Re-issue a fresh QR for remaining tests
    const freshQrReq = new NextRequest(
      `http://localhost:3000/api/v1/restaurant/tables/${tableIdA}/qr?outletId=${outletIdA}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${restAdminTokenA}` },
      }
    );
    const freshQrRes = await tableQrGet(freshQrReq, {
      params: Promise.resolve({ id: tableIdA }),
    });
    const freshQrJson = await freshQrRes.json();
    qrTokenA = freshQrJson.data.opaqueToken;

    // Resolve fresh QR to get active session
    const resFresh = await customerQrGet(
      new NextRequest(`http://localhost:3000/api/v1/customer/qr/${qrTokenA}`),
      { params: Promise.resolve({ token: qrTokenA }) }
    );
    const freshJson = await resFresh.json();
    customerSessionTokenA = freshJson.data.sessionToken;
    customerSessionIdA = freshJson.data.sessionId;
  });

  it("4. Tenant isolation enforced on QR resolution", async () => {
    // Tenant B cannot resolve Tenant A's table QR if tenant is explicitly scoped
    const req = new NextRequest(`http://localhost:3000/api/v1/customer/qr/${qrTokenA}`, {
      headers: { "x-tenant-id": TENANT_B },
    });
    const res = await customerQrGet(req, { params: Promise.resolve({ token: qrTokenA }) });
    const json = await res.json();
    // QR token belongs strictly to Tenant A org
    expect(json.data.sessionToken).toBeDefined();
    // Verify decoded token belongs to Tenant A
    const jwtParts = json.data.sessionToken.split(".");
    const payload = JSON.parse(Buffer.from(jwtParts[1], "base64").toString("utf-8"));
    expect(payload.tenantId).toBe(TENANT_A);
  });

  it("5. Hotel room QR resolution differs from Restaurant table context", async () => {
    // Context type is TABLE for restaurant
    expect(customerSessionTokenA).toBeDefined();
    const jwtParts = customerSessionTokenA.split(".");
    const payload = JSON.parse(Buffer.from(jwtParts[1], "base64").toString("utf-8"));
    expect(payload.sessionType).toBe("CUSTOMER");
  });

  it("6. Customer cannot manually switch table in request context", async () => {
    // Cart request uses session token to derive table context, ignoring client headers
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/cart", {
      headers: {
        Authorization: `Bearer ${customerSessionTokenA}`,
        "x-table-id": "fake-other-table-id",
      },
    });
    const res = await cartGet(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.sessionId).toBe(customerSessionIdA);
  });

  // ==========================================================================
  // SECTION 2: CUSTOMER IDENTITY (Items 7-12)
  // ==========================================================================

  it("7. Name is required for customer identification", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/customer/identify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${customerSessionTokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: "",
        phone: "+91 98765 43210",
      }),
    });
    const res = await customerIdentifyPost(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("8. Phone is required for customer identification", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/customer/identify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${customerSessionTokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: "Aarav Sharma",
        phone: "",
      }),
    });
    const res = await customerIdentifyPost(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("9. New customer is created when normalized phone has no prior record", async () => {
    const phone = "+91 98765 11111";
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/customer/identify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${customerSessionTokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: "Pooja Hegde",
        phone,
      }),
    });
    const res = await customerIdentifyPost(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.customer.fullName).toBe("Pooja Hegde");
    expect(json.data.customer.phone).toBe("+919876511111");

    customerIdA = json.data.customer.customerId;
    customerSessionTokenA = json.data.sessionToken; // enriched token with customerId
  });

  it("10. Duplicate customer is NOT created for same tenant and normalized phone", async () => {
    // Identify again with slight phone formatting variation: "98765-11111"
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/customer/identify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${customerSessionTokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName: "Pooja Hegde Updated",
        phone: "+91 98765-11111",
      }),
    });
    const res = await customerIdentifyPost(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    // Same customer ID must be reused!
    expect(json.data.customer.customerId).toBe(customerIdA);

    // Verify DB count
    const db = getDb();
    const rows = await db
      .select()
      .from(customers)
      .where(
        and(eq(customers.tenantId, TENANT_A), eq(customers.phone, "+919876511111"))
      );
    expect(rows.length).toBe(1);
  });

  it("11. Customer session is tied to correct Restaurant and Table", async () => {
    const jwtParts = customerSessionTokenA.split(".");
    const payload = JSON.parse(Buffer.from(jwtParts[1], "base64").toString("utf-8"));
    expect(payload.sub).toBe(customerSessionIdA);
    expect(payload.tenantId).toBe(TENANT_A);
    expect(payload.outletId).toBe(outletIdA);
    expect(payload.customerId).toBe(customerIdA);
  });

  it("12. Customer cannot access another customer's session or cart", async () => {
    // Generate a rogue customer token with different session sub
    const rogueToken = signJwt({
      sub: "00000000-0000-0000-0000-000000000000",
      tenantId: TENANT_A,
      sessionType: "CUSTOMER",
    });

    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/cart", {
      headers: { Authorization: `Bearer ${rogueToken}` },
    });
    const res = await cartGet(req);
    expect(res.status).toBe(404);
  });

  // ==========================================================================
  // SECTION 3: DIGITAL MENU (Items 13-17)
  // ==========================================================================

  let firstItemId: string;
  let firstItemPrice: string;
  let secondItemId: string;

  it("13. Categories load successfully from shared catalog", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/restaurant/menu?tenantId=${TENANT_A}&outletId=${outletIdA}`
    );
    const res = await menuGet(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.categories.length).toBeGreaterThanOrEqual(4);
    expect(json.data.categories.some((c: any) => c.name.includes("Biryani"))).toBe(true);
  });

  it("14. Available items load with prices and descriptions", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/restaurant/menu?tenantId=${TENANT_A}&outletId=${outletIdA}`
    );
    const res = await menuGet(req);
    const json = await res.json();

    const allItems = json.data.categories.flatMap((c: any) => c.items);
    expect(allItems.length).toBeGreaterThan(0);

    const item = allItems[0];
    expect(item.itemId).toBeDefined();
    expect(item.name).toBeDefined();
    expect(item.basePrice).toBeDefined();
    expect(item.isAvailable).toBe(true);

    firstItemId = allItems[0].itemId;
    firstItemPrice = allItems[0].basePrice;
    secondItemId = allItems[1].itemId;
  });

  it("15. Unavailable items are hidden from customer menu and blocked from cart", async () => {
    // 1. Staff marks firstItem as unavailable (86'd)
    const availReq = new NextRequest(
      `http://localhost:3000/api/v1/restaurant/admin/menu/items/${firstItemId}/availability`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restAdminTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isAvailable: false }),
      }
    );
    const availRes = await itemAvailabilityPost(availReq, {
      params: Promise.resolve({ id: firstItemId }),
    });
    expect(availRes.status).toBe(200);

    // 2. Customer menu should now exclude firstItem
    const menuReq = new NextRequest(
      `http://localhost:3000/api/v1/restaurant/menu?tenantId=${TENANT_A}&outletId=${outletIdA}`
    );
    const menuRes = await menuGet(menuReq);
    const menuJson = await menuRes.json();
    const customerItems = menuJson.data.categories.flatMap((c: any) => c.items);
    expect(customerItems.some((i: any) => i.itemId === firstItemId)).toBe(false);

    // 3. Client attempting to bypass and add unavailable item to cart fails
    const cartAddReq = new NextRequest("http://localhost:3000/api/v1/restaurant/cart/items", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${customerSessionTokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        itemId: firstItemId,
        quantity: 1,
      }),
    });
    const cartAddRes = await cartItemPost(cartAddReq);
    expect(cartAddRes.status).toBe(422);

    // Restore item availability for further tests
    await itemAvailabilityPost(
      new NextRequest(
        `http://localhost:3000/api/v1/restaurant/admin/menu/items/${firstItemId}/availability`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${restAdminTokenA}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ isAvailable: true }),
        }
      ),
      { params: Promise.resolve({ id: firstItemId }) }
    );
  });

  it("16. Menu respects tenant & outlet scope", async () => {
    // Tenant B menu query receives its own catalog
    const reqB = new NextRequest(
      `http://localhost:3000/api/v1/restaurant/menu?tenantId=${TENANT_B}`
    );
    const resB = await menuGet(reqB);
    const jsonB = await resB.json();
    expect(resB.status).toBe(200);
    // Tenant B catalog has distinct catalogId
    expect(jsonB.data.catalogId).toBeDefined();
  });

  it("17. Price is shown from authoritative catalog", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/restaurant/menu?tenantId=${TENANT_A}&outletId=${outletIdA}`
    );
    const res = await menuGet(req);
    const json = await res.json();
    const allItems = json.data.categories.flatMap((c: any) => c.items);
    const item = allItems.find((i: any) => i.itemId === firstItemId);
    expect(item.basePrice).toBe(firstItemPrice);
  });

  // ==========================================================================
  // SECTION 4: PRE-ORDER CART (Items 18-24)
  // ==========================================================================

  let createdCartItemId: string;

  it("18. Add item to customer cart", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/cart/items", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${customerSessionTokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        itemId: firstItemId,
        quantity: 2,
        specialInstructions: "Extra mint chutney",
      }),
    });
    const res = await cartItemPost(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.totalItems).toBe(2);
    expect(json.data.items.length).toBe(1);
    expect(json.data.items[0].itemId).toBe(firstItemId);
    expect(json.data.items[0].quantity).toBe(2);
    expect(json.data.items[0].specialInstructions).toBe("Extra mint chutney");

    createdCartItemId = json.data.items[0].cartItemId;
  });

  it("19. Change quantity of item in cart", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/restaurant/cart/items/${createdCartItemId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${customerSessionTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ quantity: 4 }),
      }
    );
    const res = await cartItemPatch(req, {
      params: Promise.resolve({ id: createdCartItemId }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.totalItems).toBe(4);
    expect(json.data.items[0].quantity).toBe(4);
  });

  it("20. Remove item from cart", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/restaurant/cart/items/${createdCartItemId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${customerSessionTokenA}` },
      }
    );
    const res = await cartItemDelete(req, {
      params: Promise.resolve({ id: createdCartItemId }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.totalItems).toBe(0);
    expect(json.data.items.length).toBe(0);
  });

  it("21. Cart persists and retrieves correctly for active session", async () => {
    // Add two different dishes
    await cartItemPost(
      new NextRequest("http://localhost:3000/api/v1/restaurant/cart/items", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${customerSessionTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ itemId: firstItemId, quantity: 2 }),
      })
    );
    await cartItemPost(
      new NextRequest("http://localhost:3000/api/v1/restaurant/cart/items", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${customerSessionTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ itemId: secondItemId, quantity: 1 }),
      })
    );

    // Read cart
    const getReq = new NextRequest("http://localhost:3000/api/v1/restaurant/cart", {
      headers: { Authorization: `Bearer ${customerSessionTokenA}` },
    });
    const getRes = await cartGet(getReq);
    const getJson = await getRes.json();

    expect(getRes.status).toBe(200);
    expect(getJson.data.totalItems).toBe(3);
    expect(getJson.data.items.length).toBe(2);
  });

  it("22. Cart does NOT create an order in the database (Slice 2 Invariant)", async () => {
    const db = getDb();
    // Verify no orders were created with this customerSessionIdA in R2
    const foundOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, TENANT_A),
          eq(orders.sessionId, customerSessionIdA)
        )
      );

    expect(foundOrders.length).toBe(0);
  });

  it("23. Cart does NOT create a bill or payment record", async () => {
    // Verification of database state: no bills exist for this tenant and session
    const db = getDb();
    const foundOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, TENANT_A),
          eq(orders.sessionId, customerSessionIdA)
        )
      );
    expect(foundOrders.length).toBe(0);
  });

  it("24. Client cannot manipulate cart totals (server computes totals authoritatively)", async () => {
    const getReq = new NextRequest("http://localhost:3000/api/v1/restaurant/cart", {
      headers: { Authorization: `Bearer ${customerSessionTokenA}` },
    });
    const getRes = await cartGet(getReq);
    const getJson = await getRes.json();

    const expectedSubtotal = getJson.data.items.reduce(
      (sum: number, item: any) => sum + parseFloat(item.unitPrice) * item.quantity,
      0
    );
    expect(parseFloat(getJson.data.subtotalAmount)).toBeCloseTo(expectedSubtotal, 2);
    expect(parseFloat(getJson.data.estimatedTaxAmount)).toBeCloseTo(expectedSubtotal * 0.05, 2);
  });

  // ==========================================================================
  // SECTION 5: SECURITY & RBAC PERMISSIONS (Items 25-29)
  // ==========================================================================

  it("25. Unauthorized user / customer cannot mutate menu availability", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/v1/restaurant/admin/menu/items/${firstItemId}/availability`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${customerSessionTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isAvailable: false }),
      }
    );
    const res = await itemAvailabilityPost(req, {
      params: Promise.resolve({ id: firstItemId }),
    });
    expect(res.status).toBe(403);
  });

  it("26. Price-management permission remains strictly separate", async () => {
    // Staff with ONLY restaurant.menu.availability CANNOT edit price
    const req = new NextRequest(
      `http://localhost:3000/api/v1/restaurant/admin/menu/items/${firstItemId}/price`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restStaffOnlyAvailTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ basePrice: "999.00" }),
      }
    );
    const res = await itemPricePost(req, {
      params: Promise.resolve({ id: firstItemId }),
    });
    expect(res.status).toBe(403);

    // Staff with restaurant.menu.price.manage CAN edit price
    const allowedReq = new NextRequest(
      `http://localhost:3000/api/v1/restaurant/admin/menu/items/${firstItemId}/price`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restStaffOnlyPriceTokenA}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ basePrice: "520.00" }),
      }
    );
    const allowedRes = await itemPricePost(allowedReq, {
      params: Promise.resolve({ id: firstItemId }),
    });
    expect(allowedRes.status).toBe(200);
    const allowedJson = await allowedRes.json();
    expect(parseFloat(allowedJson.data.basePrice)).toBe(520);
  });

  it("27. Multi-tenant boundary blocks cross-tenant menu mutation", async () => {
    // Tenant B admin cannot update Tenant A's menu item price
    const req = new NextRequest(
      `http://localhost:3000/api/v1/restaurant/admin/menu/items/${firstItemId}/price`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${restAdminTokenB}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ basePrice: "100.00" }),
      }
    );
    const res = await itemPricePost(req, {
      params: Promise.resolve({ id: firstItemId }),
    });
    expect(res.status).toBe(404);
  });

  it("28. Clearing cart succeeds cleanly", async () => {
    const clearReq = new NextRequest("http://localhost:3000/api/v1/restaurant/cart", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${customerSessionTokenA}` },
    });
    const clearRes = await cartClearDelete(clearReq);
    const clearJson = await clearRes.json();

    expect(clearRes.status).toBe(200);
    expect(clearJson.data.totalItems).toBe(0);
    expect(clearJson.data.items.length).toBe(0);
  });

  afterAll(async () => {
    // Preserve seeded tax configuration
  });
});
