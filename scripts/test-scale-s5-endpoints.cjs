const { execSync } = require("child_process");
const crypto = require("crypto");

const PREVIEW_BASE_URL = "https://asso-super-fr34q3po5-sypdersupport1-ui.vercel.app";
const JWT_SECRET = "9KomVQXMxL8bcWSsgHragXvGn+HaPemLzES7foGkOxZkrQD7hNWmBHDY2iGQho966r3ZB6WunUoxGwcwcYvyFQ==";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const OUTLET_ID = "f2f3b7bb-0fd1-49f9-9457-1e558de11883";
const ROOM_CONTEXT_ID = "94fa39bc-805b-4961-80f0-6f5215c5018a";

function signJwt(payload, secret = JWT_SECRET, expSeconds = 7200) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { iat: now, exp: now + expSeconds, ...payload };
  const body = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

const customerToken = signJwt({
  sub: "sess_guest_preview_test",
  tenantId: TENANT_ID,
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

  const raw = execSync(cmd, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const splitIndex = raw.indexOf("\r\n\r\n") !== -1 ? raw.indexOf("\r\n\r\n") : raw.indexOf("\n\n");
  const headerText = splitIndex !== -1 ? raw.substring(0, splitIndex) : raw;
  const bodyText = splitIndex !== -1 ? raw.substring(splitIndex).trim() : "";

  const statusMatch = headerText.match(/HTTP\/[12\.]+ (\d+)/i);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;

  const headers = {};
  for (const line of headerText.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx !== -1) {
      headers[line.substring(0, idx).trim().toLowerCase()] = line.substring(idx + 1).trim();
    }
  }

  return { status, headers, bodyText };
}

const endpoints = [
  { name: "/hotel/guest (Customer Page)", path: "/hotel/guest" },
  { name: "/hotel/guest/room-service (Customer Page)", path: "/hotel/guest/room-service" },
  { name: "/api/v1/customer/session (Without Token)", path: "/api/v1/customer/session" },
  { name: "/api/v1/customer/service-requests (Customer Token)", path: "/api/v1/customer/service-requests", token: customerToken },
  { name: "/api/v1/customer/room-service/menu (Customer Token)", path: "/api/v1/customer/room-service/menu", token: customerToken },
  { name: "/api/v1/customer/room-service/orders (Customer Token)", path: "/api/v1/customer/room-service/orders", token: customerToken },
  { name: "/api/v1/hotel/rooms (Customer Token -> Staff PMS endpoint)", path: "/api/v1/hotel/rooms?outletId=" + OUTLET_ID, token: customerToken },
  { name: "/api/v1/hotel/rooms (No Auth)", path: "/api/v1/hotel/rooms" },
  { name: "/api/v1/restaurant/menu (Restaurant flow)", path: "/api/v1/restaurant/menu?outletId=" + OUTLET_ID, headers: { "x-tenant-id": TENANT_ID } },
  { name: "/api/v1/health (Platform Health)", path: "/api/v1/health" },
];

console.log("================================================================================");
console.log("  PREVIEW ENDPOINT VERIFICATION TABLE — DEPLOYMENT: " + PREVIEW_BASE_URL);
console.log("================================================================================\n");

for (const ep of endpoints) {
  const res = vercelCurl(ep.path, ep);
  const isEdgeCrash = res.bodyText.includes("MIDDLEWARE_INVOCATION_FAILED");
  const xReqId = res.headers["x-request-id"] || "none";
  console.log(`Endpoint:    ${ep.name}`);
  console.log(`Path:        ${ep.path}`);
  console.log(`Status:      ${res.status}`);
  console.log(`X-Request-Id: ${xReqId}`);
  console.log(`Edge Crash:  ${isEdgeCrash ? "CRASH DETECTED ✗" : "NONE (NORMAL) ✓"}`);
  console.log(`Body excerpt: ${res.bodyText.slice(0, 100).replace(/\n/g, " ")}`);
  console.log("--------------------------------------------------------------------------------");
}
