# ASSO Technology Stack & Technical Specifications

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 3)  
> **Authority:** Aligned with `AGENTS.md` and Phase 2 Architecture (`TECHNOLOGY-EVALUATION.md`)  

---

## 1. Canonical Technology Selection

| Tier / Capability | Selected Technology | Version Standard | Architectural Justification |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | Next.js (App Router) | 15+ / React 19 | Unified full-stack TypeScript, React Server Components (RSC) for rapid initial load, optimal Vercel deployment. |
| **Language** | TypeScript | 5.5+ (Strict Mode) | Full type safety across API boundaries, contracts, database models, and domain events. |
| **Styling & UI Components**| Tailwind CSS + Radix UI | Tailwind v3.4+, Radix Primitives | Headless, accessible primitives with customized design tokens. |
| **Client State & Cache** | TanStack Query | v5+ | Automatic client-side caching, background refetching, and mutation lifecycle. |
| **Validation & Schemas** | Zod | v3.23+ | Single source of truth for runtime validation, API contract parsing, and TypeScript type inference. |
| **ORM / Query Builder** | Drizzle ORM | Latest Stable | Zero-overhead, lightweight SQL builder with first-class TypeScript schema definitions and native RLS support. |
| **System of Record (DB)**| PostgreSQL (Supabase) | PostgreSQL 16+ | Enterprise relational ACID transactions, Row-Level Security (RLS), JSONB indexing, robust tooling. |
| **Background Processing** | pg-boss (PostgreSQL Jobs) | Latest Stable | Reliable transactional job queue without adding Redis to initial infrastructure. |
| **Real-Time Push** | Server-Sent Events (SSE) | HTTP/2 Standard | Lightweight unidirectional event streaming for initial monolith baseline. Note: HTTP/2 improves transport framing, but connection concurrency, worker memory, and fan-out scaling remain explicit future infrastructure considerations. |
| **Payment Gateway** | Provider-Neutral Adapter | `PaymentGatewayAdapter` | Provider-neutral interface (DEC-002). `MockPaymentAdapter` for local/preview/test; commercial gateway implementation deferred. |
| **Hosting & CI/CD** | Vercel | Production Tier | Instant preview environments for PRs, global edge routing, serverless execution. |

---

## 2. Infrastructure-on-Demand & Scalability Invariant

As established in `AGENTS.md` and Phase 2 ADRs:
- Speculative infrastructure (Redis, Kafka, RabbitMQ, Microservices) is strictly prohibited.
- Scalability is achieved through clear domain boundaries, transactional integrity, index optimization, and modular monolith architecture.
- **Real-Time Scaling:** SSE is the initial real-time delivery mechanism. If high-concurrency cross-instance event fan-out warrants it in later phases, a dedicated pub/sub or socket tier will be formally evaluated under documented ADR procedures.
- **Redis:** Redis remains optional and can only be introduced when justified by a documented requirement approved by the Human Product Owner.
