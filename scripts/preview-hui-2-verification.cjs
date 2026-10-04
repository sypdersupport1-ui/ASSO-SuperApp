/**
 * ASSO HUI-2 — Vercel Preview Verification Script
 * Validates all 10 minimum requirements against the active Vercel Preview deployment:
 * https://asso-super-n5bp4gbui-sypdersupport1-ui.vercel.app
 */
const crypto = require("crypto");
const { execSync } = require("child_process");

const PREVIEW_BASE_URL = process.env.PREVIEW_BASE_URL || "https://asso-super-n5bp4gbui-sypdersupport1-ui.vercel.app";
const JWT_SECRET = process.env.PREVIEW_JWT_SECRET || "9KomVQXMxL8bcWSsgHragXvGn+HaPemLzES7foGkOxZkrQD7hNWmBHDY2iGQho966r3ZB6WunUoxGwcwcYvyFQ==";

// Tenant IDs
const TENANT_WITH_HOTEL = "11111111-1111-1111-1111-111111111111"; // Entitled to Hotel & Restaurant
const TENANT_NO_HOTEL = "33333333-3333-3333-3333-333333333333";   // Restaurant only, NO hotel entitlement

function signJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    iat: now,
    exp: now + 3600,
    ...payload,
  };
  const body = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

const hotelStaffToken = signJwt({
  sub: "usr_hotel_staff_preview",
  email: "staff@assohospitality.com",
  tenantId: TENANT_WITH_HOTEL,
  roles: ["HOTEL_ADMIN"],
  permissions: ["hotel.*"],
  sessionType: "STAFF",
  isSuperAdmin: false,
});

const noHotelAdminToken = signJwt({
  sub: "usr_no_hotel",
  email: "nohotel@assohospitality.com",
  tenantId: TENANT_NO_HOTEL,
  roles: ["STAFF"],
  permissions: ["restaurant.*"],
  sessionType: "STAFF",
  isSuperAdmin: false,
});

function vercelCurl(path, options = {}) {
  const url = `${PREVIEW_BASE_URL}${path}`;
  let cmd = `npx vercel curl "${url}" -- -s -i`;
  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      cmd += ` -H "${k}: ${v}"`;
    }
  }
  if (options.token) {
    cmd += ` -H "Authorization: Bearer ${options.token}"`;
  }
  if (options.method && options.method !== "GET") {
    cmd += ` -X ${options.method}`;
  }
  if (options.body) {
    cmd += ` -H "Content-Type: application/json" -d '${JSON.stringify(options.body)}'`;
  }

  try {
    const raw = execSync(cmd, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    const splitIndex = raw.indexOf("\r\n\r\n") !== -1 ? raw.indexOf("\r\n\r\n") : raw.indexOf("\n\n");
    let headerText = "";
    let bodyText = "";
    if (splitIndex !== -1) {
      headerText = raw.substring(0, splitIndex);
      bodyText = raw.substring(splitIndex).trim();
    } else {
      bodyText = raw;
    }

    const statusMatch = headerText.match(/HTTP\/[12\.]+ (\d+)/i) || raw.match(/HTTP\/[12\.]+ (\d+)/i);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;

    let json = null;
    try {
      json = JSON.parse(bodyText);
    } catch {
      // not JSON
    }

    return { status, headerText, bodyText, json };
  } catch (err) {
    return { status: 500, error: err.message, bodyText: "" };
  }
}

async function runVerification() {
  console.log("=================================================================");
  console.log("  ASSO HUI-2 — VERCEL PREVIEW VERIFICATION SUITE                 ");
  console.log("  Target: " + PREVIEW_BASE_URL);
  console.log("=================================================================\n");

  const results = [];
  function record(id, name, pass, detail) {
    results.push({ id, name, pass, detail });
    const status = pass ? "✓ PASS" : "✗ FAIL";
    console.log(`[${status}] Check ${id}: ${name}`);
    if (detail) console.log(`       → ${detail}`);
  }

  // 1. Dashboard Command Center UI Route
  const r1 = vercelCurl("/hotel");
  const pass1 = r1.status === 200 && r1.bodyText.includes("Command Center");
  record(1, "Hotel Dashboard Command Center Route (/hotel)", pass1, `Status: ${r1.status}, contains 'Command Center': ${pass1}`);

  // 2. Room Rack & Density Control UI Route
  const r2 = vercelCurl("/hotel/rooms");
  const pass2 = r2.status === 200 && (r2.bodyText.includes("Room Rack") || r2.bodyText.includes("Comfortable") || r2.bodyText.includes("Compact"));
  record(2, "Room Rack & Density Toggle Route (/hotel/rooms)", pass2, `Status: ${r2.status}`);

  // 3. Reservations Admin List UI Route
  const r3 = vercelCurl("/hotel/reservations");
  const pass3 = r3.status === 200 && r3.bodyText.includes("Reservations");
  record(3, "Reservations Management Route (/hotel/reservations)", pass3, `Status: ${r3.status}`);

  // 4. Guest Directory UI Route
  const r4 = vercelCurl("/hotel/guests");
  const pass4 = r4.status === 200 && r4.bodyText.includes("Guest");
  record(4, "Guest Directory Route (/hotel/guests)", pass4, `Status: ${r4.status}`);

  // 5. Front Office & Walk-in Check-in UI Route
  const r5 = vercelCurl("/hotel/front-office");
  const pass5 = r5.status === 200 && r5.bodyText.includes("Front Desk") && r5.bodyText.includes("Walk-in Check-in");
  record(5, "Front Office & Walk-in Wizard Route (/hotel/front-office)", pass5, `Status: ${r5.status}`);

  // 6. Housekeeping Management UI Route
  const r6 = vercelCurl("/hotel/housekeeping");
  const pass6 = r6.status === 200 && r6.bodyText.includes("Housekeeping");
  record(6, "Housekeeping Operations Route (/hotel/housekeeping)", pass6, `Status: ${r6.status}`);

  // 7. Maintenance Management UI Route
  const r7 = vercelCurl("/hotel/maintenance");
  const pass7 = r7.status === 200 && r7.bodyText.includes("Maintenance");
  record(7, "Engineering & Maintenance Route (/hotel/maintenance)", pass7, `Status: ${r7.status}`);

  // 8. Room Service Kitchen/Order Queue UI Route
  const r8 = vercelCurl("/hotel/room-service");
  const pass8 = r8.status === 200 && (r8.bodyText.includes("Room Service") || r8.bodyText.includes("room-service"));
  record(8, "Room Service Dispatch Route (/hotel/room-service)", pass8, `Status: ${r8.status}`);

  // 9. Active Stays & Folio Drilldowns UI Route
  const r9 = vercelCurl("/hotel/stays");
  const pass9 = r9.status === 200 && (r9.bodyText.includes("Stays") || r9.bodyText.includes("stays"));
  record(9, "Active Stays Directory Route (/hotel/stays)", pass9, `Status: ${r9.status}`);

  // 10. Dynamic Stay Folio Ledger & Category Filters UI Route
  const r10 = vercelCurl("/hotel/folio/preview-test-stay-id");
  const pass10 = r10.status === 200 && (r10.bodyText.includes("Back to Front Office / Stays") || r10.bodyText.includes("Folio"));
  record(10, "Guest Folio Workspace Route (/hotel/folio/[stayId])", pass10, `Status: ${r10.status}`);

  // 11. Hotel Admin Backend API - Dashboard Data Feed
  const r11 = vercelCurl("/api/v1/hotel/dashboard", { token: hotelStaffToken });
  const pass11 = r11.status === 200 && r11.json && r11.json.success === true;
  record(11, "Hotel Dashboard API Feed (GET /api/v1/hotel/dashboard)", pass11, `Status: ${r11.status}, success: ${r11.json ? r11.json.success : false}`);

  // 12. Hotel Admin Backend API - Front Office Operational Feed
  const r12 = vercelCurl("/api/v1/hotel/front-office", { token: hotelStaffToken });
  const pass12 = r12.status === 200 && r12.json && r12.json.success === true;
  record(12, "Front Office API Feed (GET /api/v1/hotel/front-office)", pass12, `Status: ${r12.status}`);

  // 13. Security Gate - Unauthorized API Rejection
  const r13 = vercelCurl("/api/v1/hotel/front-office");
  const pass13 = r13.status === 401 && (r13.json?.error?.code === "AUTHENTICATION_REQUIRED" || r13.bodyText.includes("AUTHENTICATION_REQUIRED"));
  record(13, "Security Gate: Reject Unauthenticated Request (401)", pass13, `Status: ${r13.status}`);

  // 14. Entitlement Gate - Non-Hotel Tenant Rejection
  const r14 = vercelCurl("/api/v1/hotel/dashboard", { token: noHotelAdminToken });
  const pass14 = r14.status === 403;
  record(14, "Security Gate: Reject Non-Entitled Tenant (403)", pass14, `Status: ${r14.status}`);

  console.log("\n=================================================================");
  const allPassed = results.every((r) => r.pass);
  const totalPass = results.filter((r) => r.pass).length;
  console.log(`  SUMMARY: ${totalPass}/${results.length} CHECKS PASSED (${allPassed ? "100% SUCCESS" : "FAILURES DETECTED"})`);
  console.log("=================================================================\n");

  process.exit(allPassed ? 0 : 1);
}

runVerification();
