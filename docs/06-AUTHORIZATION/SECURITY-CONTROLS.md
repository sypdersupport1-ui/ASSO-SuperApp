# ASSO Security Controls, Threat Model & Data Classification

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 3)  
> **Authority:** Aligned with `AGENTS.md` (Security Architecture & Threat Mitigation)  

---

## 1. Security Threat Model (OWASP Top 10 & SaaS Specific)

| Threat Vector | Attack Surface | Platform Defense Control | Detection & Mitigation |
| :--- | :--- | :--- | :--- |
| **Tenant Boundary Leakage** | Direct API calls across tenant boundaries | PostgreSQL RLS + Application JWT tenant scoping | PostgreSQL `42501` exception triggers immediate IP security event. |
| **Insecure Direct Object Reference (IDOR)** | Guessing UUIDs in URL paths | RLS `USING (tenant_id = ...)` silently filters foreign UUIDs | API returns uniform `404 Not Found` without revealing existence. |
| **Privilege Escalation** | Manipulating staff roles or permissions | Server-side role assignment; tokens signed with asymmetric key (RS256) | Signature validation failure invalidates token immediately. |
| **QR Code Guessing / Brute Force** | High-speed scanning of random tokens | High-entropy 128-bit cryptographic tokens + Strict IP rate limiting | Resolution rate limited to 20 req/min per IP. Suspicious IPs blocked. |
| **Payment Tampering** | Manipulating payment amounts on client | Server-side bill calculation; payment amount verified against bill ledger | Webhook HMAC signature verification rejects altered amounts. |
| **Duplicate Financial Execution** | Double-clicking payment or order buttons | Idempotency Keys + Pessimistic Row Locking (`SELECT ... FOR UPDATE`) | Cached response replayed or `409 Conflict` returned. |
| **SQL Injection (SQLi)** | Parameter injection in dynamic queries | Parameterized queries via Drizzle ORM + RLS safety net | Drizzle compiles strict prepared statements. |
| **Cross-Site Scripting (XSS)** | Injected scripts in guest notes or chat | React DOM escaping + Content Security Policy (CSP) headers | Strict CSP blocks inline script execution. |
| **CSRF** | Cross-origin browser session forgery | SameSite=Lax/Strict session cookies + Bearer token authorization | Browser blocks cross-origin authorization header transmission. |
| **Insecure File Upload** | Malicious script or oversized attachment | S3 Pre-signed PUT URLs + Strict MIME check + Size limits | Direct upload to isolated bucket; no server-side executable directory. |

---

## 2. File Upload Security Architecture

DEC-030 establishes that advanced antivirus/malware scanning (e.g. ClamAV) remains deferred for later operational hardening. For Phase 3, the following strict controls are mandated:
1. **Pre-signed Upload URLs:** The API generates temporary pre-signed PUT URLs directly to S3 / Supabase Storage with a 5-minute TTL. Files never traverse application server memory.
2. **Strict MIME & Extension Whitelist:**
   - Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
   - Executable formats (`.exe`, `.sh`, `.js`, `.html`, `.svg`) are strictly rejected.
3. **Maximum File Size Limits:**
   - Guest Receipt / ID Proof: 5 MB maximum.
   - Catalog Item Image: 2 MB maximum.
4. **Tenant-Isolated S3 Object Key Strategy:**
   - `uploads/{tenant_id}/{outlet_id}/{category}/{uuid_filename}.{ext}`
   - The original user filename is completely discarded to prevent path traversal or encoding attacks.
5. **Private Access Control:** Uploaded receipts and guest documents are stored in private buckets accessible only via signed temporary download URLs (15-minute validity) generated for authorized staff.

---

## 3. Rate Limiting Specifications

ASSO implements token-bucket rate limiting via API Gateway middleware:

| Target Endpoint Category | Rate Limit Window | Max Requests | Scope | Action on Breach |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication (`/api/v1/auth/login`)** | 1 Minute | 5 requests | IP + Email | `429 Too Many Requests` + Temp lockout (15m) |
| **QR Resolution (`/api/v1/context/resolve`)** | 1 Minute | 30 requests | Client IP | `429 Too Many Requests` |
| **Customer Order Creation** | 1 Minute | 10 requests | Customer Session | `429 Too Many Requests` |
| **Payment Operations** | 1 Minute | 5 requests | Session / Staff | `429 Too Many Requests` |
| **Inbound Webhooks** | 1 Second | 50 requests | Provider IP | Queue buffer / `429` with retry header |
| **Guest Chat Messaging** | 1 Minute | 20 requests | Context Session | `429 Too Many Requests` |
| **Standard Staff REST APIs** | 1 Minute | 300 requests | Staff Profile | `429 Too Many Requests` |

---

## 4. Data Classification & Protection Matrix

| Data Category | Examples | Storage Sensitivity | Encryption Standard | Access Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication Secrets** | Password hashes, MFA secrets, refresh tokens | Critical | Argon2id / AES-256-GCM | Platform Auth Service only |
| **Payment Card Data (PCI)** | Card numbers, CVV | Out of Scope | Not stored on ASSO (Handled by Gateway)| Zero Storage (PCI DSS SAQ A) |
| **Guest PII** | Full name, phone, email, masked ID proof | High | AES-256 at rest, TLS 1.3 in transit | Authorized Tenant Staff & Guest |
| **Staff PII** | Phone, address, employment code | High | AES-256 at rest, TLS 1.3 in transit | Tenant Admin & Manager |
| **Financial Ledgers** | Folio entries, bills, cash movements | Critical / Immutable | AES-256 at rest, RLS protected | Finance, Admin & Cashiers |
| **Inventory Ledgers** | Stock movements, purchase orders | Medium / Immutable | AES-256 at rest, RLS protected | Storekeeper, Managers |
| **Audit Logs** | Security events, audit records | Critical / Immutable | Append-only, tamper-evident | Super Admin & Tenant Admin |
