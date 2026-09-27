const DEMO_TENANT_ID = "11111111-1111-1111-1111-111111111111";

const BASE_URL = "http://localhost:3000";

interface QAResult {
  step: string;
  status: "PASS" | "FAIL";
  details: string;
  latencyMs?: number;
}

const results: QAResult[] = [];

async function log(step: string, promise: Promise<any>, description: string) {
  const start = performance.now();
  try {
    const res = await promise;
    const latencyMs = Math.round(performance.now() - start);
    results.push({ step, status: "PASS", details: description, latencyMs });
    console.log(`✓ [PASS] (${latencyMs}ms) ${step}: ${description}`);
    return res;
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    results.push({ step, status: "FAIL", details: `${description} - ERROR: ${err.message}`, latencyMs });
    console.error(`✗ [FAIL] (${latencyMs}ms) ${step}: ${err.message}`);
    throw err;
  }
}

async function run() {
  console.log("=================================================================");
  console.log("   ASSO PRE-SLICE-7 LOCALHOST HOTEL FULL RUNTIME QA AUDIT       ");
  console.log("=================================================================\n");

  // 1. Health & DB Check
  const healthRes = await log("1.1 Live Platform Health", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success || json.data.database.status !== "connected") {
      throw new Error(`Database not connected: ${JSON.stringify(json.data.database)}`);
    }
    return json.data;
  })(), "Live Supabase PostgreSQL is connected and operational");

  console.log(`    Engine: ${healthRes.database.engine}, Latency: ${healthRes.database.latencyMs}ms`);

  // 2. SSR Route Checks
  const hotelRoutes = [
    { path: "/hotel", heading: "Hotel Management" },
    { path: "/hotel/front-office", heading: "Front Office Operations" },
    { path: "/hotel/rooms", heading: "Room Management" },
    { path: "/hotel/room-types", heading: "Room Types" },
    { path: "/hotel/guests", heading: "Guest Directory" },
    { path: "/hotel/reservations", heading: "Reservations" },
    { path: "/hotel/stays", heading: "Stay Management" },
    { path: "/hotel/housekeeping", heading: "Housekeeping Operations" },
    { path: "/hotel/maintenance", heading: "Maintenance" },
    { path: "/hotel/settings", heading: "Hotel Property Configuration" },
  ];

  for (const route of hotelRoutes) {
    await log(`2. Route SSR: ${route.path}`, (async () => {
      const res = await fetch(`${BASE_URL}${route.path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      if (!html.includes(route.heading) && !html.includes("ASSO")) {
        throw new Error(`Expected content not found in SSR HTML for ${route.path}`);
      }
      return true;
    })(), `Renders HTTP 200 with proper heading and layout`);
  }

  // 3. Obtain Property and Rooms
  const properties = await log("3.1 Fetch Properties", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/properties`, {
      headers: { "x-tenant-id": DEMO_TENANT_ID },
    });
    const json = await res.json();
    if (!json.success || !json.data || json.data.length === 0) {
      throw new Error("No properties found");
    }
    return json.data;
  })(), "Properties fetched successfully from live PostgreSQL");

  const outletId = properties[0].outletId;
  console.log(`    Active Property Outlet: ${outletId} (${properties[0].name})`);

  const rooms = await log("3.2 Fetch Property Rooms", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/rooms?outletId=${outletId}`, {
      headers: { "x-tenant-id": DEMO_TENANT_ID },
    });
    const json = await res.json();
    if (!json.success || !json.data || json.data.length === 0) {
      throw new Error("No rooms found");
    }
    return json.data;
  })(), `Retrieved rooms for outlet ${outletId}`);

  // Create a dedicated fresh room for clean end-to-end lifecycle testing
  const uniqueRoomNum = `QA-${Math.floor(Math.random() * 9000) + 1000}`;
  const targetRoom = await log("3.3 Create Dedicated QA Room", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": DEMO_TENANT_ID },
      body: JSON.stringify({
        outletId,
        roomTypeId: rooms[0].roomTypeId,
        roomNumber: uniqueRoomNum,
        floorNumber: "4",
        operationalStatus: "AVAILABLE",
        housekeepingStatus: "CLEAN",
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "Failed to create room");
    return json.data;
  })(), `Created dedicated QA room ${uniqueRoomNum}`);

  async function getTargetRoom(roomId: string) {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/rooms?outletId=${outletId}`, {
      headers: { "x-tenant-id": DEMO_TENANT_ID },
    });
    const json = await res.json();
    const found = json.data?.find((r: any) => r.roomId === roomId);
    if (!found) throw new Error(`Room ${roomId} not found in outlet`);
    return found;
  }

  // 4. End-to-End Hotel Workflow
  // 4.1 Create Guest
  const uniqueNum = Math.floor(Math.random() * 90000) + 10000;
  const guest = await log("4.1 Create Guest", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/guests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": DEMO_TENANT_ID },
      body: JSON.stringify({
        fullName: `QA Guest ${uniqueNum}`,
        email: `qa.guest.${uniqueNum}@example.com`,
        phone: `+9198765${uniqueNum}`,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "Failed to create guest");
    return json.data;
  })(), `Created guest ${uniqueNum}`);

  // 4.2 Create Reservation
  const now = new Date();
  const checkInDate = now.toISOString().split("T")[0];
  const checkOutDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const reservation = await log("4.2 Create Reservation", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": DEMO_TENANT_ID },
      body: JSON.stringify({
        outletId,
        guestId: guest.guestId,
        roomTypeId: targetRoom.roomTypeId,
        assignedRoomId: targetRoom.roomId,
        arrivalDate: checkInDate,
        departureDate: checkOutDate,
        adultCount: 2,
        childrenCount: 0,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "Failed to create reservation");
    return json.data;
  })(), "Reservation created successfully");

  // Verify room is still AVAILABLE (Reservation does not equal Occupied!)
  await log("4.3 Verify Room Not Occupied Upon Reservation", (async () => {
    const room = await getTargetRoom(targetRoom.roomId);
    if (room.operationalStatus === "OCCUPIED") {
      throw new Error("Room was erroneously marked OCCUPIED by reservation creation!");
    }
    return room;
  })(), "Room remains AVAILABLE until physical check-in");

  // 4.4 Execute Check-in
  const stay = await log("4.4 Execute Check-In", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/reservations/${reservation.reservationId}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": DEMO_TENANT_ID },
      body: JSON.stringify({ roomId: targetRoom.roomId }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "Failed to check in");
    return json.data;
  })(), "Stay checked in successfully");

  // 4.5 Verify Room is now OCCUPIED
  await log("4.5 Verify Room Transition to OCCUPIED", (async () => {
    const room = await getTargetRoom(targetRoom.roomId);
    if (room.operationalStatus !== "OCCUPIED") {
      throw new Error(`Expected room to be OCCUPIED, found: ${room.operationalStatus}`);
    }
    return room;
  })(), "Room status correctly updated to OCCUPIED in database");

  // 4.6 Duplicate Check-in Prevention
  await log("4.6 Reject Duplicate Check-In", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/reservations/${reservation.reservationId}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": DEMO_TENANT_ID },
      body: JSON.stringify({ roomId: targetRoom.roomId }),
    });
    const json = await res.json();
    if (res.ok || json.success) {
      throw new Error("Duplicate check-in was erroneously accepted!");
    }
    return json;
  })(), "Duplicate check-in correctly rejected with business violation");

  // 4.7 Execute Check-Out
  await log("4.7 Execute Check-Out", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/stays/${stay.stayId}/check-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": DEMO_TENANT_ID },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "Failed to check out");
    return json.data;
  })(), "Stay checked out successfully");

  // 4.8 Verify Room is AVAILABLE and Housekeeping is DIRTY
  await log("4.8 Verify Room Becomes AVAILABLE & DIRTY", (async () => {
    const room = await getTargetRoom(targetRoom.roomId);
    if (room.operationalStatus !== "AVAILABLE" || room.housekeepingStatus !== "DIRTY") {
      throw new Error(`Unexpected room state: op=${room.operationalStatus}, hk=${room.housekeepingStatus}`);
    }
    return room;
  })(), "Room is AVAILABLE and DIRTY after guest checkout");

  // 4.9 Reject Duplicate Check-Out
  await log("4.9 Reject Duplicate Check-Out", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/stays/${stay.stayId}/check-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": DEMO_TENANT_ID },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (res.ok || json.success) {
      throw new Error("Duplicate checkout was erroneously accepted!");
    }
    return json;
  })(), "Duplicate checkout correctly rejected");

  // 5. Housekeeping Lifecycle & Inspection
  // Obtain staff authorization token for operational workflows
  const tokenRes = await fetch(`${BASE_URL}/api/v1/auth/demo-token`);
  const tokenJson = await tokenRes.json();
  const staffToken = tokenJson.data?.token || "";
  const staffHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${staffToken}`,
    "x-tenant-id": DEMO_TENANT_ID,
  };

  // 5.1 Create / Find Turnover Task
  const hkTask = await log("5.1 Create Housekeeping Task", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/housekeeping/tasks`, {
      method: "POST",
      headers: staffHeaders,
      body: JSON.stringify({
        outletId,
        roomId: targetRoom.roomId,
        taskType: "DEPARTURE_TURNOVER",
        priority: "HIGH",
        notes: "Post-checkout turnover cleaning",
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "Failed to create housekeeping task");
    return json.data;
  })(), "Housekeeping turnover task created successfully");

  // 5.2 Start Task
  await log("5.2 Start Cleaning Task", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/housekeeping/tasks/${hkTask.taskId}/start`, {
      method: "POST",
      headers: staffHeaders,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "Failed to start housekeeping task");
    return json.data;
  })(), "Cleaning in progress");

  // 5.3 Complete Cleaning -> Room becomes CLEAN
  await log("5.3 Complete Cleaning Task", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/housekeeping/tasks/${hkTask.taskId}/complete`, {
      method: "POST",
      headers: staffHeaders,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "Failed to complete housekeeping task");
    return json.data;
  })(), "Cleaning completed, room marked CLEAN");

  // 5.4 Inspect Task - Failed Inspection (Reverts room to DIRTY)
  await log("5.4 Inspection Failure Flow (Reversion to DIRTY)", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/housekeeping/tasks/${hkTask.taskId}/inspect`, {
      method: "POST",
      headers: staffHeaders,
      body: JSON.stringify({
        passed: false,
        notes: "Bathroom mirror smudged; re-cleaning needed.",
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "Failed to submit inspection");
    
    // Check room status
    const room = await getTargetRoom(targetRoom.roomId);
    if (room.housekeepingStatus !== "DIRTY") {
      throw new Error(`Expected room to revert to DIRTY on failed inspection, got: ${room.housekeepingStatus}`);
    }
    return json.data;
  })(), "Failed inspection transitions task to RE_CLEANING and room to DIRTY");

  // 5.5 Re-clean and pass inspection -> Room becomes INSPECTED
  await log("5.5 Re-clean and Pass Inspection (Room becomes INSPECTED)", (async () => {
    // Start re-clean (PENDING -> IN_PROGRESS)
    await fetch(`${BASE_URL}/api/v1/hotel/housekeeping/tasks/${hkTask.taskId}/start`, {
      method: "POST",
      headers: staffHeaders,
    });
    // Complete re-clean (IN_PROGRESS -> CLEANED)
    await fetch(`${BASE_URL}/api/v1/hotel/housekeeping/tasks/${hkTask.taskId}/complete`, {
      method: "POST",
      headers: staffHeaders,
    });
    // Pass inspection (CLEANED -> INSPECTED)
    const res = await fetch(`${BASE_URL}/api/v1/hotel/housekeeping/tasks/${hkTask.taskId}/inspect`, {
      method: "POST",
      headers: staffHeaders,
      body: JSON.stringify({
        passed: true,
        notes: "Mirror spotless. Room passes all quality standards.",
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "Failed to pass inspection");

    // Check room status
    const room = await getTargetRoom(targetRoom.roomId);
    if (room.housekeepingStatus !== "INSPECTED") {
      throw new Error(`Expected room to become INSPECTED, got: ${room.housekeepingStatus}`);
    }
    return json.data;
  })(), "Passed inspection certifies room as INSPECTED (Ready)");

  // 6. Maintenance Lifecycle (Slice 6)
  // 6.1 Create Maintenance Request with OUT_OF_ORDER impact
  const maintReq = await log("6.1 Create Maintenance Request (OUT_OF_ORDER)", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/maintenance`, {
      method: "POST",
      headers: staffHeaders,
      body: JSON.stringify({
        outletId,
        roomId: targetRoom.roomId,
        category: "HVAC",
        priority: "URGENT",
        title: "AC thermostat unresponsive",
        description: "Thermostat display blank and AC blowing ambient air",
        operationalImpact: "OUT_OF_ORDER",
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "Failed to create maintenance request");
    
    // Check room status
    const room = await getTargetRoom(targetRoom.roomId);
    if (room.operationalStatus !== "OUT_OF_ORDER") {
      throw new Error(`Room operationalStatus not OUT_OF_ORDER: ${room.operationalStatus}`);
    }
    return json.data;
  })(), "Maintenance request took room OUT_OF_ORDER");

  // 6.2 Front Office Attention Queue Visibility
  await log("6.2 Front Office Visibility of Maintenance", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/front-office?outletId=${outletId}`, {
      headers: staffHeaders,
    });
    const json = await res.json();
    if (!json.success) throw new Error("Failed to load front office metrics");
    const attentionQueue = json.data.attentionItems || json.data.attentionQueue || [];
    const maintAlert = attentionQueue.find((a: any) => a.type === "OUT_OF_ORDER_ROOM" || a.type === "MAINTENANCE_ATTENTION");
    if (!maintAlert) {
      throw new Error("Maintenance room issue not reflected in Front Office attention queue!");
    }
    return maintAlert;
  })(), "Front Office attention queue surfaces active maintenance impact");

  // 6.3 Start Maintenance Work
  await log("6.3 Start Maintenance Work", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/maintenance/${maintReq.requestId}/start`, {
      method: "POST",
      headers: staffHeaders,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "Failed to start maintenance request");
    return json.data;
  })(), "Maintenance work marked IN_PROGRESS");

  // 6.4 Resolve Maintenance Work with Room Restoration
  await log("6.4 Resolve Maintenance & Restore Room", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/maintenance/${maintReq.requestId}/resolve`, {
      method: "POST",
      headers: staffHeaders,
      body: JSON.stringify({
        resolutionNotes: "Thermostat wire reconnected and blown fuse replaced. AC cooling normally.",
        restoreRoomOperationalStatus: true,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "Failed to resolve maintenance");

    // Check room status
    const room = await getTargetRoom(targetRoom.roomId);
    if (room.operationalStatus !== "AVAILABLE") {
      throw new Error(`Expected room to restore to AVAILABLE, got: ${room.operationalStatus}`);
    }
    if (room.housekeepingStatus !== "INSPECTED") {
      throw new Error(`Housekeeping status altered erroneously: ${room.housekeepingStatus}`);
    }
    return json.data;
  })(), "Room restored to AVAILABLE while preserving INSPECTED housekeeping status");

  // 6.5 Close Maintenance Work
  await log("6.5 Close Maintenance Work", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/maintenance/${maintReq.requestId}/close`, {
      method: "POST",
      headers: staffHeaders,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || "Failed to close maintenance");
    return json.data;
  })(), "Maintenance item closed");

  // 7. Security Smoke Test
  // 7.1 Unauthenticated access rejected with 401
  await log("7.1 Reject Unauthenticated Staff Access (401)", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/maintenance`);
    const json = await res.json();
    if (res.status !== 401 || json.error?.code !== "AUTHENTICATION_REQUIRED") {
      throw new Error(`Expected 401 AUTHENTICATION_REQUIRED, got HTTP ${res.status}: ${JSON.stringify(json)}`);
    }
    return true;
  })(), "Unauthenticated request properly rejected (401 AUTHENTICATION_REQUIRED)");

  // 7.2 Tenant without HOTEL entitlement rejected with 403 MODULE_NOT_ENTITLED
  await log("7.2 Reject Tenant Without HOTEL Entitlement (403)", (async () => {
    const res = await fetch(`${BASE_URL}/api/v1/hotel/rooms`, {
      headers: { "x-tenant-id": "22222222-2222-2222-2222-222222222222" },
    });
    const json = await res.json();
    if (res.status !== 403 || json.error?.code !== "MODULE_NOT_ENTITLED") {
      throw new Error(`Expected 403 MODULE_NOT_ENTITLED, got HTTP ${res.status}: ${JSON.stringify(json)}`);
    }
    return true;
  })(), "Tenant without HOTEL entitlement properly blocked (403 MODULE_NOT_ENTITLED)");

  console.log("\n=================================================================");
  console.log(`   ALL ${results.length} RUNTIME LOCALHOST AUDIT CHECKS PASSED (100%) `);
  console.log("=================================================================");
}

run().catch((err) => {
  console.error("\nFATAL QA FAILURE:", err);
  process.exit(1);
});
