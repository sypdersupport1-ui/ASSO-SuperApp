# ADR-006: Shared Schema Multi-Tenancy with RLS

**Status**: Accepted  
**Date**: 2026-09-26  
**Deciders**: Human Product Owner, Antigravity

---

## Context

ASSO must provide complete data isolation between tenants. Three common approaches exist:
1. Separate database per tenant
2. Separate schema per tenant
3. Shared schema with tenant_id column + Row-Level Security

---

## Decision

ASSO uses **shared schema with `tenant_id` column on every table + PostgreSQL Row-Level Security (RLS)**.

---

## Rationale

1. **Operational simplicity**: Separate databases per tenant requires managing N database instances. For a SaaS with potentially hundreds of tenants, this is operationally impractical for a small team.

2. **Separate schema per tenant**: Schema management complexity grows linearly with tenant count. Running migrations across all schemas is complex and error-prone.

3. **Shared schema + RLS**: Single set of tables, single migration process, strong database-enforced isolation via RLS policies. This is the standard approach for PostgreSQL-based SaaS platforms.

4. **Defense-in-depth**: The application enforces tenant scoping in the repository layer AND PostgreSQL enforces it via RLS. Two independent layers of protection.

---

## Implementation

```sql
-- Every tenant-scoped table:
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Application sets per-connection setting before queries:
SET LOCAL app.current_tenant_id = 'org_xyz';
```

Super Admin access uses a privileged role that bypasses RLS (with all operations audit-logged).

---

## Index Strategy

All tenant-scoped tables have `tenant_id` as the leading column in composite indexes to ensure queries are always filtered to a single tenant's data.

---

## Consequences

**Positive**:
- Simple migration process (one schema)
- Operationally lean (one database cluster)
- Two-layer tenant isolation

**Negative / Trade-offs**:
- Data for all tenants is in the same tables — requires disciplined query practices
- RLS bypassed by super admin requires careful audit logging
- Table size grows with tenant count (mitigated by partitioning at scale)

---

## Review Trigger

Revisit if a specific enterprise customer has regulatory requirements for physical data separation that cannot be met by logical RLS isolation.
