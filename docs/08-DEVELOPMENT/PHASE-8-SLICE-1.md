# ASSO — Phase 8 / Slice 1: Shared Transaction Events & Communication Foundation

**Vertical**: Cross-Vertical Shared Platform  
**Slice**: 1 — Shared Transaction Events + Communication Foundation  
**Status**: Completed & Verified  
**Date**: 2026-10-01  
**Branch**: `feature/phase8-shared-communication-foundation`  

---

## 1. Overview & Objective

Phase 8 Slice 1 establishes the canonical event-driven communication backbone for ASSO across Hotel, Restaurant, and Cinema verticals.

The target architecture enforces a strict server-authoritative unidirectional flow:
```text
Business Transaction
    ↓
Authoritative Server Validation
    ↓
Atomic Database Commit (BEGIN ... business mutation + outbox row ... COMMIT)
    ↓
Trusted Domain Event
    ↓
Transactional Outbox (PostgreSQL)
    ↓
Communication Processing Engine
    ├── In-App Adapter (Active & Durable)
    ├── SMS / TRAI DLT Adapter (Architecture-Ready Stub)
    └── WhatsApp Cloud API Adapter (Architecture-Ready Stub)
```

Business modules (Hotel, Restaurant, Cinema) **never** directly invoke third-party communication providers or craft external notification payloads. They mutate business state and record trusted domain events within the same atomic PostgreSQL transaction.

---

## 2. Core Security & Authority Principles

1. **Server-Side Authority Only**:
   - The client can **never** trigger or spoof a success event.
   - Only committed server transactions write domain events to the outbox.
   - Failed checkout produces no `HOTEL_CHECK_OUT_SUCCESS`.
   - Failed order creation produces no `ORDER_CONFIRMED`.
   - Failed payment produces no `BILL_PAYMENT_SUCCESS`.
2. **Strict Tenant & Context Isolation**:
   - Outbox rows, communication logs, and in-app notifications are strictly scoped by `tenant_id` and enforced by PostgreSQL Row Level Security (RLS).
   - Tenant A cannot query or mutate Tenant B notifications or events.
3. **Idempotency & Replay Protection**:
   - Outbox rows enforce unique deduplication keys (`idempotency_key`).
   - Replaying a checkout, payment callback, or order request returns the cached result without creating duplicate outbox records or multiple customer alerts.
4. **Decoupled Failure Boundary**:
   - External communication failures (SMS timeout, WhatsApp downtime) do **not** roll back or invalidate authoritative business transactions.
   - The outbox worker records retry attempts and error details with exponential backoff.
5. **No Third-Party Credentials Committed**:
   - SMS/DLT and WhatsApp adapters are architectural contracts ready for environment injection (`process.env.DLT_API_KEY`, `process.env.WHATSAPP_TOKEN`). No provider secrets are committed.

---

## 3. Database Schema & Migration

Migration file: `src/db/migrations/0008_shared_communication_foundation.sql` (Journal index 8)

### Tables Added

1. **`domain_outbox_events`**:
   - Columns: `outbox_id`, `tenant_id`, `event_id`, `event_type`, `vertical`, `aggregate_type`, `aggregate_id`, `payload`, `status` (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`), `attempt_count`, `max_attempts`, `next_retry_at`, `last_error`, `idempotency_key`, `created_at`, `processed_at`.
   - Constraints: Unique constraint on `(tenant_id, idempotency_key)`.
   - RLS: Enabled with tenant isolation policies.

2. **`communication_templates`**:
   - Columns: `template_id`, `tenant_id`, `event_type`, `vertical`, `channel` (`IN_APP`, `SMS_DLT`, `WHATSAPP`, `EMAIL`), `template_identifier`, `title_template`, `body_template`, `supported_variables`, `is_active`, `created_at`, `updated_at`.
   - Constraints: Unique constraint on `(tenant_id, event_type, channel)`.
   - RLS: Enabled with tenant isolation policies.

3. **`in_app_notifications`**:
   - Columns: `notification_id`, `tenant_id`, `recipient_id`, `recipient_role`, `title`, `body`, `event_type`, `action_url`, `is_read`, `read_at`, `metadata`, `created_at`.
   - RLS: Enabled with tenant isolation policies.

4. **`communication_delivery_logs`**:
   - Columns: `log_id`, `tenant_id`, `event_id`, `channel`, `recipient_phone`, `provider_reference`, `status` (`DISPATCHED`, `FAILED`, `SIMULATED`, `SKIPPED`), `error_message`, `dispatched_at`.
   - RLS: Enabled with tenant isolation policies.

---

## 4. Communication Engine & Channel Adapters

Located in `src/lib/communication/`:

- **`engine.ts`**: Orchestrates event dispatching across active channels, formats messages using template interpolation, handles delivery logging, and catches delivery errors.
- **`adapters/in-app.ts`**: Persists in-app notifications directly to `in_app_notifications` table. Supports customer recipients and role-based staff recipients (`FRONT_DESK`, `HOTEL_ADMIN`, etc.).
- **`adapters/sms-dlt.ts`**: TRAI DLT compliant adapter. Validates Indian and international phone formats (+91/E.164), interpolates registered DLT variable formats, and simulates provider dispatch in sandbox mode.
- **`adapters/whatsapp.ts`**: Meta WhatsApp Cloud API adapter. Formats template payloads, handles phone sanitization, and logs provider references.
- **`templates.ts`**: Default built-in template catalog with fallback interpolation for:
  - `HOTEL_CHECK_IN_SUCCESS`
  - `HOTEL_CHECK_OUT_SUCCESS`
  - `BILL_PAYMENT_SUCCESS`
  - `BILL_GENERATED`
  - `ORDER_CONFIRMED`

---

## 5. Domain Event Integration into Business Workflows

1. **Hotel Check-In**:
   - `src/lib/hotel/stay-service.ts` (`executeCheckIn`):
   - Atomically records `HOTEL_CHECK_IN_SUCCESS` to `domain_outbox_events` with payload containing guest name, masked phone, room number, arrival/departure dates, and reservation ID.
2. **Hotel Check-Out**:
   - `src/lib/hotel/stay-service.ts` (`executeCheckOut`):
   - Atomically records `HOTEL_CHECK_OUT_SUCCESS` with stay number, room number, checkout timestamp, and secure receipt URL.
3. **Folio Payment**:
   - `src/lib/hotel/folio-service.ts` (`recordPayment`):
   - Atomically records `BILL_PAYMENT_SUCCESS` with paid amount, payment method, transaction reference, remaining balance, and secure receipt URL.
4. **Folio Closure**:
   - `src/lib/hotel/folio-service.ts` (`closeFolio`):
   - Atomically records `BILL_GENERATED` with folio number, total amount, closing balance, and secure receipt URL.
5. **Room Service & POS Orders**:
   - `src/lib/hotel/room-service-service.ts` (`createRoomServiceOrder`):
   - Atomically records `ORDER_CONFIRMED` with order number, source channel (`WEB` vs `POS`), items summary, total amount, and delivery room number.

---

## 6. Secure Receipt URLs (HMAC-SHA256)

- Customer URLs never expose raw internal database UUIDs or unverified query params.
- `src/lib/events/types.ts` provides `generateSecureReceiptUrl` and `verifySecureReceiptToken`.
- Endpoint: `GET /api/v1/bills/receipt?token=...`
- Token payload contains `folioId`, `tenantId`, `billNumber`, `amount`, and `exp`, signed with SHA-256 HMAC using `AUTH_JWT_SECRET`. Tampered tokens or expired tokens are rejected with 401/403.

---

## 7. pg-boss Evaluation vs Transactional Outbox

- **Decision**: PostgreSQL-based durable outbox (`domain_outbox_events`) is implemented directly with atomic transactions (`BEGIN ... INSERT outbox ... COMMIT`).
- `pg-boss` is present in the repository dependencies. The batch processor `processOutboxBatch` in `src/lib/events/outbox.ts` can run either synchronously post-commit or as a continuous polling worker / `pg-boss` consumer.
- No external message broker (RabbitMQ/Kafka) or Redis was added speculatively, keeping the modular monolith minimal, reliable, and transactional.

---

## 8. Verification Results

All quality gates passed:

1. **Full Test Suite (`npm test`)**:
   - 29/29 test files passed (100%)
   - 263/263 tests passed (100%)
   - 0 failed, 0 skipped.
2. **Security Test Suite (`npm run test:security`)**:
   - 7/7 test files passed (100%)
   - 42/42 security tests passed (100%)
3. **Native PostgreSQL RLS Suite (`npm run db:verify:rls`)**:
   - 11/11 tests passed (100%)
4. **Typecheck (`npm run typecheck`)**:
   - 0 TypeScript errors.
5. **Next.js Production Build (`npm run build`)**:
   - Compiled successfully. 21 static pages prerendered, all API routes dynamic and optimized.
