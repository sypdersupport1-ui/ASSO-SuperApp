const crypto = require("crypto");
const { execSync } = require("child_process");

const PREVIEW_BASE_URL = process.env.PREVIEW_BASE_URL || "https://asso-super-fr34q3po5-sypdersupport1-ui.vercel.app";
const JWT_SECRET = process.env.JWT_SECRET || "9KomVQXMxL8bcWSsgHragXvGn+HaPemLzES7foGkOxZkrQD7hNWmBHDY2iGQho966r3ZB6WunUoxGwcwcYvyFQ==";

const TENANT_WITH_HOTEL = "11111111-1111-1111-1111-111111111111";
const OUTLET_ID = "f2f3b7bb-0fd1-49f9-9457-1e558de11883";
const ROOM_CONTEXT_ID = "94fa39bc-805b-4961-80f0-6f5215c5018a";

function signJwt(payload, secret = JWT_SECRET, expSeconds = 7200) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    iat: now,
    exp: now + expSeconds,
    ...payload,
  };
  const body = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

const customerToken = signJwt({
  sub: "sess_guest_preview_test",
  tenantId: TENANT_WITH_HOTEL,
  outletId: OUTLET_ID,
  contextId: ROOM_CONTEXT_ID,
  sessionType: "CUSTOMER",
  roles: [],
  permissions: [],
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

    const headers = {};
    for (const line of headerText.split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx !== -1) {
        const k = line.substring(0, idx).trim().toLowerCase();
        const v = line.substring(idx + 1).trim();
        headers[k] = v;
      }
    }

    let parsedBody = null;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      parsedBody = bodyText;
    }

    return { status, headers, body: bodyText, parsedBody, raw };
  } catch (err) {
    return {
      status: 500,
      headers: {},
      body: err.message,
      parsedBody: null,
      error: err,
    };
  }
}

async function run() {
  console.log("=================================================================");
  console.log("  ASSO SCALE S5 — NODE MIDDLEWARE RUNTIME PREVIEW VERIFICATION   ");
  console.log("  Target:", PREVIEW_BASE_URL);
  console.log("=================================================================\n");

  const results = [];

  // Check 1: Frontend Hotel Guest Page
  const res1 = vercelCurl("/hotel/guest");
  const pass1 = res1.status === 200 && !res1.body.includes("MIDDLEWARE_INVOCATION_FAILED");
  console.log(`[CHECK 1] GET /hotel/guest`);
  console.log(`          Status: ${res1.status}`);
  console.log(`          Edge Crash (MIDDLEWARE_INVOCATION_FAILED): ${res1.body.includes("MIDDLEWARE_INVOCATION_FAILED") ? "YES" : "NO"}`);
  console.log(`          Result: ${pass1 ? "PASS ✓" : "FAIL ✗"}\n`);
  results.push({ name: "GET /hotel/guest", pass: pass1, status: res1.status });

  // Check 2: Frontend Room Service Page
  const res2 = vercelCurl("/hotel/guest/room-service");
  const pass2 = res2.status === 200 && !res2.body.includes("MIDDLEWARE_INVOCATION_FAILED");
  console.log(`[CHECK 2] GET /hotel/guest/room-service`);
  console.log(`          Status: ${res2.status}`);
  console.log(`          Edge Crash (MIDDLEWARE_INVOCATION_FAILED): ${res2.body.includes("MIDDLEWARE_INVOCATION_FAILED") ? "YES" : "NO"}`);
  console.log(`          Result: ${pass2 ? "PASS ✓" : "FAIL ✗"}\n`);
  results.push({ name: "GET /hotel/guest/room-service", pass: pass2, status: res2.status });

  // Check 3: Customer Session API (matched by middleware /api/v1/customer/:path*)
  const res3 = vercelCurl("/api/v1/customer/session", { token: customerToken });
  const reqId3 = res3.headers["x-request-id"] || (res3.parsedBody && res3.parsedBody.error && res3.parsedBody.error.requestId);
  const pass3 = (res3.status === 200 || res3.status === 404 || res3.status === 401) &&
                !res3.body.includes("MIDDLEWARE_INVOCATION_FAILED") &&
                !!res3.headers["x-request-id"];
  console.log(`[CHECK 3] GET /api/v1/customer/session (Customer session token)`);
  console.log(`          Status: ${res3.status}`);
  console.log(`          X-Request-Id header: ${res3.headers["x-request-id"] || "none"}`);
  console.log(`          Edge Crash: ${res3.body.includes("MIDDLEWARE_INVOCATION_FAILED") ? "YES" : "NO"}`);
  console.log(`          Result: ${pass3 ? "PASS ✓" : "FAIL ✗"}\n`);
  results.push({ name: "GET /api/v1/customer/session", pass: pass3, status: res3.status, reqId: res3.headers["x-request-id"] });

  // Check 4: Customer Service Requests API
  const res4 = vercelCurl("/api/v1/customer/service-requests", { token: customerToken });
  const pass4 = (res4.status === 200 || res4.status === 404) &&
                !res4.body.includes("MIDDLEWARE_INVOCATION_FAILED") &&
                !!res4.headers["x-request-id"];
  console.log(`[CHECK 4] GET /api/v1/customer/service-requests (Customer session token)`);
  console.log(`          Status: ${res4.status}`);
  console.log(`          X-Request-Id header: ${res4.headers["x-request-id"] || "none"}`);
  console.log(`          Edge Crash: ${res4.body.includes("MIDDLEWARE_INVOCATION_FAILED") ? "YES" : "NO"}`);
  console.log(`          Result: ${pass4 ? "PASS ✓" : "FAIL ✗"}\n`);
  results.push({ name: "GET /api/v1/customer/service-requests", pass: pass4, status: res4.status, reqId: res4.headers["x-request-id"] });

  // Check 5: Customer Room Service Menu API
  const res5 = vercelCurl("/api/v1/customer/room-service/menu", { token: customerToken });
  const pass5 = (res5.status === 200 || res5.status === 404) &&
                !res5.body.includes("MIDDLEWARE_INVOCATION_FAILED") &&
                !!res5.headers["x-request-id"];
  console.log(`[CHECK 5] GET /api/v1/customer/room-service/menu`);
  console.log(`          Status: ${res5.status}`);
  console.log(`          X-Request-Id header: ${res5.headers["x-request-id"] || "none"}`);
  console.log(`          Edge Crash: ${res5.body.includes("MIDDLEWARE_INVOCATION_FAILED") ? "YES" : "NO"}`);
  console.log(`          Result: ${pass5 ? "PASS ✓" : "FAIL ✗"}\n`);
  results.push({ name: "GET /api/v1/customer/room-service/menu", pass: pass5, status: res5.status, reqId: res5.headers["x-request-id"] });

  // Check 6: Customer Room Service Orders API
  const res6 = vercelCurl("/api/v1/customer/room-service/orders", { token: customerToken });
  const pass6 = (res6.status === 200 || res6.status === 404) &&
                !res6.body.includes("MIDDLEWARE_INVOCATION_FAILED") &&
                !!res6.headers["x-request-id"];
  console.log(`[CHECK 6] GET /api/v1/customer/room-service/orders`);
  console.log(`          Status: ${res6.status}`);
  console.log(`          X-Request-Id header: ${res6.headers["x-request-id"] || "none"}`);
  console.log(`          Edge Crash: ${res6.body.includes("MIDDLEWARE_INVOCATION_FAILED") ? "YES" : "NO"}`);
  console.log(`          Result: ${pass6 ? "PASS ✓" : "FAIL ✗"}\n`);
  results.push({ name: "GET /api/v1/customer/room-service/orders", pass: pass6, status: res6.status, reqId: res6.headers["x-request-id"] });

  // Check 7: Restaurant Customer Menu API (verify no restaurant regression)
  const res7 = vercelCurl("/api/v1/restaurant/menu?outletId=" + OUTLET_ID, {
    headers: { "x-tenant-id": TENANT_WITH_HOTEL },
  });
  const pass7 = (res7.status === 200 || res7.status === 400 || res7.status === 404) &&
                !res7.body.includes("MIDDLEWARE_INVOCATION_FAILED") &&
                !!res7.headers["x-request-id"];
  console.log(`[CHECK 7] GET /api/v1/restaurant/menu (Restaurant customer flow)`);
  console.log(`          Status: ${res7.status}`);
  console.log(`          X-Request-Id header: ${res7.headers["x-request-id"] || "none"}`);
  console.log(`          Edge Crash: ${res7.body.includes("MIDDLEWARE_INVOCATION_FAILED") ? "YES" : "NO"}`);
  console.log(`          Result: ${pass7 ? "PASS ✓" : "FAIL ✗"}\n`);
  results.push({ name: "GET /api/v1/restaurant/menu", pass: pass7, status: res7.status, reqId: res7.headers["x-request-id"] });

  // Check 8: Protected Staff PMS Route (GET /api/v1/hotel/rooms) without credentials
  const res8 = vercelCurl("/api/v1/hotel/rooms");
  const pass8 = (res8.status === 401 || res8.status === 403) && !res8.body.includes("MIDDLEWARE_INVOCATION_FAILED");
  console.log(`[CHECK 8] GET /api/v1/hotel/rooms (Staff PMS route without credentials)`);
  console.log(`          Status: ${res8.status}`);
  console.log(`          Protected from unauthenticated access: ${pass8 ? "YES" : "NO"}`);
  console.log(`          Result: ${pass8 ? "PASS ✓" : "FAIL ✗"}\n`);
  results.push({ name: "Staff Route 401/403 Protection", pass: pass8, status: res8.status });

  // Summary
  console.log("=================================================================");
  const allPassed = results.every((r) => r.pass);
  console.log(`  SCALE S5 PREVIEW VERIFICATION: ${allPassed ? "ALL 8 CHECKS PASSED (100%)" : "FAILURES DETECTED"}`);
  console.log(`  Passed: ${results.filter((r) => r.pass).length}/${results.length}`);
  console.log("=================================================================");

  if (!allPassed) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("Fatal verification error:", e);
  process.exit(1);
});
