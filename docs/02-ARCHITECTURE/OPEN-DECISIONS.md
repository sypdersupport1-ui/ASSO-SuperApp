# ASSO — Open Decisions Registry

**Phase**: 2 — Master Architecture  
**Status**: Pre-Phase-3 Resolution Completed  
**Last Updated**: 2026-09-26  

This document serves as the single source of truth for all architectural, technical, and product decisions in ASSO. Every decision is tracked with its blocking severity, status, owning authority, resolution timeline, and architectural dependency.

---

## 1. Decision Classification Framework

All decisions are categorized into three blocking levels:

- **Category A — Must be resolved before Phase 3**: Materially impacts the canonical database schema, security isolation model, API structure, or foundational architecture.
- **Category B — Should be resolved before application implementation**: Governs specific implementation workflows, operational depth, or user experience patterns. Does not block database/API architecture.
- **Category C — Can safely remain open**: Pure business policies, advanced features, or integrations that are designed as modular extension points.

Allowed Statuses:
- `RESOLVED` — Architectural direction selected, documented, and approved.
- `PROPOSED` — Clear recommendation formulated; pending final team/milestone confirmation.
- `HUMAN APPROVAL REQUIRED` — Strategic business, commercial, or product choice reserved for the Human Product Owner.
- `DEFERRED` — Safely postponed to a designated future phase without architectural blocking.
- `SUPERSEDED` — Replaced by or merged into another decision record.
- `OPEN` — Under active evaluation.

---

## 2. Master Decision Summary Table

| # | Title | Category | Blocking Level | Status | Owner | Needed By |
|---|---|---|---|---|---|---|
| 1 | Cross-vertical folio charging | Commerce / Hotel | **C** | PROPOSED / OPEN | Product Owner | Phase 4+ |
| 2 | Payment provider selection | Commerce | **A** | RESOLVED (Dir) / HUMAN APPROVAL | Product Owner | Phase 3 Gate |
| 3 | Frontend framework & design system | Technology | **A** | RESOLVED | Antigravity + PO | Phase 3 Gate |
| 4 | Real-time technology (SSE vs WS) | Technology | **A** | RESOLVED | Antigravity | Phase 3 Gate |
| 5 | Module entitlement cache invalidation | Platform | **B** | RESOLVED | Antigravity | Phase 3 Gate |
| 6 | Super Admin MFA enforcement | Security | **A** | RESOLVED | Antigravity + PO | Phase 3 Gate |
| 7 | QR code model (static vs dynamic) | Customer Experience | **B** | RESOLVED | Antigravity | Phase 4 |
| 8 | Multi-device session behavior | Customer Experience | **B** | RESOLVED | Antigravity | Phase 4 |
| 9 | Offline POS capability | Commerce | **A** | RESOLVED | Antigravity + PO | Phase 3 Gate |
| 10 | Multi-currency support scope | Commerce | **B** | RESOLVED | Antigravity + PO | Phase 4 |
| 11 | Multi-language (i18n) scope | Platform | **C** | DEFERRED | Product Owner | Phase 5 |
| 12 | Transactional email provider | Technology | **B** | RESOLVED (Dir) | Antigravity | Phase 4 |
| 13 | SMS provider selection | Technology | **B** | DEFERRED / HUMAN APPROVAL | Product Owner | Phase 4 |
| 14 | Vertical implementation order | Roadmap | **A** | PROPOSED / HUMAN APPROVAL | Product Owner | Phase 3 Gate |
| 15 | Restaurant queue / waitlist scope | Restaurant | **B** | RESOLVED | Antigravity + PO | Phase 4 |
| 16 | Table reservations depth | Restaurant | **B** | RESOLVED | Antigravity + PO | Phase 4 |
| 17 | KDS feature depth | Operations | **B** | RESOLVED | Antigravity | Phase 4 |
| 18 | Cinema QR scope (seat vs area) | Cinema | **B** | RESOLVED | Antigravity | Phase 4 |
| 19 | Cinema concession delivery model | Cinema | **B** | RESOLVED | Antigravity | Phase 4 |
| 20 | Hotel online booking integration | Hotel | **C** | DEFERRED | Product Owner | Phase 5 |
| 21 | Hotel reservation deposit model | Hotel | **B** | RESOLVED | Antigravity | Phase 3/4 |
| 22 | Hotel maintenance module depth | Hotel | **B** | RESOLVED | Antigravity | Phase 4 |
| 23 | Hotel minibar management | Hotel | **C** | DEFERRED | Product Owner | Phase 5 |
| 24 | Pricing & subscription plan model | Platform | **A** | RESOLVED (Arch) / HUMAN APPROVAL | Product Owner | Phase 3 Gate |
| 25 | Cross-tenant customer data sharing | Customer | **C** | RESOLVED (Security Rule) | Antigravity | Phase 3 Gate |
| 26 | Hardware printing requirements | Operations | **B** | RESOLVED | Antigravity | Phase 4 |
| 27 | Recipe & auto-consumption scope | Inventory | **C** | DEFERRED | Product Owner | Phase 5 |
| 28 | Split bill support scope | Commerce | **B** | RESOLVED | Antigravity | Phase 4 |
| 29 | Tipping model | Commerce | **B** | RESOLVED | Antigravity | Phase 4 |
| 30 | File upload virus scanning | Security | **C** | DEFERRED | Antigravity | Phase 5 |
| 31 | Browser push notifications scope | Notifications | **B** | RESOLVED | Antigravity | Phase 4 |
| 32 | Customer session merge at context | Customer Experience | **B** | RESOLVED | Antigravity | Phase 4 |
| 33 | Encrypted message storage for chat | Security / Privacy | **C** | RESOLVED | Antigravity | Phase 3 Gate |
| 34 | Data retention & archival policies | Operations / Legal | **C** | DEFERRED | Product Owner | Phase 5 |
| 35 | Super admin MFA enforcement | Security | **A** | SUPERSEDED | Antigravity | — |

---

## 3. Detailed Decision Records

---

### Decision 1: Cross-Vertical Folio Charging

- **ID**: `DEC-001`
- **Title**: Cross-Vertical Folio Charging (Restaurant / Cinema to Hotel)
- **Category**: Commerce / Hotel
- **Blocking Level**: **Category C** (Can safely remain open; designed as extension point)
- **Status**: `PROPOSED / OPEN DECISION`
- **Owner**: Human Product Owner
- **Decision Needed By**: Phase 4+ (Mixed property deployment)
- **Options**:
  1. *Option 1*: Not supported in initial scope; each outlet bills and settles independently.
  2. *Option 2*: Supported via shared Billing Engine inter-outlet folio charge posting.
- **Current Direction**: **Option 1**. Cross-vertical folio charging is **not** part of approved initial scope. The shared Billing Engine design provides the data hooks to post external charges to a `guest_folio`, but the workflow remains disabled by default until explicitly authorized by the Product Owner.
- **Dependencies**: Billing Engine, Hotel Guest Folio, Multi-Tenancy.

---

### Decision 2: Payment Provider Selection

- **ID**: `DEC-002`
- **Title**: Payment Provider Selection and Gateway Integration Architecture
- **Category**: Commerce
- **Blocking Level**: **Category A** (Must be resolved before Phase 3)
- **Status**: `RESOLVED (Directional Architecture) / HUMAN APPROVAL REQUIRED (Commercial Gateway)`
- **Owner**: Human Product Owner & Antigravity
- **Decision Needed By**: Phase 3 Gate
- **Options**:
  1. *Option 1*: Tight coupling to Razorpay.
  2. *Option 2*: Tight coupling to Stripe.
  3. *Option 3*: Provider-neutral Payment Gateway Adapter pattern (`PaymentGatewayAdapter`).
- **Current Direction**: **Option 3 (ADR-011)**. Domain logic is 100% provider-agnostic. The recommended production directional gateway for India-first launch is **Razorpay** (native UPI, cards, netbanking), while local development, preview, and CI environments strictly use **`MockPaymentAdapter`**. Final commercial provider selection requires human sign-off.
- **Dependencies**: Payment Engine, Billing Engine.

---

### Decision 3: Frontend Framework and Design System

- **ID**: `DEC-003`
- **Title**: Frontend Framework, Routing Architecture, and Design System
- **Category**: Technology
- **Blocking Level**: **Category A** (Must be resolved before Phase 3)
- **Status**: `RESOLVED`
- **Owner**: Antigravity & Human Product Owner
- **Decision Needed By**: Phase 3 Gate
- **Options**:
  1. *Option 1*: Multi-repo or monorepo with 3 distinct frontend apps (Vite/Next).
  2. *Option 2*: Single Next.js (App Router) codebase serving 3 distinct route surfaces (`/c`, `/b`, `/sa`) with Tailwind CSS and Radix UI / shadcn/ui design tokens.
  3. *Option 3*: Vanilla SPA with custom CSS framework.
- **Current Direction**: **Option 2 (ADR-009)**. Single Next.js App Router codebase. Server Components for ultra-fast customer QR initial render; Client Components for rich console/KDS interactions. Tailwind CSS with CSS custom properties for semantic design tokens. Headless accessible primitives via Radix UI (shadcn pattern).
- **Dependencies**: Delivery Strategy, Vercel Preview Deployments.

---

### Decision 4: Real-Time Technology

- **ID**: `DEC-004`
- **Title**: Real-Time Architecture for KDS, Service Requests, Orders, and Chat
- **Category**: Technology
- **Blocking Level**: **Category A** (Must be resolved before Phase 3)
- **Status**: `RESOLVED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 3 Gate
- **Options**:
  1. *Option 1*: Dedicated WebSocket cluster (Socket.IO / custom server).
  2. *Option 2*: Short-polling only.
  3. *Option 3*: Hybrid Real-Time Architecture: Server-Sent Events (SSE) for server-to-client push (`GET /api/v1/realtime/stream`) + standard HTTP POST/PATCH for all client actions + exponential backoff polling fallback.
- **Current Direction**: **Option 3 (ADR-010)**. Eliminates stateful socket infrastructure. Works seamlessly over HTTP/2 on Vercel/Supabase. Chat messages are sent via standard HTTP POST and pushed to recipients via SSE.
- **Dependencies**: Backend Architecture, Fulfillment Engine, Conversation Engine.

---

### Decision 5: Module Entitlement Cache Invalidation (Multi-Instance)

- **ID**: `DEC-005`
- **Title**: Module Entitlement Cache Invalidation Across Application Instances
- **Category**: Platform
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 3 Gate
- **Options**:
  1. *Option 1*: In-process LRU cache with short TTL (5 minutes) and local invalidation.
  2. *Option 2*: PostgreSQL `LISTEN/NOTIFY` pub/sub channel for cross-instance invalidation.
  3. *Option 3*: Redis pub/sub.
- **Current Direction**: **Option 1 initially; Option 2 for horizontal scaling**. Single-instance development and early preview use short TTL (5 min). When horizontal scaling is introduced, PostgreSQL `LISTEN/NOTIFY` will broadcast invalidations across nodes. Redis is not introduced.
- **Dependencies**: Module Entitlement Engine, Database Architecture.

---

### Decision 6: Super Admin MFA Enforcement

- **ID**: `DEC-006` (Merges and supersedes DEC-035)
- **Title**: Multi-Factor Authentication (MFA) Enforcement for Super Admins
- **Category**: Security
- **Blocking Level**: **Category A** (Must be resolved before Phase 3)
- **Status**: `RESOLVED`
- **Owner**: Antigravity & Human Product Owner
- **Decision Needed By**: Phase 3 Gate
- **Options**:
  1. *Option 1*: Optional MFA for Super Admins.
  2. *Option 2*: Mandatory MFA (TOTP) for Super Admin accounts in production; bypassable via environment config in local/preview environments.
- **Current Direction**: **Option 2**. Super Admin accounts possess platform-wide privilege and bypass tenant RLS. MFA is mandatory for production. Auth schema will include TOTP secret fields.
- **Dependencies**: Identity Engine, Security Architecture.

---

### Decision 7: QR Code Model (Static vs Dynamic)

- **ID**: `DEC-007`
- **Title**: QR Code Model and Token Binding Strategy
- **Category**: Customer Experience
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 4
- **Options**:
  1. *Option 1*: Third-party dynamic QR redirect service.
  2. *Option 2*: Static printed QR codes embedding cryptographically opaque tokens resolved entirely by the ASSO API.
- **Current Direction**: **Option 2 (ADR-008)**. QR codes embed permanent opaque tokens (`/c/:token`). Server-side resolution maps the token to `(tenant_id, outlet_id, context_id)`. Tokens can be rotated or disabled in the database without reprinting physical QR stickers.
- **Dependencies**: QR Engine, Context Engine.

---

### Decision 8: Multi-Device Session Behavior at Same Context

- **ID**: `DEC-008` (Aligned with DEC-032)
- **Title**: Multi-Device Session Behavior at Same Room / Table
- **Category**: Customer Experience
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 4
- **Options**:
  1. *Option 1*: Single session lock (only one phone can access context at a time).
  2. *Option 2*: Shared context model (multiple phones receive distinct sessions bound to the same context).
- **Current Direction**: **Option 2**. Multiple guests at Table 7 scan the QR. Each receives a unique customer session token, but all share the underlying `context_id`. Orders placed by any guest appear on the shared table bill and KDS.
- **Dependencies**: Session Engine, Ordering Engine, Billing Engine.

---

### Decision 9: Offline POS Capability

- **ID**: `DEC-009`
- **Title**: Offline POS Architectural Scope and Sync Requirements
- **Category**: Commerce
- **Blocking Level**: **Category A** (Must be resolved before Phase 3)
- **Status**: `RESOLVED`
- **Owner**: Antigravity & Human Product Owner
- **Decision Needed By**: Phase 3 Gate
- **Options**:
  1. *Option 1*: Build full distributed offline synchronization with local SQLite/IndexedDB.
  2. *Option 2*: Online-First POS with network resilience (local memory cart caching, optimistic UI, automatic retries with idempotency keys) and defer offline sync.
- **Current Direction**: **Option 2 (ADR-012)**. Online-first design. Prevents premature multi-master sync complexity and payment fraud liability. Architecture remains forward-compatible via UUID primary keys and immutable stock ledgers.
- **Dependencies**: POS Engine, Ordering Engine, Inventory Engine.

---

### Decision 10: Multi-Currency Support Scope

- **ID**: `DEC-010`
- **Title**: Multi-Currency Scope across Tenants and Outlets
- **Category**: Commerce
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED (Initial Scope)`
- **Owner**: Antigravity & Human Product Owner
- **Decision Needed By**: Phase 4
- **Options**:
  1. *Option 1*: Real-time dynamic currency conversion and cross-currency billing.
  2. *Option 2*: Single operating currency configured per tenant/outlet (default: INR `INR`), recorded explicitly on all financial transactions.
- **Current Direction**: **Option 2**. Every outlet specifies its operating currency (ISO-4217). All bills, orders, and payments within that outlet execute in that currency. Multi-currency conversion deferred.
- **Dependencies**: Billing Engine, Payment Engine.

---

### Decision 11: Multi-Language (i18n) Scope

- **ID**: `DEC-011`
- **Title**: Multi-Language Localization Scope
- **Category**: Platform
- **Blocking Level**: **Category C** (Can safely remain open; designed as extension point)
- **Status**: `DEFERRED`
- **Owner**: Human Product Owner
- **Decision Needed By**: Phase 5 (Market Expansion)
- **Current Direction**: English-first for initial release. Frontend UI strings are structured for standard dictionary extraction (`next-intl`). Database catalog items support extensible JSONB for localized names in future.
- **Dependencies**: Frontend Architecture, Catalog Engine.

---

### Decision 12: Transactional Email Provider

- **ID**: `DEC-012`
- **Title**: Transactional Email Provider Adapter
- **Category**: Technology
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED (Directional)`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 4
- **Current Direction**: Abstracted `EmailProviderAdapter`. Resend / AWS SES recommended for production; development and preview environments use a console logger mock.
- **Dependencies**: Notification Engine.

---

### Decision 13: SMS Provider Selection

- **ID**: `DEC-013`
- **Title**: SMS and OTP Gateway Selection
- **Category**: Technology
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `DEFERRED / HUMAN APPROVAL REQUIRED`
- **Owner**: Human Product Owner
- **Decision Needed By**: Phase 4
- **Current Direction**: Abstracted `SmsProviderAdapter`. Commercial provider (Twilio, MSG91, Gupshup for India DLT compliance) deferred until notification implementation. Non-production environments use a mock adapter.
- **Dependencies**: Notification Engine.

---

### Decision 14: Vertical Implementation Order

- **ID**: `DEC-014`
- **Title**: Sequence of Vertical Implementation for Phase 3 and Phase 4
- **Category**: Roadmap
- **Blocking Level**: **Category A** (Must be resolved before Phase 3)
- **Status**: `PROPOSED / HUMAN APPROVAL REQUIRED`
- **Owner**: Human Product Owner
- **Decision Needed By**: Phase 3 Gate
- **Options**:
  1. *Option 1*: Restaurant → Hotel → Cinema
  2. *Option 2*: Hotel → Restaurant → Cinema
- **Current Direction**: **Option 2 Proposed (ADR-013)**. Hotel first exercises 18+ shared engines, proving the most complex stay lifecycles, guest folio billing, and multi-outlet tenancy from Day 1. Restaurant and Cinema follow as streamlined subsets. Final confirmation requires Human Product Owner sign-off.
- **Dependencies**: Roadmap, Vertical Architecture, Delivery Strategy.

---

### Decision 15: Restaurant Queue / Waitlist Scope

- **ID**: `DEC-015`
- **Title**: Initial Feature Depth of Restaurant Walk-in Waitlist
- **Category**: Restaurant
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED`
- **Owner**: Antigravity & Human Product Owner
- **Decision Needed By**: Phase 4
- **Current Direction**: Implemented as an optional modular add-on (`restaurant-queue`). Basic host console waitlist (name, party size, SMS alert, status) included. Can be enabled/disabled via module entitlements.
- **Dependencies**: Restaurant Module, Module Entitlement Engine.

---

### Decision 16: Table Reservations Depth

- **ID**: `DEC-016`
- **Title**: Feature Depth of Table Reservations
- **Category**: Restaurant
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED`
- **Owner**: Antigravity & Human Product Owner
- **Decision Needed By**: Phase 4
- **Current Direction**: Internal staff booking management (host records phone/walk-in reservations) in initial scope. Public-facing web reservation widget deferred to future phase.
- **Dependencies**: Restaurant Module.

---

### Decision 17: KDS Feature Depth

- **ID**: `DEC-017`
- **Title**: Kitchen Display System (KDS) Station Routing and Capabilities
- **Category**: Operations
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 4
- **Current Direction**: Multi-station routing (Kitchen vs Bar vs Concession) with item-level status toggles (`PENDING`, `PREPARING`, `READY`) and color-coded order aging timers. Bump-bar hardware integration deferred.
- **Dependencies**: Fulfillment Engine.

---

### Decision 18: Cinema QR Scope (Seat vs Screen Area)

- **ID**: `DEC-018`
- **Title**: QR Code Granularity in Cinema Vertical
- **Category**: Cinema
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 4
- **Current Direction**: Support both options via Context Engine: `context_type = SEAT` (seat-level QR for premium in-seat delivery) and `context_type = SCREEN_AREA` (hall/row QR for counter pickup). Selected by cinema operator during outlet onboarding.
- **Dependencies**: Cinema Module, Context Engine.

---

### Decision 19: Cinema Concession Delivery Model

- **ID**: `DEC-019`
- **Title**: Concession Fulfillment Model (Counter Pickup vs Seat Delivery)
- **Category**: Cinema
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 4
- **Current Direction**: Configurable per cinema outlet. Default: Counter Pickup (patron receives notification when order is ready at concession). In-seat delivery enabled for VIP screens.
- **Dependencies**: Cinema Module, Fulfillment Engine.

---

### Decision 20: Hotel Online Booking Integration

- **ID**: `DEC-020`
- **Title**: Hotel Channel Manager / Online Booking Integration
- **Category**: Hotel
- **Blocking Level**: **Category C** (Can safely remain open; designed as extension point)
- **Status**: `DEFERRED`
- **Owner**: Human Product Owner
- **Decision Needed By**: Phase 5
- **Current Direction**: Direct front-desk walk-in check-in and phone reservations in initial scope. OTA channel manager APIs (Booking.com, Agoda) deferred to Phase 5.
- **Dependencies**: Hotel Module.

---

### Decision 21: Hotel Reservation Deposit Model

- **ID**: `DEC-021`
- **Title**: Hotel Advance Reservation Deposits and Prepayments
- **Category**: Hotel
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 3/4
- **Current Direction**: Advance deposits are recorded as credit entries on the `guest_folio` upon receipt, settled via Payment Engine. At checkout, deposit is credited against final room tariff and charges.
- **Dependencies**: Hotel Module, Billing Engine, Payment Engine.

---

### Decision 22: Hotel Maintenance Module Depth

- **ID**: `DEC-022`
- **Title**: Hotel Engineering / Asset Maintenance Depth
- **Category**: Hotel
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 4
- **Current Direction**: Reuses the shared Service Request Engine (`department = 'Maintenance'`, `category = 'Room Maintenance'`). Room status automatically transitions to `MAINTENANCE` during active work. No separate maintenance engine created.
- **Dependencies**: Service Request Engine, Hotel Module.

---

### Decision 23: Hotel Minibar Management

- **ID**: `DEC-023`
- **Title**: Minibar Inventory Tracking and Automated Billing
- **Category**: Hotel
- **Blocking Level**: **Category C** (Can safely remain open; designed as extension point)
- **Status**: `DEFERRED`
- **Owner**: Human Product Owner
- **Decision Needed By**: Phase 5
- **Current Direction**: Manual consumption entry: Housekeeping or front-desk staff post consumed minibar items directly to the `guest_folio` during daily room cleaning or checkout. Automated IoT sensors deferred.
- **Dependencies**: Hotel Module, Billing Engine.

---

### Decision 24: Pricing and Plan Model

- **ID**: `DEC-024`
- **Title**: SaaS Pricing, Plan Packaging, and Entitlement Structure
- **Category**: Platform
- **Blocking Level**: **Category A** (Must be resolved before Phase 3)
- **Status**: `RESOLVED (Architectural Model) / HUMAN APPROVAL REQUIRED (Commercial Pricing)`
- **Owner**: Human Product Owner
- **Decision Needed By**: Phase 3 Gate
- **Options**:
  1. *Option 1*: Hard-coded feature flags.
  2. *Option 2*: Multi-tiered plans + modular add-ons + tenant-level manual overrides (`Business Type → Available Modules → Plan → Plan Modules → Tenant Entitlements → Staff Permissions`).
- **Current Direction**: **Option 2**. The data model supports tiered base plans (Starter, Standard, Pro) plus add-on modules and manual tenant overrides. Super Admin manages assignments. Commercial fee amounts (₹/month) remain an open business decision for the Product Owner.
- **Dependencies**: Module Entitlement Engine, Multi-Tenancy Engine.

---

### Decision 25: Cross-Tenant Customer Data Sharing

- **ID**: `DEC-025`
- **Title**: Cross-Tenant Customer Data Sharing Policy
- **Category**: Customer
- **Blocking Level**: **Category C** (Can safely remain open; designed as extension point)
- **Status**: `RESOLVED (Security Rule)`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 3 Gate
- **Current Direction**: Strictly prohibited. All customer records are isolated by `tenant_id`. No global guest directory or shared customer profiles exist across independent tenant organizations. Protects privacy and tenant boundaries.
- **Dependencies**: Customer Engine, Multi-Tenancy Engine.

---

### Decision 26: Hardware Printing Requirements

- **ID**: `DEC-026`
- **Title**: POS Receipt, Kitchen Chit, and Folio Printing
- **Category**: Operations
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 4
- **Current Direction**: Browser native printing (`window.print()`) with print-optimized CSS media queries (80mm thermal receipt format for POS/KDS, standard A4/Letter format for Hotel Folios). Hardware raw TCP/USB bridge daemons deferred.
- **Dependencies**: POS Engine, Fulfillment Engine, Hotel Folio.

---

### Decision 27: Recipe and Auto-Consumption Timeline

- **ID**: `DEC-027`
- **Title**: Automated Bill-of-Materials (BOM) Recipe Depletion
- **Category**: Inventory
- **Blocking Level**: **Category C** (Can safely remain open; designed as extension point)
- **Status**: `DEFERRED`
- **Owner**: Human Product Owner
- **Decision Needed By**: Phase 5
- **Current Direction**: Initial scope utilizes manual periodic consumption recording, physical stocktaking, and batch adjustments. Automated ingredient depletion per order item is deferred to Phase 5.
- **Dependencies**: Inventory Engine, Catalog Engine.

---

### Decision 28: Split Bill Support Scope

- **ID**: `DEC-028`
- **Title**: Bill Splitting Capabilities (Restaurant / Hotel)
- **Category**: Commerce
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 4
- **Current Direction**: Initial scope supports partial payments / split amount settlements (e.g. paying ₹500 via cash and ₹1,000 via UPI against a ₹1,500 bill). Complex per-item fractional split billing deferred.
- **Dependencies**: Billing Engine, Payment Engine.

---

### Decision 29: Tipping Model

- **ID**: `DEC-029`
- **Title**: Customer Tipping Workflow and Settlement
- **Category**: Commerce
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 4
- **Current Direction**: Optional tip line item added to bill summary prior to payment initiation. Recorded explicitly as a distinct ledger entry in `bill_items` and tracked in cash management.
- **Dependencies**: Billing Engine, Cash Management.

---

### Decision 30: File Upload Virus Scanning

- **ID**: `DEC-030`
- **Title**: Virus and Malware Scanning for File Attachments
- **Category**: Security
- **Blocking Level**: **Category C** (Can safely remain open; designed as extension point)
- **Status**: `DEFERRED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 5
- **Current Direction**: Initial security baseline relies on short-lived direct-to-storage signed URLs, strict MIME type validation, file extension whitelisting, and strict size caps (<10MB). Asynchronous ClamAV container scanning deferred to Phase 5.
- **Dependencies**: File Storage Engine.

---

### Decision 31: Browser Push Notifications Scope

- **ID**: `DEC-031`
- **Title**: Web Push Notifications for Staff and Customers
- **Category**: Notifications
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 4
- **Current Direction**: In-app toast alerts, audio chimes, and live status badges driven by SSE for all active staff consoles and KDS displays. Web Push API (Service Worker background push) deferred to mobile app refinement.
- **Dependencies**: Notification Engine, Real-Time Architecture.

---

### Decision 32: Customer Session Merging at Context

- **ID**: `DEC-032`
- **Title**: Customer Session Merging and State Reconciliation
- **Category**: Customer Experience
- **Blocking Level**: **Category B** (Should be resolved before app implementation)
- **Status**: `RESOLVED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 4
- **Current Direction**: Each device scanning the QR code maintains an independent session token attached to the same `context_id`. Context-level state (confirmed orders, active bill) is authoritative and pushed via SSE. Unsubmitted draft carts are local to each device.
- **Dependencies**: Session Engine, Ordering Engine.

---

### Decision 33: Encrypted Message Storage for Chat

- **ID**: `DEC-033`
- **Title**: End-to-End Encryption for Customer-Staff Conversations
- **Category**: Security / Privacy
- **Blocking Level**: **Category C** (Can safely remain open; designed as extension point)
- **Status**: `RESOLVED`
- **Owner**: Antigravity
- **Decision Needed By**: Phase 3 Gate
- **Current Direction**: Standard database-at-rest encryption (AES-256 via PostgreSQL/Supabase disk encryption) and TLS 1.3 in transit. Application-layer client-side E2EE is not required for operational hospitality service chats.
- **Dependencies**: Conversation Engine, Security Architecture.

---

### Decision 34: Data Retention and Archival Policies

- **ID**: `DEC-034`
- **Title**: Automated Data Archival and Retention Lifecycles
- **Category**: Operations / Legal
- **Blocking Level**: **Category C** (Can safely remain open; designed as extension point)
- **Status**: `DEFERRED`
- **Owner**: Human Product Owner
- **Decision Needed By**: Phase 5
- **Current Direction**: Financial, inventory, and audit logs are retained indefinitely in primary PostgreSQL storage during initial operational phases. Partitioned archival to cold storage (S3/Glacier) deferred to Phase 5.
- **Dependencies**: Database Architecture, Audit Engine.

---

### Decision 35: Super Admin MFA Enforcement (Duplicate)

- **ID**: `DEC-035`
- **Title**: Super Admin MFA Enforcement
- **Category**: Security
- **Blocking Level**: **Category A**
- **Status**: `SUPERSEDED`
- **Owner**: Antigravity
- **Resolution**: Merged into **Decision 6 (`DEC-006`)**. See DEC-006 for full record.
- **Dependencies**: Identity Engine.

---

## 4. Pre-Phase-3 Decision Gate Status

All **Category A (Pre-Phase-3 Blocking)** decisions are now resolved or formulated with clear directional architecture awaiting Human sign-off:

1. **DEC-002 (Payment Provider)**: `RESOLVED (Directional: Adapter + Razorpay/Mock)` / `HUMAN APPROVAL REQUIRED (Commercial)`
2. **DEC-003 (Frontend Framework & Design System)**: `RESOLVED` (ADR-009: Next.js App Router, 3 surfaces, Radix/shadcn, Tailwind)
3. **DEC-004 (Real-Time Architecture)**: `RESOLVED` (ADR-010: Hybrid SSE + HTTP Actions + Polling Fallback)
4. **DEC-006 (Super Admin MFA)**: `RESOLVED` (Mandatory in production; bypassable in dev)
5. **DEC-009 (Offline POS)**: `RESOLVED` (ADR-012: Online-First POS with network resilience; offline sync deferred)
6. **DEC-014 (Vertical Implementation Order)**: `PROPOSED (Hotel → Restaurant → Cinema)` / `HUMAN APPROVAL REQUIRED`
7. **DEC-024 (Pricing / Plan Model)**: `RESOLVED (Architectural Hierarchy)` / `HUMAN APPROVAL REQUIRED (Commercial Fees)`
8. **DEC-025 (Cross-Tenant Data Sharing)**: `RESOLVED (Strict Isolation Rule)`
9. **DEC-033 (Chat Encryption)**: `RESOLVED (Standard Encryption at Rest & Transit)`

**No architectural blockers remain for Phase 3 database and API contract design.**
