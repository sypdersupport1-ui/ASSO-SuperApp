# ADR-002: PostgreSQL / Supabase as Primary Data Store

**Status**: Accepted (Direction — not yet provisioned)  
**Date**: 2026-09-26  
**Deciders**: Human Product Owner, Antigravity

---

## Context

ASSO requires a transactional data store that supports:
- Multi-tenant data isolation
- Financial data integrity
- ACID transactions
- Strong schema migrations
- Scalability for a multi-tenant SaaS

---

## Decision

**PostgreSQL via Supabase** is the preferred transactional data platform direction for ASSO.

This is a strategic direction to evaluate during Phase 3. No database is provisioned during Phase 2.

---

## Rationale

1. **ACID guarantees**: Financial and inventory operations require strong transactional integrity. PostgreSQL provides this natively.

2. **Row-Level Security (RLS)**: PostgreSQL's built-in RLS provides a database-enforced second layer of tenant isolation — even if application-level tenant filtering has a bug, RLS prevents cross-tenant data leakage.

3. **Supabase provides**: Managed PostgreSQL + RLS + Auth + Storage + Realtime — reducing operational overhead for a small team.

4. **Proven multi-tenancy**: PostgreSQL supports shared schema with RLS-based tenant isolation (our chosen model) efficiently.

5. **Relational model**: ASSO's domain has strong relational integrity requirements (foreign keys, constraints, transactions). A relational database is the correct fit.

6. **Connection pooling**: Supabase includes PgBouncer for connection management.

7. **Schema migrations**: PostgreSQL has excellent migration tooling.

---

## Multi-Tenancy Approach

Shared schema with `tenant_id` column on every table + RLS policies:

```sql
-- All tenant-scoped tables have this pattern
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

This is chosen over:
- **Separate databases per tenant**: Too complex to operate at SaaS scale
- **Separate schemas per tenant**: Schema management complexity grows with tenant count

---

## Consequences

**Positive**:
- Supabase reduces ops burden (managed backups, RLS, auth, storage)
- RLS provides defense-in-depth for tenant isolation
- Strong consistency for financial operations
- Excellent tooling ecosystem

**Negative / Trade-offs**:
- Supabase vendor dependency (mitigated by using standard PostgreSQL — can migrate to managed PostgreSQL elsewhere)
- PostgreSQL connection limits (mitigated by PgBouncer connection pooling)

---

## Review Trigger

Revisit if:
- Supabase pricing or operational constraints become a problem at scale
- Analytical query performance degrades significantly (evaluate read replicas or analytical store)
- A specific engine requires a fundamentally different storage model (e.g., time-series for metrics)
