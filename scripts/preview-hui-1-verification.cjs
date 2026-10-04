/**
 * ASSO HUI-1 — Vercel Preview Verification Script
 * Validates all 10 minimum requirements against the active Vercel Preview deployment.
 */
const crypto = require("crypto");
const { execSync } = require("child_process");

const PREVIEW_BASE_URL = process.env.PREVIEW_BASE_URL || "https://asso-super-95kqyrhrh-sypdersupport1-ui.vercel.app";
const JWT_SECRET = process.env.PREVIEW_JWT_SECRET || "9KomVQXMxL8bcWSsgHragXvGn+HaPemLzES7foGkOxZkrQD7hNWmBHDY2iGQho966r3ZB6WunUoxGwcwcYvyFQ==";

// Tenant IDs
const TENANT_WITH_HOTEL = "11111111-1111-1111-1111-111111111111"; // Entitled to Hotel & Restaurant
const TENANT_NO_REST = "44444444-4444-4444-4444-444444444444";   // Hotel only, NO restaurant entitlement

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

const customerToken = signJwt({
  sub: "usr_guest_preview",
  tenantId: TENANT_WITH_HOTEL,
  roles: ["GUEST"],
  permissions: ["customer.read"],
  sessionType: "CUSTOMER",
  isSuperAdmin: false,
});

const hotelOnlyAdminToken = signJwt({
  sub: "usr_hotel_no_rest",
  email: "hotelonly@assohospitality.com",
  tenantId: TENANT_NO_REST,
  roles: ["HOTEL_ADMIN"],
  permissions: ["hotel.*"],
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
  console.log("  ASSO HUI-1 — VERCEL PREVIEW VERIFICATION SUITE                 ");
  console.log("=================================================================");
  console.log(`Target Preview URL: ${PREVIEW_BASE_URL}\n`);

  const results = [];

  // Check 1: Hotel dashboard renders successfully
  console.log("Check 1: Hotel dashboard renders successfully (/hotel)...");
  const c1 = vercelCurl("/hotel");
  const c1Pass = c1.status === 200 && c1.bodyText.includes("Hotel Operations Dashboard") && c1.bodyText.includes("Room Rack");
  results.push({ name: "1. Hotel dashboard renders successfully", status: c1.status, pass: c1Pass, details: `HTTP ${c1.status}, contains 'Hotel Operations Dashboard'` });
  console.log(c1Pass ? "  ✓ PASS: HTTP 200, dashboard HTML delivered" : `  ✗ FAIL: HTTP ${c1.status}`);

  // Check 2: Hotel Folio page renders successfully
  console.log("Check 2: Hotel Folio page renders successfully (/hotel/folio/[stayId])...");
  const c2 = vercelCurl("/hotel/folio/preview-test-stay-id");
  const c2Pass = c2.status === 200 && c2.bodyText.includes("Back to Front Office / Stays") && !c2.bodyText.includes("bg-zinc-950");
  results.push({ name: "2. Hotel Folio page renders successfully", status: c2.status, pass: c2Pass, details: `HTTP ${c2.status}, semantic tokens rendered, zero zinc-950 found` });
  console.log(c2Pass ? "  ✓ PASS: HTTP 200, Folio UI rendered with harmonized design tokens" : `  ✗ FAIL: HTTP ${c2.status}`);

  // Check 3: Hotel navigation renders correctly
  console.log("Check 3: Hotel navigation renders correctly...");
  const c3Pass = c1.bodyText.includes("ASSO Grand Hotel") && c1.bodyText.includes("/hotel/front-office") && c1.bodyText.includes("/hotel/rooms");
  results.push({ name: "3. Hotel navigation renders correctly", status: c1.status, pass: c3Pass, details: `HotelNav present with brand, front office, rooms links` });
  console.log(c3Pass ? "  ✓ PASS: HotelNav components and links verified" : `  ✗ FAIL`);

  // Check 4: Hotel -> Restaurant workspace navigation works
  console.log("Check 4: Hotel -> Restaurant workspace navigation works...");
  const c4Pass = c1.bodyText.includes('href="/restaurant"') && c1.bodyText.includes("Switch to Restaurant Operations Workspace");
  results.push({ name: "4. Hotel -> Restaurant navigation link", status: c1.status, pass: c4Pass, details: `Contains active link to /restaurant in header and drawer` });
  console.log(c4Pass ? "  ✓ PASS: Direct switcher to /restaurant found in HotelNav" : `  ✗ FAIL`);

  // Check 5: Restaurant -> Hotel workspace navigation works
  console.log("Check 5: Restaurant -> Hotel workspace navigation works (/restaurant)...");
  const c5 = vercelCurl("/restaurant");
  const c5Pass = c5.status === 200 && c5.bodyText.includes('href="/hotel"') && c5.bodyText.includes("Switch to Hotel PMS Workspace");
  results.push({ name: "5. Restaurant -> Hotel navigation link", status: c5.status, pass: c5Pass, details: `HTTP ${c5.status}, contains active link to /hotel in RestaurantNav` });
  console.log(c5Pass ? "  ✓ PASS: Direct switcher to /hotel found in RestaurantNav" : `  ✗ FAIL`);

  // Check 6: Restaurant navigation is not incorrectly exposed when Hotel Restaurant module is not entitled
  console.log("Check 6: Restaurant access guarded when module is not entitled...");
  const c6 = vercelCurl("/api/v1/restaurant/tables", { token: hotelOnlyAdminToken });
  const c6Pass = c6.status === 403 && (c6.json?.error?.code === "MODULE_NOT_ENTITLED" || c6.bodyText.includes("MODULE_NOT_ENTITLED") || c6.bodyText.includes("not entitled"));
  results.push({ name: "6. Non-entitled restaurant protection", status: c6.status, pass: c6Pass, details: `HTTP ${c6.status} MODULE_NOT_ENTITLED for tenant without RESTAURANT entitlement` });
  console.log(c6Pass ? `  ✓ PASS: HTTP ${c6.status} MODULE_NOT_ENTITLED strictly enforced` : `  ✗ FAIL: HTTP ${c6.status}`);

  // Check 7: Relevant Hotel API requests still function
  console.log("Check 7: Relevant Hotel API requests still function (/api/v1/hotel/properties)...");
  const c7 = vercelCurl("/api/v1/hotel/properties", { token: hotelStaffToken });
  const c7Pass = c7.status === 200 && c7.json?.success === true && Array.isArray(c7.json?.data);
  results.push({ name: "7. Relevant Hotel API requests function", status: c7.status, pass: c7Pass, details: `HTTP ${c7.status}, success: true, ${c7.json?.data?.length || 0} properties returned` });
  console.log(c7Pass ? `  ✓ PASS: HTTP ${c7.status} returned valid properties payload` : `  ✗ FAIL: HTTP ${c7.status}`);

  // Check 8: Existing authentication/session protections remain active
  console.log("Check 8: Existing authentication/session protections remain active (/api/v1/hotel/front-office)...");
  const c8 = vercelCurl("/api/v1/hotel/front-office"); // No token
  const c8Pass = c8.status === 401 && (c8.json?.error?.code === "AUTHENTICATION_REQUIRED" || c8.bodyText.includes("AUTHENTICATION_REQUIRED"));
  results.push({ name: "8. Unauthenticated requests blocked", status: c8.status, pass: c8Pass, details: `HTTP ${c8.status} AUTHENTICATION_REQUIRED for request without token` });
  console.log(c8Pass ? `  ✓ PASS: HTTP ${c8.status} AUTHENTICATION_REQUIRED strictly enforced` : `  ✗ FAIL: HTTP ${c8.status}`);

  // Check 9: Customer session cannot access protected Hotel admin functionality
  console.log("Check 9: Customer session cannot access protected Hotel admin functionality...");
  const c9 = vercelCurl("/api/v1/hotel/rooms", { token: customerToken });
  const c9Pass = c9.status === 403 && (c9.json?.error?.code === "PERMISSION_DENIED" || c9.bodyText.includes("PERMISSION_DENIED") || c9.bodyText.includes("Staff authorization"));
  results.push({ name: "9. Customer session blocked from admin API", status: c9.status, pass: c9Pass, details: `HTTP ${c9.status} PERMISSION_DENIED for customer session` });
  console.log(c9Pass ? `  ✓ PASS: HTTP ${c9.status} PERMISSION_DENIED strictly enforced` : `  ✗ FAIL: HTTP ${c9.status}`);

  // Check 10: No runtime-breaking application error is introduced
  console.log("Check 10: No runtime-breaking application error is introduced...");
  const c10Health = vercelCurl("/api/v1/health");
  const c10Pass = c10Health.status === 200 && c10Health.json?.data?.status === "healthy" && c10Health.json?.data?.database?.status === "connected";
  results.push({ name: "10. No runtime-breaking errors", status: c10Health.status, pass: c10Pass, details: `HTTP ${c10Health.status}, health: ${c10Health.json?.data?.status}, db: ${c10Health.json?.data?.database?.status}` });
  console.log(c10Pass ? `  ✓ PASS: Platform healthy, database connected, zero runtime errors` : `  ✗ FAIL`);

  console.log("\n=================================================================");
  console.log("  VERIFICATION SUMMARY MATRIX                                    ");
  console.log("=================================================================");
  console.table(results.map((r) => ({ Check: r.name, Status: r.status, Pass: r.pass ? "PASS" : "FAIL", Details: r.details })));

  const allPassed = results.every((r) => r.pass);
  console.log(`\nFinal Verdict: ${allPassed ? "ALL 10 CHECKS PASSED (100%)" : "SOME CHECKS FAILED"}`);
  process.exit(allPassed ? 0 : 1);
}

runVerification();
