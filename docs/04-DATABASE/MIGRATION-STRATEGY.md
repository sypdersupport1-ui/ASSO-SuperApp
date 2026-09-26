# ASSO Database Migration Strategy & Lifecycle

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 3)  
> **Authority:** Aligned with `AGENTS.md` (Strict Environment Isolation, Migration-Based Database Changes)  

---

## 1. Migration Principles & Environment Pipeline

Database schema modifications must follow a deterministic, audited path through isolated environments:

$$\text{LOCAL (Dev)} \longrightarrow \text{PREVIEW (PR Branch)} \longrightarrow \text{STAGING (Pre-Prod)} \longrightarrow \text{PRODUCTION (Live)}$$

### Core Rules
1. **Migration Tooling:** Migrations are written as discrete, timestamp-versioned SQL files managed by Drizzle Migrations or Flyway/Prisma Migrate.
2. **Deterministic Sequencing:** File naming convention is `V<YYYYMMDDHHMMSS>__<short_description>.sql` (e.g., `V20260926120000__create_core_tables.sql`).
3. **No Direct Production DDL:** Manual DDL execution (`psql` / Supabase dashboard) on Production or Staging is strictly forbidden.
4. **Automated Pipeline Application:** Migrations are executed via CI/CD deployment pipelines under controlled service roles before application code deployment.

---

## 2. Zero-Downtime Migration Pattern (Expand & Contract)

To ensure high availability and prevent locking production tables, destructive or breaking schema changes must use the **Expand & Contract Pattern** across two releases:

### Phase 1: Expand (Release N)
- Add new columns as `NULLABLE` or with default values.
- Create new tables or dual-write triggers.
- Create indexes concurrently: `CREATE INDEX CONCURRENTLY idx_...`.
- Deploy application version that writes to both old and new schema, but reads from old.

### Phase 2: Migrate Data (Background Task)
- Backfill historical rows from old column to new column asynchronously in small batches.

### Phase 3: Contract (Release N+1)
- Deploy application version that reads and writes exclusively from new schema.
- Drop triggers and remove deprecated columns: `ALTER TABLE ... DROP COLUMN ...`.

---

## 3. Reversibility & Rollback Strategy

Every migration file must have a verified companion rollback script (`U<timestamp>__...sql` or transactional undo):
- **Schema Additions:** Straightforward rollback via `DROP TABLE` or `DROP COLUMN`.
- **Data Transformations:** Must provide a corresponding compensating transformation script.
- **Pre-Migration Snapshot:** Automated WAL / point-in-time recovery (PITR) backup is verified prior to running migrations against Staging and Production.
