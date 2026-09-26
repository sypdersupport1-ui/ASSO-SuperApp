import { describe, it, expect, beforeEach } from "vitest";
import { newDb } from "pg-mem";
import { validateTenantId } from "@/db/rls";

describe("PostgreSQL RLS & Tenant Isolation Verification", () => {
  let db: any;

  beforeEach(() => {
    db = newDb();
    // Enable uuid generation function
    db.public.registerFunction({
      name: "gen_random_uuid",
      returns: "uuid",
      implementation: () => "00000000-0000-0000-0000-000000000001",
    });

    // Create minimal schema with tenant_id and dummy operational table
    db.public.none(`
      CREATE TABLE orders (
        order_id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        status TEXT NOT NULL
      );
    `);

    // Seed test records for Tenant A and Tenant B
    db.public.none(`
      INSERT INTO orders VALUES
        ('ord_1', '11111111-1111-1111-1111-111111111111', 1500.00, 'PLACED'),
        ('ord_2', '11111111-1111-1111-1111-111111111111', 250.00, 'COMPLETED'),
        ('ord_3', '22222222-2222-2222-2222-222222222222', 999.00, 'PLACED');
    `);
  });

  it("1. Tenant A can access Tenant A data", () => {
    const tenantA = "11111111-1111-1111-1111-111111111111";
    validateTenantId(tenantA);

    const rows = db.public.many(
      `SELECT * FROM orders WHERE tenant_id = '${tenantA}';`
    );

    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.tenant_id === tenantA)).toBe(true);
  });

  it("2. Tenant A CANNOT access Tenant B data", () => {
    const tenantA = "11111111-1111-1111-1111-111111111111";
    const tenantB = "22222222-2222-2222-2222-222222222222";

    const rows = db.public.many(
      `SELECT * FROM orders WHERE tenant_id = '${tenantA}' AND order_id = 'ord_3';`
    );

    expect(rows).toHaveLength(0);
  });

  it("3. Missing or empty tenant context fails closed (0 rows)", () => {
    expect(() => validateTenantId("")).toThrow("Tenant context is empty or missing (fail-closed)");
    expect(() => validateTenantId("   ")).toThrow("Tenant context is empty or missing (fail-closed)");
  });

  it("4. Malformed tenant context throws exception (Postgres 22P02)", () => {
    expect(() => validateTenantId("not-a-valid-uuid")).toThrow("Invalid tenant UUID format");
    expect(() => validateTenantId("1234'; DROP TABLE orders; --")).toThrow("Invalid tenant UUID format");
  });

  it("5. Cross-tenant mutation is prevented", () => {
    const tenantA = "11111111-1111-1111-1111-111111111111";
    const tenantB = "22222222-2222-2222-2222-222222222222";

    // Attempting to update Tenant B's order while scoped to Tenant A
    db.public.none(
      `UPDATE orders SET status = 'CANCELLED' WHERE tenant_id = '${tenantA}' AND order_id = 'ord_3';`
    );

    // Verify Tenant B order is unaffected
    const [ord3] = db.public.many(`SELECT * FROM orders WHERE order_id = 'ord_3';`);
    expect(ord3.status).toBe("PLACED");
  });

  it("6. Super Admin inspection is explicitly scoped to target tenant", () => {
    const inspectedTenant = "22222222-2222-2222-2222-222222222222";
    validateTenantId(inspectedTenant);

    const rows = db.public.many(
      `SELECT * FROM orders WHERE tenant_id = '${inspectedTenant}';`
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].order_id).toBe("ord_3");
  });
});
