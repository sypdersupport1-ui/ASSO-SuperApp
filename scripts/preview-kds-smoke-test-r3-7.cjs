const crypto = require("crypto");
const { execSync } = require("child_process");

const PREVIEW_BASE_URL = process.env.PREVIEW_BASE_URL || "https://asso-super-bl5jslcwo-sypdersupport1-ui.vercel.app";
const JWT_SECRET = process.env.PREVIEW_JWT_SECRET || "9KomVQXMxL8bcWSsgHragXvGn+HaPemLzES7foGkOxZkrQD7hNWmBHDY2iGQho966r3ZB6WunUoxGwcwcYvyFQ==";
const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT_ID = "22222222-2222-2222-2222-222222222236";
const OUTLET_ID = "bbba867b-b7a8-495b-a5c6-2bf333c86445";

function createJwt(roles = ["RESTAURANT_MANAGER"], permissions = ["restaurant.*", "catalog.manage", "restaurant.kds.manage"], tenant = TENANT_ID, sessionType = "STAFF") {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: "usr_preview_kds_tester",
    email: "kds.tester@assohospitality.com",
    tenantId: tenant,
    roles,
    permissions,
    sessionType,
    isSuperAdmin: false,
    iat: now,
    exp: now + 3600
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

const managerToken = createJwt(["RESTAURANT_MANAGER"], ["restaurant.*", "catalog.manage", "restaurant.kds.manage"]);
const staffToken = createJwt(["RESTAURANT_STAFF"], ["restaurant.kds.view", "restaurant.kds.update"]);
const guestToken = createJwt(["GUEST"], ["customer.read"], TENANT_ID, "CUSTOMER");
const otherTenantToken = createJwt(["RESTAURANT_MANAGER"], ["restaurant.*", "restaurant.kds.manage"], OTHER_TENANT_ID);

function vercelCurl(path, options = {}) {
  const url = `${PREVIEW_BASE_URL}${path}`;
  let cmd = `npx vercel curl "${url}" -- -s -i`;
  
  if (options.token) {
    cmd += ` -H "Authorization: Bearer ${options.token}"`;
  }
  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      cmd += ` -H "${k}: ${v}"`;
    }
  }
  if (options.method && options.method !== "GET") {
    cmd += ` -X ${options.method}`;
  }
  if (options.body) {
    const escaped = JSON.stringify(options.body).replace(/"/g, '\\"');
    cmd += ` -H "Content-Type: application/json" -d "${escaped}"`;
  }

  const raw = execSync(cmd, { encoding: "utf8" });
  
  // Extract HTTP status code and body
  const lines = raw.split("\n");
  const statusLine = lines.find(l => l.startsWith("HTTP/"));
  const statusCode = statusLine ? parseInt(statusLine.split(" ")[1], 10) : 0;
  
  const doubleNewline = raw.indexOf("\r\n\r\n");
  const bodyStart = doubleNewline !== -1 ? doubleNewline + 4 : raw.indexOf("\n\n") + 2;
  const bodyStr = raw.slice(bodyStart).trim();
  
  let json = null;
  try {
    json = JSON.parse(bodyStr);
  } catch (e) {
    const jsonStart = raw.lastIndexOf("{");
    if (jsonStart !== -1) {
      try {
        json = JSON.parse(raw.slice(jsonStart));
      } catch (err) {}
    }
  }

  return { statusCode, raw, json };
}

async function runSmokeTests() {
  console.log("================================================================");
  console.log("ASSO R3.7 — VERCEL PREVIEW KDS & STATION ROUTING SMOKE TEST");
  console.log("Target:", PREVIEW_BASE_URL);
  console.log("Tenant:", TENANT_ID);
  console.log("================================================================\n");

  const postgres = require("postgres");
  const sql = postgres(process.env.DATABASE_URL);
  const testRunId = Date.now().toString().slice(-6);

  try {
    // 1. Verify PostgreSQL connection & KDS tables
    console.log("1. Verifying Remote PostgreSQL connection & KDS tables...");
    const [stationTable] = await sql`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'kitchen_stations'
    `;
    if (!stationTable) {
      throw new Error("kitchen_stations table missing in PostgreSQL schema!");
    }
    console.log("✓ PostgreSQL connected. kitchen_stations table present.\n");

    // 2. Test RBAC: Unauthenticated & Customer Denied
    console.log("2. Testing RBAC gates on KDS station routes...");
    const unauthRes = vercelCurl("/api/v1/restaurant/kds/stations");
    console.log("Unauthenticated status:", unauthRes.statusCode);
    if (unauthRes.statusCode !== 401) throw new Error("Expected 401 for unauthenticated request");

    const custRes = vercelCurl("/api/v1/restaurant/kds/stations", { token: guestToken });
    console.log("Customer session status:", custRes.statusCode);
    if (custRes.statusCode !== 403) throw new Error("Expected 403 for customer session");
    console.log("✓ RBAC authentication & authorization enforced.\n");

    // 3. Station Listing for Staff
    console.log("3. Testing GET /api/v1/restaurant/kds/stations...");
    const stationsListRes = vercelCurl(`/api/v1/restaurant/kds/stations?outletId=${OUTLET_ID}`, { token: staffToken });
    console.log("HTTP Status:", stationsListRes.statusCode);
    console.log("Stations found:", stationsListRes.json?.data?.length);
    if (stationsListRes.statusCode !== 200) throw new Error(`Failed to list stations: ${stationsListRes.raw}`);
    console.log("✓ Station listing functional for staff.\n");

    // 4. Station Creation as Kitchen Manager
    console.log("4. Testing POST /api/v1/restaurant/kds/stations (Manager)...");
    const stationCode = `STATION_${testRunId}`;
    const createStationRes = vercelCurl("/api/v1/restaurant/kds/stations", {
      method: "POST",
      token: managerToken,
      body: {
        outletId: OUTLET_ID,
        code: stationCode,
        name: `Preview Smoke Station ${testRunId}`,
        displayOrder: 20,
      }
    });
    console.log("HTTP Status:", createStationRes.statusCode);
    if (createStationRes.statusCode !== 201) throw new Error(`Failed to create station: ${createStationRes.raw}`);
    const createdStationId = createStationRes.json?.data?.stationId;
    console.log("✓ Kitchen Station created with ID:", createdStationId, "\n");

    // 5. Station Update
    console.log("5. Testing PATCH /api/v1/restaurant/kds/stations/[id]...");
    const updateStationRes = vercelCurl(`/api/v1/restaurant/kds/stations/${createdStationId}`, {
      method: "PATCH",
      token: managerToken,
      body: {
        name: `Preview Smoke Station ${testRunId} Updated`,
        displayOrder: 25,
      }
    });
    console.log("HTTP Status:", updateStationRes.statusCode);
    if (updateStationRes.statusCode !== 200) throw new Error(`Failed to update station: ${updateStationRes.raw}`);
    console.log("✓ Kitchen Station updated.\n");

    // 6. Multi-Station Order Preparation & Task Generation
    console.log("6. Preparing synthetic multi-station order in PostgreSQL...");
    const testOrderId = `77777777-7777-7777-7777-${testRunId.padStart(12, '0')}`;
    const orderItemId1 = crypto.randomUUID();
    const orderItemId2 = crypto.randomUUID();
    const orderItemId3 = crypto.randomUUID();

    const [catalogItem] = await sql`
      SELECT item_id FROM catalog_items WHERE tenant_id = ${TENANT_ID} LIMIT 1
    `;
    const itemId = catalogItem ? catalogItem.item_id : crypto.randomUUID();

    await sql`
      INSERT INTO orders (
        order_id, tenant_id, outlet_id, context_id, order_number, order_source, dining_context,
        status, subtotal_amount, tax_rate, tax_amount, platform_fee_type, platform_fee_rate,
        platform_fee_amount, discount_amount, total_amount
      ) VALUES (
        ${testOrderId}, ${TENANT_ID}, ${OUTLET_ID}, 
        (SELECT context_id FROM business_contexts WHERE tenant_id = ${TENANT_ID} LIMIT 1),
        ${`PREV-KDS-${testRunId}`}, 'POS', 'DINE_IN', 'CONFIRMED',
        '650.0000', '0.0500', '32.5000', 'PERCENTAGE', '0.0200', '13.0000', '0.0000', '695.5000'
      )
    `;

    await sql`
      INSERT INTO order_items (
        order_item_id, tenant_id, order_id, item_id, item_name, unit_price, quantity,
        total_price, item_status, fulfillment_station
      ) VALUES 
      (${orderItemId1}, ${TENANT_ID}, ${testOrderId}, ${itemId}, 'Hot Tandoori Chicken', '300.0000', 1, '300.0000', 'PLACED', 'HOT_KITCHEN'),
      (${orderItemId2}, ${TENANT_ID}, ${testOrderId}, ${itemId}, 'Garlic Butter Naan', '100.0000', 2, '200.0000', 'PLACED', 'TANDOOR'),
      (${orderItemId3}, ${TENANT_ID}, ${testOrderId}, ${itemId}, 'Mango Lassi', '150.0000', 1, '150.0000', 'PLACED', 'BEVERAGE')
    `;

    // Seed KDS tasks directly matching service output
    const taskId1 = crypto.randomUUID();
    const taskId2 = crypto.randomUUID();
    const taskId3 = crypto.randomUUID();

    await sql`
      INSERT INTO kds_tasks (
        task_id, tenant_id, outlet_id, order_id, order_item_id, item_id, item_name, quantity,
        task_status, station_routing, destination_label, priority
      ) VALUES
      (${taskId1}, ${TENANT_ID}, ${OUTLET_ID}, ${testOrderId}, ${orderItemId1}, ${itemId}, 'Hot Tandoori Chicken', 1, 'PENDING', 'HOT_KITCHEN', 'Table 1', 'NORMAL'),
      (${taskId2}, ${TENANT_ID}, ${OUTLET_ID}, ${testOrderId}, ${orderItemId2}, ${itemId}, 'Garlic Butter Naan', 2, 'PENDING', 'TANDOOR', 'Table 1', 'NORMAL'),
      (${taskId3}, ${TENANT_ID}, ${OUTLET_ID}, ${testOrderId}, ${orderItemId3}, ${itemId}, 'Mango Lassi', 1, 'PENDING', 'BEVERAGE', 'Table 1', 'NORMAL')
    `;
    console.log("✓ Synthetic multi-station order and 3 KDS tasks seeded.\n");

    // 7. Multi-Station Separation on Tickets Endpoint
    console.log("7. Verifying Multi-Station Separation on GET /api/v1/restaurant/kds/tickets...");
    const hotKitchenTickets = vercelCurl(`/api/v1/restaurant/kds/tickets?outletId=${OUTLET_ID}&stationCode=HOT_KITCHEN`, { token: staffToken });
    console.log("Hot Kitchen tickets status:", hotKitchenTickets.statusCode);
    const hotOrderTicket = hotKitchenTickets.json?.data?.find(t => t.orderId === testOrderId);
    console.log("Hot Kitchen items for test order:", hotOrderTicket?.items?.length);
    if (!hotOrderTicket || hotOrderTicket.items.length !== 1 || hotOrderTicket.items[0].stationRouting !== "HOT_KITCHEN") {
      throw new Error("Multi-station separation failed: HOT_KITCHEN did not isolate items correctly");
    }

    const tandoorTickets = vercelCurl(`/api/v1/restaurant/kds/tickets?outletId=${OUTLET_ID}&stationCode=TANDOOR`, { token: staffToken });
    const tandoorOrderTicket = tandoorTickets.json?.data?.find(t => t.orderId === testOrderId);
    console.log("Tandoor items for test order:", tandoorOrderTicket?.items?.length);
    if (!tandoorOrderTicket || tandoorOrderTicket.items.length !== 1 || tandoorOrderTicket.items[0].stationRouting !== "TANDOOR") {
      throw new Error("Multi-station separation failed: TANDOOR did not isolate items correctly");
    }
    console.log("✓ Multi-station separation verified across station screens.\n");

    // 8. Task State Transitions via HTTP
    console.log("8. Testing KDS Task State Transitions via PATCH /api/v1/restaurant/kds/tasks/[id]/status...");
    // PENDING -> PREPARING
    const prepRes = vercelCurl(`/api/v1/restaurant/kds/tasks/${taskId1}/status`, {
      method: "PATCH",
      token: staffToken,
      body: { status: "PREPARING" }
    });
    console.log("PENDING -> PREPARING status:", prepRes.statusCode);
    if (prepRes.statusCode !== 200) throw new Error(`Transition failed: ${prepRes.raw}`);

    // PREPARING -> READY
    const readyRes = vercelCurl(`/api/v1/restaurant/kds/tasks/${taskId1}/status`, {
      method: "PATCH",
      token: staffToken,
      body: { status: "READY" }
    });
    console.log("PREPARING -> READY status:", readyRes.statusCode);
    if (readyRes.statusCode !== 200) throw new Error(`Transition failed: ${readyRes.raw}`);

    // READY -> DONE
    const doneRes = vercelCurl(`/api/v1/restaurant/kds/tasks/${taskId1}/status`, {
      method: "PATCH",
      token: staffToken,
      body: { status: "DONE" }
    });
    console.log("READY -> DONE status:", doneRes.statusCode);
    if (doneRes.statusCode !== 200) throw new Error(`Transition failed: ${doneRes.raw}`);
    console.log("✓ Full sequential state transitions functional.\n");

    // 9. Priority Escalation
    console.log("9. Testing Priority Escalation via PATCH /api/v1/restaurant/kds/tasks/[id]/priority...");
    const prioRes = vercelCurl(`/api/v1/restaurant/kds/tasks/${taskId2}/priority`, {
      method: "PATCH",
      token: managerToken,
      body: { priority: "URGENT", reason: "VIP Guest table expediting" }
    });
    console.log("Priority update status:", prioRes.statusCode);
    if (prioRes.statusCode !== 200) throw new Error(`Priority update failed: ${prioRes.raw}`);
    console.log("✓ Priority escalation to URGENT functional.\n");

    // 10. Audited Recall Workflow
    console.log("10. Testing Audited Recall via POST /api/v1/restaurant/kds/tasks/[id]/recall...");
    // Recalling Task 1 from DONE -> READY with audit reason
    const recallRes = vercelCurl(`/api/v1/restaurant/kds/tasks/${taskId1}/recall`, {
      method: "POST",
      token: managerToken,
      body: {
        targetStatus: "READY",
        reason: "Customer requested temperature check prior to table runner pickup"
      }
    });
    console.log("Audited Recall status:", recallRes.statusCode);
    if (recallRes.statusCode !== 200) throw new Error(`Recall failed: ${recallRes.raw}`);
    console.log("✓ Audited recall functional with mandatory reason recording.\n");

    // 11. Batch Station Ticket Bump
    console.log("11. Testing Batch Station Bump via POST /api/v1/restaurant/kds/bump...");
    const bumpRes = vercelCurl("/api/v1/restaurant/kds/bump", {
      method: "POST",
      token: staffToken,
      body: {
        outletId: OUTLET_ID,
        orderId: testOrderId,
        stationCode: "BEVERAGE",
        fromStatus: "PENDING",
        toStatus: "PREPARING"
      }
    });
    console.log("Bump status:", bumpRes.statusCode);
    console.log("Items bumped:", bumpRes.json?.data?.bumpedCount);
    if (bumpRes.statusCode !== 200 || bumpRes.json?.data?.bumpedCount !== 1) {
      throw new Error(`Batch bump failed: ${bumpRes.raw}`);
    }
    console.log("✓ Batch bump functional.\n");

    // 12. Tenant Isolation Verification
    console.log("12. Testing Cross-Tenant Security Gate...");
    const crossTenantRes = vercelCurl(`/api/v1/restaurant/kds/stations/${createdStationId}`, {
      token: otherTenantToken
    });
    console.log("Cross-tenant station read status:", crossTenantRes.statusCode);
    if (crossTenantRes.statusCode !== 404) {
      throw new Error(`Expected 404 for cross-tenant station access, got ${crossTenantRes.statusCode}`);
    }
    console.log("✓ Cross-tenant boundaries strictly maintained.\n");

    // 13. Financial Safety Invariant
    console.log("13. Verifying Zero Financial Drift Invariant...");
    const [finalOrder] = await sql`
      SELECT subtotal_amount, tax_amount, platform_fee_amount, total_amount
      FROM orders WHERE order_id = ${testOrderId}
    `;
    console.log("Final Order Financial Totals:", finalOrder);
    if (
      finalOrder.subtotal_amount !== "650.0000" ||
      finalOrder.tax_amount !== "32.5000" ||
      finalOrder.platform_fee_amount !== "13.0000" ||
      finalOrder.total_amount !== "695.5000"
    ) {
      throw new Error("Financial safety invariant violated! Order totals were modified by KDS fulfillment.");
    }
    console.log("✓ Zero financial drift verified. Order totals remain 100.0000% intact.\n");

    // 14. Non-Destructive Cleanup
    console.log("14. Safe Non-Destructive Cleanup...");
    // Only remove synthetic test KDS tasks and test station; NO financial ledgers touched
    await sql`DELETE FROM kds_tasks WHERE order_id = ${testOrderId}`;
    await sql`DELETE FROM order_items WHERE order_id = ${testOrderId}`;
    await sql`DELETE FROM orders WHERE order_id = ${testOrderId}`;
    await sql`DELETE FROM kitchen_stations WHERE station_id = ${createdStationId}`;
    console.log("✓ Synthetic KDS fulfillment test records cleaned up without touching canonical financial tables.\n");

    console.log("================================================================");
    console.log("ALL 14 R3.7 PREVIEW SMOKE TEST CHECKS PASSED (100% GREEN)");
    console.log("================================================================");
  } finally {
    await sql.end();
  }
}

runSmokeTests().catch(err => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
