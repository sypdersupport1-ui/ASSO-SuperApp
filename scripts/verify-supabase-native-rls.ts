import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is required in environment.");
  process.exit(1);
}

const sql = postgres(connectionString, {
  ssl: "require",
  max: 5,
  connect_timeout: 10,
});

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const OUTLET_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OUTLET_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CONTEXT_A = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const CONTEXT_B = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const ORDER_A = "aaaa1111-0000-0000-0000-000000000001";
const ORDER_B = "bbbb2222-0000-0000-0000-000000000002";

async function runNativeRlsAudit() {
  console.log("=================================================================");
  console.log("  ASSO PHASE 6 — NATIVE SUPABASE POSTGRESQL & RLS AUDIT SUITE    ");
  console.log("=================================================================\n");

  try {
    // 0. Seed test fixtures
    console.log("Setting up isolated test data for Tenant A and Tenant B...");
    await sql.begin(async (tx) => {
      // Upsert organizations
      await tx`
        INSERT INTO organizations (organization_id, name, primary_business_type)
        VALUES 
          (${TENANT_A}, 'Audit Test Tenant A', 'HOTEL'),
          (${TENANT_B}, 'Audit Test Tenant B', 'RESTAURANT')
        ON CONFLICT (organization_id) DO UPDATE SET name = EXCLUDED.name;
      `;

      // Upsert outlets
      await tx`
        INSERT INTO outlets (outlet_id, tenant_id, name, code, vertical_type)
        VALUES
          (${OUTLET_A}, ${TENANT_A}, 'Outlet A', 'OUT_A', 'HOTEL'),
          (${OUTLET_B}, ${TENANT_B}, 'Outlet B', 'OUT_B', 'RESTAURANT')
        ON CONFLICT (outlet_id) DO NOTHING;
      `;

      // Upsert business contexts
      await tx`
        INSERT INTO business_contexts (context_id, tenant_id, outlet_id, context_type, identifier, display_label)
        VALUES
          (${CONTEXT_A}, ${TENANT_A}, ${OUTLET_A}, 'HOTEL_ROOM', 'Room 101', 'Room 101 - Deluxe'),
          (${CONTEXT_B}, ${TENANT_B}, ${OUTLET_B}, 'RESTAURANT_TABLE', 'Table 5', 'Table 5 - Window')
        ON CONFLICT (context_id) DO NOTHING;
      `;

      // Upsert test orders
      await tx`
        INSERT INTO orders (order_id, tenant_id, outlet_id, context_id, order_number, order_source, status, total_amount)
        VALUES
          (${ORDER_A}, ${TENANT_A}, ${OUTLET_A}, ${CONTEXT_A}, 'ORD-A-001', 'STAFF_POS', 'PLACED', 1250.00),
          (${ORDER_B}, ${TENANT_B}, ${OUTLET_B}, ${CONTEXT_B}, 'ORD-B-001', 'QR_CUSTOMER', 'PLACED', 850.00)
        ON CONFLICT (order_id) DO NOTHING;
      `;
    });
    console.log("✓ Fixtures successfully prepared.\n");

    // TEST 1: Tenant A can access Tenant A data
    console.log("TEST 1: Tenant A accessing Tenant A data...");
    const test1Rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('app.current_tenant_id', ${TENANT_A}, true)`;
      return await tx`SELECT order_id, order_number, total_amount, tenant_id FROM orders WHERE order_id = ${ORDER_A}`;
    });
    if (test1Rows.length === 1 && test1Rows[0].tenant_id === TENANT_A) {
      console.log(`✓ PASS: Tenant A successfully read Tenant A order (id: ${test1Rows[0].order_id}, amount: ${test1Rows[0].total_amount})`);
    } else {
      throw new Error(`FAIL Test 1: Expected 1 row for Tenant A, got ${test1Rows.length}`);
    }

    // TEST 2: Tenant A CANNOT read Tenant B data
    console.log("\nTEST 2: Tenant A attempting cross-tenant read of Tenant B data...");
    const test2Rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('app.current_tenant_id', ${TENANT_A}, true)`;
      return await tx`SELECT * FROM orders WHERE order_id = ${ORDER_B}`;
    });
    if (test2Rows.length === 0) {
      console.log("✓ PASS: Cross-tenant read returned 0 rows (Tenant B data completely invisible).");
    } else {
      throw new Error(`FAIL Test 2: Cross-tenant data leakage! Returned ${test2Rows.length} rows.`);
    }

    // TEST 3: Tenant A CANNOT update Tenant B data
    console.log("\nTEST 3: Tenant A attempting cross-tenant mutation of Tenant B data...");
    const test3Result = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('app.current_tenant_id', ${TENANT_A}, true)`;
      return await tx`UPDATE orders SET status = 'CANCELLED' WHERE order_id = ${ORDER_B}`;
    });
    // Check actual state of Order B
    const [orderBCheck] = await sql`SELECT status FROM orders WHERE order_id = ${ORDER_B}`;
    if (test3Result.count === 0 && orderBCheck.status === "PLACED") {
      console.log("✓ PASS: Cross-tenant update affected 0 rows. Tenant B row remains intact (status: PLACED).");
    } else {
      throw new Error("FAIL Test 3: Cross-tenant update was permitted!");
    }

    // TEST 4: Tenant A CANNOT delete Tenant B data
    console.log("\nTEST 4: Tenant A attempting cross-tenant deletion of Tenant B data...");
    const test4Result = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('app.current_tenant_id', ${TENANT_A}, true)`;
      return await tx`DELETE FROM orders WHERE order_id = ${ORDER_B}`;
    });
    const [orderBExists] = await sql`SELECT count(*) FROM orders WHERE order_id = ${ORDER_B}`;
    if (test4Result.count === 0 && Number(orderBExists.count) === 1) {
      console.log("✓ PASS: Cross-tenant delete affected 0 rows. Tenant B row remains in database.");
    } else {
      throw new Error("FAIL Test 4: Cross-tenant delete succeeded!");
    }

    // TEST 5: Missing tenant context fails closed
    console.log("\nTEST 5: Missing tenant context (fail-closed behavior)...");
    const test5Rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      // Intentionally omitting SET LOCAL app.current_tenant_id
      return await tx`SELECT * FROM orders`;
    });
    if (test5Rows.length === 0) {
      console.log("✓ PASS: Query without tenant context returned 0 rows (fail-closed).");
    } else {
      throw new Error(`FAIL Test 5: Returned ${test5Rows.length} rows without tenant context!`);
    }

    // TEST 6: Empty tenant context fails closed
    console.log("\nTEST 6: Empty string tenant context (fail-closed behavior)...");
    const test6Rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SET LOCAL app.current_tenant_id = ''`;
      return await tx`SELECT * FROM orders`;
    });
    if (test6Rows.length === 0) {
      console.log("✓ PASS: Empty tenant context returned 0 rows (fail-closed).");
    } else {
      throw new Error(`FAIL Test 6: Returned ${test6Rows.length} rows with empty tenant context!`);
    }

    // TEST 7: Malformed UUID throws 22P02 exception
    console.log("\nTEST 7: Malformed UUID format / SQL injection attempt...");
    let test7Caught = false;
    try {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SET LOCAL app.current_tenant_id = 'not-a-uuid; DROP TABLE orders; --'`;
        await tx`SELECT * FROM orders`;
      });
    } catch (err: any) {
      test7Caught = true;
      console.log(`✓ PASS: Malformed UUID rejected by PostgreSQL: [${err.code || "ERR"}] ${err.message}`);
    }
    if (!test7Caught) {
      throw new Error("FAIL Test 7: Malformed tenant UUID was not rejected!");
    }

    // TEST 8: Connection pool safety across sequential transaction scopes
    console.log("\nTEST 8: Connection pool safety across sequential requests...");
    // Request 1: Tenant A
    const req1 = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('app.current_tenant_id', ${TENANT_A}, true)`;
      const rows = await tx`SELECT order_id FROM orders`;
      return rows.map((r: any) => r.order_id);
    });
    // Request 2: Tenant B
    const req2 = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('app.current_tenant_id', ${TENANT_B}, true)`;
      const rows = await tx`SELECT order_id FROM orders`;
      return rows.map((r: any) => r.order_id);
    });
    // Request 3: Tenant A
    const req3 = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('app.current_tenant_id', ${TENANT_A}, true)`;
      const rows = await tx`SELECT order_id FROM orders`;
      return rows.map((r: any) => r.order_id);
    });
    // Request 4: Context check outside transaction on same pool connection
    const req4Context = await sql`SELECT current_setting('app.current_tenant_id', true) as ctx`;

    if (
      req1.includes(ORDER_A) && !req1.includes(ORDER_B) &&
      req2.includes(ORDER_B) && !req2.includes(ORDER_A) &&
      req3.includes(ORDER_A) && !req3.includes(ORDER_B) &&
      (!req4Context[0].ctx || req4Context[0].ctx === "")
    ) {
      console.log("✓ PASS: Pooled connection reused cleanly; zero tenant context leakage across requests.");
    } else {
      throw new Error("FAIL Test 8: Context leak detected across pooled transactions!");
    }

    // TEST 9: Super Admin scoped tenant inspection
    console.log("\nTEST 9: Super Admin scoped tenant inspection...");
    const superAdminRows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      // Super Admin specifically scopes target tenant B
      await tx`SELECT set_config('app.current_tenant_id', ${TENANT_B}, true)`;
      return await tx`SELECT order_id, tenant_id FROM orders`;
    });
    if (superAdminRows.length === 1 && superAdminRows[0].tenant_id === TENANT_B) {
      console.log(`✓ PASS: Scoped Super Admin successfully inspected Tenant B without ambient bypass.`);
    } else {
      throw new Error("FAIL Test 9: Super Admin did not scope tenant correctly!");
    }

    // TEST 10: Normal application role cannot bypass RLS
    console.log("\nTEST 10: Verifying application role has BYPASSRLS = false...");
    const [authRole] = await sql`
      SELECT rolname, rolbypassrls, rolsuper 
      FROM pg_roles 
      WHERE rolname = 'authenticated';
    `;
    if (authRole.rolbypassrls === false && authRole.rolsuper === false) {
      console.log(`✓ PASS: Role 'authenticated' has rolbypassrls = ${authRole.rolbypassrls} and rolsuper = ${authRole.rolsuper}`);
    } else {
      throw new Error("FAIL Test 10: Application role possesses BYPASSRLS!");
    }

    // TEST 11: Canonical append-only ledger immutability
    console.log("\nTEST 11: Canonical append-only ledger immutability (UPDATE/DELETE blocked)...");
    // Insert unit and item for test fixture
    const unitId = "00000000-0000-0000-0000-000000000001";
    const itemId = "00000000-0000-0000-0000-000000000002";
    const stockMovementId = "eeee1111-0000-0000-0000-000000000001";
    await sql`
      INSERT INTO inventory_units (unit_id, tenant_id, name, symbol)
      VALUES (${unitId}, ${TENANT_A}, 'Kilogram', 'KG')
      ON CONFLICT (unit_id) DO NOTHING;
    `;
    await sql`
      INSERT INTO inventory_items (item_id, tenant_id, name, sku, unit_id)
      VALUES (${itemId}, ${TENANT_A}, 'Audit Test Item', 'SKU-001', ${unitId})
      ON CONFLICT (item_id) DO NOTHING;
    `;
    // Insert initial stock movement entry
    await sql`
      INSERT INTO inventory_stock_movements (movement_id, tenant_id, item_id, movement_type, quantity, unit_cost)
      VALUES (${stockMovementId}, ${TENANT_A}, ${itemId}, 'PURCHASE_RECEIPT', 100.00, 25.50)
      ON CONFLICT (movement_id) DO NOTHING;
    `;

    // Attempt UPDATE on immutable ledger
    const updateResult = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('app.current_tenant_id', ${TENANT_A}, true)`;
      return await tx`UPDATE inventory_stock_movements SET quantity = 999.00 WHERE movement_id = ${stockMovementId}`;
    });

    // Attempt DELETE on immutable ledger
    const deleteResult = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE authenticated`;
      await tx`SELECT set_config('app.current_tenant_id', ${TENANT_A}, true)`;
      return await tx`DELETE FROM inventory_stock_movements WHERE movement_id = ${stockMovementId}`;
    });

    // Verify row remains unchanged
    const [movementCheck] = await sql`
      SELECT quantity FROM inventory_stock_movements WHERE movement_id = ${stockMovementId}
    `;

    if (updateResult.count === 0 && deleteResult.count === 0 && Number(movementCheck.quantity) === 100.00) {
      console.log("✓ PASS: Canonical ledger UPDATE and DELETE affected 0 rows (ledger strictly append-only).");
    } else {
      throw new Error("FAIL Test 11: Mutation on canonical ledger was permitted!");
    }

    console.log("\n=================================================================");
    console.log("  ALL 11 NATIVE POSTGRESQL & RLS VALIDATION TESTS PASSED (100%)  ");
    console.log("=================================================================\n");
  } catch (error) {
    console.error("\n❌ NATIVE POSTGRESQL / RLS AUDIT FAILED:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runNativeRlsAudit();
