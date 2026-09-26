# ASSO Platform — Engineering Setup & Local Development

> **Phase**: 5 — Foundation Implementation & Operations  
> **Status**: APPROVED FOUNDATION RUNNING ON LOCALHOST  
> **Architecture**: Modular Monolith on Next.js 15 App Router  

---

## 1. Prerequisites

Ensure your development environment meets the following requirements:
* **Node.js**: `v20.x` or higher (verified on `v24.21.0`)
* **npm**: `v10.x` or higher (verified on `11.19.0`)
* **PostgreSQL** (Optional for local testing; automated tests run self-contained via `pg-mem`)

---

## 2. Repository Structure

The ASSO codebase is structured as a modular monolith:

```text
├── .github/
│   └── workflows/
│       └── ci.yml               # Automated CI validation pipeline
├── docs/                        # Authoritative architecture and specifications
├── src/
│   ├── app/                     # Next.js App Router (Pages, Layouts, API Route Handlers)
│   │   ├── api/v1/              # Standardized API v1 endpoints
│   │   │   ├── health/          # System & database health probe
│   │   │   ├── realtime/        # Server-Sent Events (SSE) streaming
│   │   │   ├── storage/         # Signed upload/download URL authorizer
│   │   │   └── test/protected/  # 5-Layer authorization test endpoint
│   │   ├── globals.css          # Design system CSS variables & tokens
│   │   ├── layout.tsx           # Global HTML layout
│   │   └── page.tsx             # System status dashboard & component preview
│   ├── components/
│   │   └── ui/                  # Reusable UI primitives (Button, Input, Badge, Card, Alert, Dialog)
│   ├── config/
│   │   └── env.ts               # Strict Zod environment variable validation
│   ├── db/
│   │   ├── client.ts            # PostgreSQL / Drizzle connection pool
│   │   ├── rls.ts               # Transaction-scoped RLS runner (SET LOCAL app.current_tenant_id)
│   │   └── schema/              # Drizzle ORM schema definitions (Core, System)
│   └── lib/
│       ├── api/                 # Response envelope, error taxonomy, context extractor, idempotency
│       ├── auth/                # JWT signer/verifier, RBAC permission checker
│       ├── entitlements/        # Module entitlement checker
│       ├── jobs/                # pg-boss background queue runner
│       ├── logger/              # Structured JSON logger with request tracing & redaction
│       ├── policy/              # Business policy engine
│       ├── realtime/            # Realtime SSE connection hub
│       ├── storage/             # Pre-signed URL storage adapter
│       └── utils.ts             # Tailwind class merger & currency formatting
├── tests/
│   ├── integration/             # API v1 endpoint integration tests
│   ├── security/                # Critical security tests (Tenant isolation, Auth, Idempotency, IDOR)
│   └── unit/                    # Policy engine and entitlement unit tests
├── drizzle.config.ts            # Drizzle Kit migration configuration
├── package.json                 # Core dependencies and scripts
├── tailwind.config.ts           # Design tokens mapped to Tailwind
└── tsconfig.json                # TypeScript strict configuration
```

---

## 3. Quick Start

### 3.1 Install Dependencies
```bash
npm install
```

### 3.2 Environment Configuration
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

### 3.3 Verify TypeScript & Run Test Suite
```bash
# Typecheck
npm run typecheck

# Execute all 31 automated tests
npm test
```

### 3.4 Start Local Development Server
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to inspect the running foundation.

---

## 4. Building for Production

```bash
# Compile optimized production bundle
npm run build

# Start production server locally
npm run start
```
