const crypto = require("crypto");
const { execSync } = require("child_process");

const PREVIEW_BASE_URL = process.env.PREVIEW_BASE_URL || "https://asso-super-5fe3zhhgq-sypdersupport1-ui.vercel.app";
const JWT_SECRET = process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("Missing AUTH_JWT_SECRET or JWT_SECRET in environment.");
  process.exit(1);
}
const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const OUTLET_ID = "120276e7-0ecc-4c72-ae51-256599441ffe";

function createJwt(roles = ["HOTEL_ADMIN", "RESTAURANT_MANAGER"], permissions = ["restaurant.*", "hotel.*"]) {
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
  
  // Find where HTTP response headers end and JSON body begins
  const doubleNewline = raw.indexOf("\r\n\r\n");
  const bodyStart = doubleNewline !== -1 ? doubleNewline + 4 : raw.indexOf("\n\n") + 2;
  const bodyStr = raw.slice(bodyStart).trim();
  
  let json = null;
  try {
    json = JSON.parse(bodyStr);
  } catch (e) {
    // If multiple header blocks exist (e.g. from 100 Continue), find the last JSON {
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
  console.log("ASSO R3.5 — VERCEL PREVIEW MUTATION SMOKE TEST (REMOTE E2E)");
  console.log("Target:", PREVIEW_BASE_URL);
  console.log("Tenant:", TENANT_ID);
  console.log("Outlet:", OUTLET_ID);
  console.log("================================================================\n");

  const results = [];
  const testRunId = Date.now().toString().slice(-6);

  // ─── 1. RESERVATION MUTATION LIFECYCLE ───
  console.log("1. Testing Reservation Creation with Idempotency Key...");
  const resIdempKey = `smoke-res-${testRunId}`;
  const resPayload = {
    outletId: OUTLET_ID,
    customerName: `[PREVIEW-SMOKE] Res Test ${testRunId}`,
    customerPhone: "+1555019999",
    customerEmail: "smoke.test@assohospitality.com",
    partySize: 2,
    reservationDate: "2026-11-20",
    reservationTime: "19:00",
    notes: "Non-destructive automated smoke test record",
    source: "STAFF_POS"
  };

  const createRes = vercelCurl("/api/v1/restaurant/reservations", {
    method: "POST",
    token,
    headers: { "idempotency-key": resIdempKey },
    body: resPayload
  });

  console.log("HTTP Status:", createRes.statusCode);
  console.log("Success:", createRes.json?.success);
  console.log("Reservation ID:", createRes.json?.data?.reservationId);
  const reservationId = createRes.json?.data?.reservationId;

  if (createRes.statusCode !== 201 || !reservationId) {
    throw new Error(`Failed to create smoke test reservation: ${createRes.raw}`);
  }
  results.push({ step: "1. Create Reservation", status: "PASS", statusCode: createRes.statusCode, id: reservationId });

  // ─── 2. IDEMPOTENCY REPLAY ───
  console.log("\n2. Testing Reservation Idempotency Replay...");
  const replayRes = vercelCurl("/api/v1/restaurant/reservations", {
    method: "POST",
    token,
    headers: { "idempotency-key": resIdempKey },
    body: resPayload
  });
  console.log("HTTP Status:", replayRes.statusCode);
  console.log("Replayed Reservation ID:", replayRes.json?.data?.reservationId);
  console.log("Replay matched original:", replayRes.json?.data?.reservationId === reservationId);
  const replaySuccess = replayRes.statusCode === 201 && replayRes.json?.data?.reservationId === reservationId;
  results.push({ step: "2. Idempotency Replay", status: replaySuccess ? "PASS" : "FAIL", statusCode: replayRes.statusCode });

  // ─── 3. DB PERSISTENCE & GET VERIFICATION ───
  console.log("\n3. Testing DB Persistence via GET by ID...");
  const getRes = vercelCurl(`/api/v1/restaurant/reservations/${reservationId}?outletId=${OUTLET_ID}`, {
    method: "GET",
    token
  });
  console.log("HTTP Status:", getRes.statusCode);
  console.log("Retrieved Status:", getRes.json?.data?.status);
  const getSuccess = getRes.statusCode === 200 && getRes.json?.data?.status === "CONFIRMED";
  results.push({ step: "3. DB Persistence Verification", status: getSuccess ? "PASS" : "FAIL", statusCode: getRes.statusCode });

  // ─── 4. RESTORATION / CANCELLATION ───
  console.log("\n4. Testing Safe State Restoration via CANCELLED transition...");
  const cancelRes = vercelCurl(`/api/v1/restaurant/reservations/${reservationId}/status`, {
    method: "POST",
    token,
    body: {
      outletId: OUTLET_ID,
      status: "CANCELLED",
      reason: "Automated smoke test cleanup and state restoration"
    }
  });
  console.log("HTTP Status:", cancelRes.statusCode);
  console.log("Updated Status:", cancelRes.json?.data?.status);
  const cancelSuccess = cancelRes.statusCode === 200 && cancelRes.json?.data?.status === "CANCELLED";
  results.push({ step: "4. Reservation State Restoration", status: cancelSuccess ? "PASS" : "FAIL", statusCode: cancelRes.statusCode });

  // ─── 5. WAITLIST MUTATION LIFECYCLE ───
  console.log("\n5. Testing Waitlist Entry Creation with Idempotency Key...");
  const waitIdempKey = `smoke-wait-${testRunId}`;
  const waitPayload = {
    outletId: OUTLET_ID,
    customerName: `[PREVIEW-SMOKE] Wait Test ${testRunId}`,
    customerPhone: "+1555019998",
    partySize: 2,
    estimatedWaitMinutes: 15,
    notes: "Non-destructive automated waitlist smoke test"
  };

  const createWait = vercelCurl("/api/v1/restaurant/waitlist", {
    method: "POST",
    token,
    headers: { "idempotency-key": waitIdempKey },
    body: waitPayload
  });

  console.log("HTTP Status:", createWait.statusCode);
  console.log("Success:", createWait.json?.success);
  console.log("Waitlist ID:", createWait.json?.data?.waitlistId);
  const waitlistId = createWait.json?.data?.waitlistId;

  if (createWait.statusCode !== 201 || !waitlistId) {
    throw new Error(`Failed to create smoke test waitlist entry: ${createWait.raw}`);
  }
  results.push({ step: "5. Create Waitlist Entry", status: "PASS", statusCode: createWait.statusCode, id: waitlistId });

  // ─── 6. WAITLIST IDEMPOTENCY REPLAY ───
  console.log("\n6. Testing Waitlist Idempotency Replay...");
  const replayWait = vercelCurl("/api/v1/restaurant/waitlist", {
    method: "POST",
    token,
    headers: { "idempotency-key": waitIdempKey },
    body: waitPayload
  });
  console.log("HTTP Status:", replayWait.statusCode);
  console.log("Replayed Waitlist ID:", replayWait.json?.data?.waitlistId);
  const waitReplaySuccess = replayWait.statusCode === 201 && replayWait.json?.data?.waitlistId === waitlistId;
  results.push({ step: "6. Waitlist Idempotency Replay", status: waitReplaySuccess ? "PASS" : "FAIL", statusCode: replayWait.statusCode });

  // ─── 7. WAITLIST STATUS ADVANCE (CALLED) ───
  console.log("\n7. Testing Waitlist Status Advance (WAITING -> CALLED)...");
  const callWait = vercelCurl(`/api/v1/restaurant/waitlist/${waitlistId}/status`, {
    method: "POST",
    token,
    body: {
      outletId: OUTLET_ID,
      status: "CALLED"
    }
  });
  console.log("HTTP Status:", callWait.statusCode);
  console.log("Updated Status:", callWait.json?.data?.status);
  const callSuccess = callWait.statusCode === 200 && callWait.json?.data?.status === "CALLED";
  results.push({ step: "7. Waitlist Advance to CALLED", status: callSuccess ? "PASS" : "FAIL", statusCode: callWait.statusCode });

  // ─── 8. WAITLIST RESTORATION / CANCELLATION ───
  console.log("\n8. Testing Waitlist State Restoration via CANCELLED transition...");
  const cancelWait = vercelCurl(`/api/v1/restaurant/waitlist/${waitlistId}/status`, {
    method: "POST",
    token,
    body: {
      outletId: OUTLET_ID,
      status: "CANCELLED"
    }
  });
  console.log("HTTP Status:", cancelWait.statusCode);
  console.log("Final Waitlist Status:", cancelWait.json?.data?.status);
  const cancelWaitSuccess = cancelWait.statusCode === 200 && cancelWait.json?.data?.status === "CANCELLED";
  results.push({ step: "8. Waitlist State Restoration", status: cancelWaitSuccess ? "PASS" : "FAIL", statusCode: cancelWait.statusCode });

  // ─── 9. SAFE ERROR HANDLING & VALIDATION ───
  console.log("\n9. Testing Safe Error Handling (Invalid Party Size)...");
  const invalidRes = vercelCurl("/api/v1/restaurant/reservations", {
    method: "POST",
    token,
    body: {
      outletId: OUTLET_ID,
      customerName: "Invalid Guest",
      customerPhone: "+1555019000",
      partySize: 0, // Invalid: min 1
      reservationDate: "2026-11-20",
      reservationTime: "19:00"
    }
  });
  console.log("HTTP Status:", invalidRes.statusCode);
  const validationSuccess = invalidRes.statusCode === 400 && 
    (invalidRes.json?.error?.code === "VALIDATION_FAILED" || invalidRes.json?.error?.code === "VALIDATION_ERROR");
  results.push({ step: "9. Validation Guard Handling", status: validationSuccess ? "PASS" : "FAIL", statusCode: invalidRes.statusCode });

  // ─── 10. TRANSACTIONAL OUTBOX EVENT VERIFICATION ───
  console.log("\n10. Testing Transactional Outbox Event Generation in Remote DB...");
  const { Client } = require("pg");
  const pgClient = new Client({
    connectionString: "postgresql://postgres.jtixaywlxkfgtgclgcka:i0y6sqwhx6t1JBmV@aws-0-ap-south-1.pooler.supabase.com:5432/postgres",
    ssl: { rejectUnauthorized: false }
  });
  let outboxVerified = false;
  try {
    await pgClient.connect();
    const outboxRes = await pgClient.query(
      "SELECT event_type, aggregate_id, created_at FROM domain_outbox_events WHERE aggregate_id = ANY($1::text[])",
      [[reservationId, waitlistId]]
    );
    console.log("Captured Outbox Events in Remote DB:", outboxRes.rows.map(r => `${r.event_type} (${r.aggregate_id})`));
    outboxVerified = outboxRes.rows.length >= 2;
  } catch (err) {
    console.error("Outbox verification error:", err.message);
  } finally {
    await pgClient.end();
  }
  results.push({ step: "10. Outbox Event Verification", status: outboxVerified ? "PASS" : "FAIL", statusCode: 200 });

  console.log("\n================================================================");
  console.log("VERCEL PREVIEW MUTATION SMOKE TEST SUMMARY");
  console.log("================================================================");
  console.table(results);
}

runSmokeTests().catch(err => {
  console.error("FATAL ERROR during smoke test:", err);
  process.exit(1);
});

