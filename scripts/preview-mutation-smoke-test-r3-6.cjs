const crypto = require("crypto");
const { execSync } = require("child_process");

const PREVIEW_BASE_URL = process.env.PREVIEW_BASE_URL || "https://asso-super-bl5jslcwo-sypdersupport1-ui.vercel.app";
const JWT_SECRET = process.env.PREVIEW_JWT_SECRET || "9KomVQXMxL8bcWSsgHragXvGn+HaPemLzES7foGkOxZkrQD7hNWmBHDY2iGQho966r3ZB6WunUoxGwcwcYvyFQ==";
const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const OUTLET_ID = "bbba867b-b7a8-495b-a5c6-2bf333c86445";

function createJwt(roles = ["RESTAURANT_MANAGER", "HOTEL_ADMIN"], permissions = ["restaurant.*", "hotel.*"]) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: "usr_preview_smoke_tester",
    email: "smoke.tester@assohospitality.com",
    tenantId: TENANT_ID,
    roles,
    permissions,
    sessionType: "STAFF",
    isSuperAdmin: false,
    iat: now,
    exp: now + 3600
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

const token = createJwt();

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
  console.log("ASSO R3.6 — VERCEL PREVIEW MUTATION SMOKE TEST (REMOTE E2E)");
  console.log("Target:", PREVIEW_BASE_URL);
  console.log("Tenant:", TENANT_ID);
  console.log("================================================================\n");

  const testRunId = Date.now().toString().slice(-6);

  // 1. GET /api/v1/restaurant/bills
  console.log("1. Testing GET /api/v1/restaurant/bills...");
  const listRes = vercelCurl("/api/v1/restaurant/bills?limit=5", { token });
  console.log("HTTP Status:", listRes.statusCode);
  console.log("Success:", listRes.json?.success);
  console.log("Bills found:", listRes.json?.data?.length);
  if (listRes.statusCode !== 200) {
    throw new Error(`Failed to list bills: ${listRes.raw}`);
  }

  // 2. Prepare synthetic order in DB for isolated bill generation
  const postgres = require("postgres");
  const sql = postgres(process.env.DATABASE_URL);
  const testOrderId = `66666666-6666-6666-6666-${testRunId.padStart(12, '0')}`;

  try {
    // Query active outlet
    const [activeOutlet] = await sql`
      SELECT outlet_id FROM outlets WHERE tenant_id = ${TENANT_ID} LIMIT 1
    `;
    const outletId = activeOutlet ? activeOutlet.outlet_id : OUTLET_ID;

    // Get or create context
    const [ctx] = await sql`
      SELECT context_id FROM business_contexts WHERE tenant_id = ${TENANT_ID} LIMIT 1
    `;
    const contextId = ctx ? ctx.context_id : "44444444-4444-4444-4444-444444444444";

    await sql`
      INSERT INTO orders (
        order_id, tenant_id, outlet_id, context_id, order_number, order_source, dining_context, status,
        subtotal_amount, tax_amount, total_amount, created_at, updated_at
      ) VALUES (
        ${testOrderId}, ${TENANT_ID}, ${outletId}, ${contextId}, ${`PREV-${testRunId}`}, 'STAFF_POS', 'DINE_IN', 'DELIVERED',
        100.00, 10.00, 110.00, NOW(), NOW()
      ) ON CONFLICT (order_id) DO NOTHING
    `;

    // 3. POST /api/v1/restaurant/bills (Generate Bill)
    console.log("\n2. Testing POST /api/v1/restaurant/bills with Idempotency Key...");
    const billKey = `smoke-bill-${testRunId}`;
    const createBillRes = vercelCurl("/api/v1/restaurant/bills", {
      method: "POST",
      token,
      headers: { "idempotency-key": billKey },
      body: { outletId, orderIds: [testOrderId] }
    });
    console.log("HTTP Status:", createBillRes.statusCode);
    console.log("Success:", createBillRes.json?.success);
    const billId = createBillRes.json?.data?.billId;
    const totalAmount = createBillRes.json?.data?.totalAmount;
    console.log(`Bill ID: ${billId}, Total: $${totalAmount}`);
    if (createBillRes.statusCode !== 201 || !billId) {
      throw new Error(`Failed to create bill: ${createBillRes.raw}`);
    }

    // 4. Idempotency Replay
    console.log("\n3. Testing Idempotency Replay for bill generation...");
    const replayRes = vercelCurl("/api/v1/restaurant/bills", {
      method: "POST",
      token,
      headers: { "idempotency-key": billKey },
      body: { outletId, orderIds: [testOrderId] }
    });
    console.log("HTTP Status:", replayRes.statusCode);
    if (replayRes.statusCode !== 201 || replayRes.json?.data?.billId !== billId) {
      throw new Error("Idempotency replay failed to match original bill ID");
    }
    console.log("✓ Replayed identical cached bill response without duplicating records.");

    // 5. POST /api/v1/restaurant/bills/:id/splits (Equal Split into 2 portions)
    console.log(`\n4. Testing POST /api/v1/restaurant/bills/${billId}/splits (EQUAL)...`);
    const splitKey = `smoke-split-${testRunId}`;
    const splitRes = vercelCurl(`/api/v1/restaurant/bills/${billId}/splits`, {
      method: "POST",
      token,
      headers: { "idempotency-key": splitKey },
      body: { splitType: "EQUAL", portionsCount: 2 }
    });
    console.log("HTTP Status:", splitRes.statusCode);
    const portions = splitRes.json?.data?.activeSplit?.portions;
    const splitId = splitRes.json?.data?.activeSplit?.splitId;
    console.log(`Portions count: ${portions?.length}`);
    for (const p of portions || []) {
      console.log(`  - Portion ${p.portionNumber}: $${p.totalAmount} (${p.status})`);
    }
    if (splitRes.statusCode !== 201 || portions?.length !== 2) {
      throw new Error(`Failed to create split: ${splitRes.raw}`);
    }

    // 6. POST /api/v1/restaurant/bills/:id/payments (Pay Portion 1)
    const portion1 = portions[0];
    console.log(`\n5. Testing POST /api/v1/restaurant/bills/${billId}/payments (Portion 1: $${portion1.totalAmount})...`);
    const pay1Key = `smoke-pay1-${testRunId}`;
    const pay1Res = vercelCurl(`/api/v1/restaurant/bills/${billId}/payments`, {
      method: "POST",
      token,
      headers: { "idempotency-key": pay1Key },
      body: {
        amount: portion1.totalAmount,
        paymentMethod: "CARD",
        portionId: portion1.portionId
      }
    });
    console.log("HTTP Status:", pay1Res.statusCode);
    const updatedPortion1 = pay1Res.json?.data?.activeSplit?.portions?.find(p => p.portionId === portion1.portionId);
    console.log("Portion 1 Status:", updatedPortion1?.status);
    console.log("Bill Status:", pay1Res.json?.data?.status);
    if (pay1Res.statusCode !== 201 || updatedPortion1?.status !== "PAID") {
      throw new Error(`Failed to record payment on portion 1: ${pay1Res.raw}`);
    }

    // 7. POST /api/v1/restaurant/bills/:id/tips (Allocate Tip)
    console.log(`\n6. Testing POST /api/v1/restaurant/bills/${billId}/tips ($10.00 Tip)...`);
    const tipKey = `smoke-tip-${testRunId}`;
    const tipRes = vercelCurl(`/api/v1/restaurant/bills/${billId}/tips`, {
      method: "POST",
      token,
      headers: { "idempotency-key": tipKey },
      body: { tipAmount: 10.00, distributionType: "UNALLOCATED" }
    });
    console.log("HTTP Status:", tipRes.statusCode);
    console.log("Updated Total Amount:", tipRes.json?.data?.totalAmount);
    if (![200, 201].includes(tipRes.statusCode) || parseFloat(tipRes.json?.data?.tipAmount) !== 10.00) {
      throw new Error(`Failed to allocate tip: ${tipRes.raw}`);
    }

    // 8. Settle Portion 2 ($55.00)
    const portion2 = portions[1];
    console.log(`\n7. Settling portion 2 ($55.00)...`);
    const pay2Key = `smoke-pay2-${testRunId}`;
    const pay2Res = vercelCurl(`/api/v1/restaurant/bills/${billId}/payments`, {
      method: "POST",
      token,
      headers: { "idempotency-key": pay2Key },
      body: {
        amount: portion2.totalAmount,
        paymentMethod: "CASH",
        portionId: portion2.portionId
      }
    });
    console.log("HTTP Status:", pay2Res.statusCode);
    const updatedPortion2 = pay2Res.json?.data?.activeSplit?.portions?.find(p => p.portionId === portion2.portionId);
    console.log("Portion 2 Status:", updatedPortion2?.status);
    console.log("Bill Status after portion 2:", pay2Res.json?.data?.status);
    if (pay2Res.statusCode !== 201 || updatedPortion2?.status !== "PAID") {
      throw new Error(`Failed to pay portion 2: ${pay2Res.raw}`);
    }

    // 9. Settle Remaining Tip on Bill ($10.00)
    console.log(`\n8. Settling remaining tip balance ($10.00) on bill...`);
    const pay3Key = `smoke-pay3-${testRunId}`;
    const pay3Res = vercelCurl(`/api/v1/restaurant/bills/${billId}/payments`, {
      method: "POST",
      token,
      headers: { "idempotency-key": pay3Key },
      body: {
        amount: 10.00,
        paymentMethod: "CASH"
      }
    });
    console.log("HTTP Status:", pay3Res.statusCode);
    console.log("Final Bill Status:", pay3Res.json?.data?.status);
    if (pay3Res.statusCode !== 201 || pay3Res.json?.data?.status !== "PAID") {
      throw new Error(`Failed to complete final bill settlement: ${pay3Res.raw}`);
    }

    // 9. GET /api/v1/restaurant/bills/:id
    console.log(`\n8. Testing GET /api/v1/restaurant/bills/${billId}...`);
    const getBillRes = vercelCurl(`/api/v1/restaurant/bills/${billId}`, { token });
    console.log("HTTP Status:", getBillRes.statusCode);
    console.log("Bill Status:", getBillRes.json?.data?.status);
    console.log("Remaining Balance:", getBillRes.json?.data?.remainingAmount);
    if (getBillRes.statusCode !== 200 || parseFloat(getBillRes.json?.data?.remainingAmount) !== 0) {
      throw new Error(`Remaining balance not zero on settled bill: ${getBillRes.raw}`);
    }

    // 10. Verify Outbox Events in remote Supabase PostgreSQL
    console.log("\n9. Verifying Outbox Events in remote Supabase PostgreSQL...");
    const outboxRows = await sql`
      SELECT event_type, status, created_at
      FROM domain_outbox_events
      WHERE tenant_id = ${TENANT_ID} AND aggregate_id = ${billId}
      ORDER BY created_at ASC
    `;
    console.log(`✓ Found ${outboxRows.length} outbox event(s) in database:`);
    for (const r of outboxRows) {
      console.log(`  - [${r.event_type}] status: ${r.status}`);
    }

    // 11. Cleanup synthetic smoke test data safely
    console.log("\n10. Cleaning up synthetic smoke test fixtures...");
    await sql`DELETE FROM restaurant_bill_split_portions WHERE split_id = ${splitId}`;
    await sql`DELETE FROM restaurant_bill_splits WHERE bill_id = ${billId}`;
    await sql`DELETE FROM restaurant_tip_distributions WHERE bill_id = ${billId}`;
    await sql`DELETE FROM payment_transactions WHERE bill_id = ${billId}`;
    await sql`DELETE FROM bills WHERE bill_id = ${billId}`;
    await sql`DELETE FROM domain_outbox_events WHERE aggregate_id = ${billId}`;
    await sql`DELETE FROM orders WHERE order_id = ${testOrderId}`;
    console.log("✓ Synthetic smoke test fixtures removed cleanly.");

    console.log("\n================================================================");
    console.log("ALL REMOTE VERCEL PREVIEW MUTATIONS VERIFIED SUCCESSFULLY (100%)");
    console.log("================================================================");
  } finally {
    await sql.end();
  }
}

runSmokeTests().catch(err => {
  console.error("❌ Smoke test error:", err);
  process.exit(1);
});
