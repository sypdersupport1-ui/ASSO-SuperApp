# ASSO — PHASE 7 HOTEL VERTICAL: SLICE 7 — QR + CUSTOMER DIGITAL EXPERIENCE

> **Status:** COMPLETE & VERIFIED  
> **Phase:** 7 (Hotel Vertical Integration)  
> **Slice:** 7 (QR + Customer Digital Experience)  
> **Branch:** `feature/phase7-hotel-slice7`  
> **Target Branch:** `develop`  
> **Database:** Dedicated Supabase PostgreSQL (`jtixaywlxkfgtgclgcka.supabase.co`)  
> **RLS:** Native PostgreSQL Row-Level Security Enabled and Forced  
> **Verification Status:** 100% Tests Passing (177/177 automated tests, 11/11 native RLS tests, clean production build)

---

## 1. Domain Ownership & Architectural Principles

Hotel Slice 7 establishes the customer-facing digital experience for Hotel room occupants based on the core architectural axiom:

```text
Physical Room ──► Hotel Room ──► Business Context ──► Opaque QR Token
                                                             │
                                                   Server-Side Resolution
                                                             │
                                                             ▼
                                                Ephemeral Customer Session
                                                             │
                                                             ▼
                                              Room-Scoped Customer Experience
                                                             │
                                                             ▼
                                                Shared Service Requests
```

### Core Axiom:
```text
QR = CONTEXT
QR ≠ AUTHORIZATION
```

* **Context Identification:** A QR code strictly identifies a physical context (a specific hotel room belonging to an authorized property and tenant).
* **Server-Side Authority:** QR token possession does not grant staff privileges, administrative rights, or bypass authorization gates.
* **Ephemeral Scope:** Customer sessions are time-bounded (4 hours default), room-context bound, tenant isolated, and non-privileged.

---

## 2. Token Architecture & Lifecycle

### 2.1 Cryptographic Opaque Tokens
* **Generation:** Generated using `crypto.randomBytes(32).toString('hex')` (256-bit cryptographic entropy).
* **Lookup & Storage:** Tokens are unique and non-guessable. Stored in `qr_tokens` table with status tracking and foreign key link to `business_contexts`.
* **Zero Sensitive Exposure:** QR tokens never contain staff roles, admin privileges, passwords, JWT signing secrets, guest PII, or financial credentials.

### 2.2 QR Lifecycle State Machine
```text
┌─────────────────┐
│     ACTIVE      │
└────────┬────────┘
         │
         ├── Rotate ──► [Old: REVOKED, Sessions: REVOKED] + [New: ACTIVE]
         │
         └── Revoke ──► [Token: REVOKED, Sessions: REVOKED]
```

* `ACTIVE`: Token is valid for server-side resolution and session issuance.
* `REVOKED`: Token is invalidated. Any customer attempt to resolve returns HTTP 400 (`QR_REVOKED`).
* `ROTATION`: Atomic database operation that revokes the current active token, terminates associated active customer sessions, and provisions a fresh high-entropy opaque token.

---

## 3. Server-Side QR Resolution & Customer Sessions

### 3.1 Public Resolution Flow (`GET /api/v1/customer/qr/[token]`)
1. Lookup opaque token in PostgreSQL `qr_tokens`.
2. Validate token exists and status is `ACTIVE` (returns HTTP 404 if missing, HTTP 400 if revoked).
3. Validate associated `business_contexts` and `hotel_rooms` records.
4. Verify room operational status (blocks resolution if room is inactive).
5. Detect active guest stay (if any) via `hotel_stays` and safely resolve guest first name for personalized greeting without exposing PII.
6. Create ephemeral record in `customer_sessions` table with device fingerprint and 4-hour expiration.
7. Mint a cryptographically signed Customer JWT with `sessionType = 'CUSTOMER'`, `contextId`, `outletId`, and `tenantId`.
8. Return safe context payload (room number, property name, available service categories, stay greeting).

### 3.2 Customer Session JWT Structure
```json
{
  "sub": "<sessionId>",
  "tenantId": "<tenantId>",
  "outletId": "<outletId>",
  "contextId": "<contextId>",
  "sessionType": "CUSTOMER",
  "roles": [],
  "permissions": [],
  "isSuperAdmin": false,
  "exp": 1790538000
}
```

---

## 4. Customer Service Requests

Customer service requests integrate directly with the shared platform `service_requests` engine (`src/db/schema/operations.ts`):

* **Context Immutability:** The server extracts `tenantId`, `outletId`, and `contextId` directly from the authenticated Customer JWT. The client cannot supply or override the room or property.
* **Allowed Customer Categories:**
  - `HOUSEKEEPING`: Extra towels, room cleaning, turndown service, extra bedding.
  - `AMENITY`: Dental kit, vanity kit, bathrobes, water bottles, coffee pods.
  - `GUEST_ASSISTANCE`: Luggage assistance, wake-up call, general inquiries.
  - `MAINTENANCE`: AC adjustment, plumbing report, lighting or TV assistance.
  - `OTHER`: Custom guest requests.
* **Customer Status Mapping:**
  - `OPEN` / `ASSIGNED` ──► "Submitted" (Blue)
  - `IN_PROGRESS` ──► "In Progress" (Amber)
  - `RESOLVED` / `CLOSED` ──► "Completed" (Emerald)
* **Metadata & Audit:** Internal staff notes and audit logs are shielded from customer view.

---

## 5. Customer Realtime (SSE) Scoping

Customer realtime updates use Server-Sent Events (`/api/v1/customer/realtime`):
* **Context-Bound Delivery:** The customer SSE stream authenticates via customer session JWT and subscribes only to events matching both `tenantId` and `contextId`.
* **Zero Staff Event Leakage:** Staff maintenance feeds, front office queues, and cross-room events are completely filtered out.
* **Emitted Events:**
  - `service_request.created`
  - `service_request.updated`
  - `service_request.completed`

---

## 6. Staff QR Administration

Hotel staff manage room QR codes directly via `/hotel/rooms` and dedicated administrative APIs:
* `GET /api/v1/hotel/rooms/[id]/qr`: View room QR details and SVG QR code data URI.
* `POST /api/v1/hotel/rooms/[id]/qr/rotate`: Atomically rotate room QR token and invalidate previous active token.
* `POST /api/v1/hotel/rooms/[id]/qr/revoke`: Revoke room QR token and disconnect existing sessions.
* **Security & Entitlements:** Staff QR operations enforce `HOTEL` module entitlement and `hotel.rooms.manage` RBAC permissions with audit logging (`hotel.qr.created`, `hotel.qr.rotated`, `hotel.qr.revoked`).

---

## 7. API Reference

### Customer Public / Session APIs
| Route | Method | Auth | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/customer/qr/[token]` | `GET` | Public | Resolves opaque QR token and returns ephemeral customer session & safe context |
| `/api/v1/customer/session` | `GET` | Bearer (Customer) | Validates active customer session and retrieves current context & active stay info |
| `/api/v1/customer/service-requests` | `GET` | Bearer (Customer) | Lists service requests created for the authenticated room context |
| `/api/v1/customer/service-requests` | `POST` | Bearer (Customer) | Submits a new customer service request bound to session context |
| `/api/v1/customer/service-requests/[id]` | `GET` | Bearer (Customer) | Retrieves service request details if belonging to session context |
| `/api/v1/customer/realtime` | `GET` | Bearer (Customer) | SSE realtime stream scoped strictly to room context |

### Staff QR Administration APIs
| Route | Method | Required Permission | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/hotel/rooms/[id]/qr` | `GET` | `hotel.read` / `hotel.rooms.manage` | Fetch room QR token, customer URL, and SVG data URI |
| `/api/v1/hotel/rooms/[id]/qr/rotate` | `POST` | `hotel.rooms.manage` | Atomically rotate room QR token and revoke old token |
| `/api/v1/hotel/rooms/[id]/qr/revoke` | `POST` | `hotel.rooms.manage` | Revoke active QR token and terminate active customer sessions |

---

## 8. Security & Privilege Separation Matrix

| Actor / Token Type | Access to `/hotel/*` Staff UI | Access to `/api/v1/hotel/*` Staff APIs | Access to `/hotel/guest` Customer Portal | Can Pick Arbitrary Room ID | Access to Other Rooms' Data |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Customer Session** | ❌ Blocked | ❌ 403 Forbidden | ✅ Allowed | ❌ Server Bound | ❌ 404 Isolated |
| **Hotel Staff** | ✅ Allowed | ✅ Allowed (RBAC) | ✅ Allowed | ✅ Property Scoped | ✅ Property Scoped |
| **Unauthenticated** | ❌ Redirect | ❌ 401 Unauthorized | ✅ (With QR token) | ❌ N/A | ❌ 401 / 404 |

---

## 9. Verification & Quality Gates

### 9.1 Automated Test Execution Summary
* **Total Test Files:** 21 files (100% passing)
* **Total Unit & Integration Tests:** 177 tests (100% passing)
* **Dedicated Slice 7 Suites:**
  - `tests/integration/hotel-slice7-qr-customer.test.ts` (12 tests)
  - `tests/security/customer-session-security.test.ts` (6 tests)

### 9.2 Native Supabase PostgreSQL RLS Audit
* **RLS Script:** `npm run db:verify:rls`
* **Result:** 11/11 native PostgreSQL tests passing (100%), verifying cross-tenant isolation, missing context fail-closed, injection resilience, and ledger immutability.

### 9.3 Production Build Verification
* **Command:** `npm run build`
* **Result:** Clean Next.js 15 production build with zero TypeScript or lint errors. Static and dynamic customer routes compiled successfully.

---

## 10. Scope Boundaries & Deferred Features

In strict adherence to the ASSO roadmap:
* **Room Service / F&B:** Zero food & beverage menus, carts, or ordering implemented (Slice 8).
* **Folio & Billing:** Zero billing, charges, payments, or refunds implemented (Slice 9).
* **Cinema & Restaurant:** Zero vertical pollution.
