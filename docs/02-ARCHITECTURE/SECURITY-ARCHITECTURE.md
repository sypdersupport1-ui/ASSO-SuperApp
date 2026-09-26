# ASSO — Security Architecture

**Phase**: 2 — Master Architecture  
**Status**: Approved for Phase 2  
**Last Updated**: 2026-09-26

---

## 1. Security Principle

> Security is a core architectural concern, not an afterthought. The frontend is never the authority.

All authorization, tenant isolation, financial calculations, inventory calculations, and payment validation are performed and enforced server-side.

---

## 2. Authentication

### 2.1 Staff Authentication

**Mechanism**: Email + password login. Future: OAuth/SSO for enterprise tenants.

**Flow**:
```text
POST /api/auth/login {email, password}
      ↓
1. Validate email format + password not empty
2. Look up user by email (constant-time check if not found)
3. Verify password against bcrypt hash
4. Check account status (not deactivated, not locked)
5. Record LoginSucceeded event
6. Issue signed session token (JWT or opaque token in HttpOnly cookie)
7. Return session + user context
```

**Failed authentication**:
- After N failed attempts (configurable), lock the account for M minutes
- Rate-limit authentication endpoint by IP
- Record LoginFailed events (for monitoring, not exposed to client)
- Return generic error — do not distinguish "email not found" from "wrong password"

### 2.2 Customer Authentication

Customer sessions are not authenticated in the traditional sense — they are **context-bound sessions** created when a valid QR code is resolved:

```text
GET /c/[opaqueToken]
      ↓
1. Rate-limit QR resolution (per-IP)
2. Look up token in qr_codes table
3. Verify QR is ACTIVE and context is valid
4. Create customer_session record (scoped to tenant + outlet + context)
5. Issue signed session token (short-lived, scoped)
6. Return redirect to vertical experience
```

Customers can optionally identify themselves (phone/email) to link their session to a customer record — but this is not required for the core customer experience.

### 2.3 Super Admin Authentication

- Separate admin login endpoint (`/api/admin/auth/login`)
- Stronger password requirements
- MFA recommended (`OPEN DECISION` — enforce MFA for super admins)
- Separate admin session tokens with shorter TTL
- All admin actions are audit-logged

---

## 3. Session Management

### 3.1 Session Token Design

**Staff sessions**: JWT signed with a server-side secret, or opaque token in the database.
- Delivered as HttpOnly, Secure, SameSite=Strict cookie
- TTL: 8-24 hours (configurable)
- Includes: `userId`, `tenantId`, `outletId`, `roles`, `permissions` (signed, not trusted from client)

**Customer sessions**: Opaque signed token
- Delivered as HttpOnly cookie or Authorization header (for API calls)
- TTL: Session-duration (e.g., 4 hours for restaurant, 7 days for hotel)
- Includes: `sessionId`, `tenantId`, `outletId`, `contextId`, `contextType`

### 3.2 Session Lifecycle

| Event | Effect on Session |
|---|---|
| User deactivated | All active sessions immediately invalidated |
| Role changed | Sessions not immediately invalidated (take effect on next login; `OPEN DECISION` — force immediate invalidation) |
| Context cleared (table/room/seat) | Customer sessions for that context invalidated |
| Show ended | Customer sessions for that screen invalidated |
| Guest checks out | Customer session for the room invalidated |
| Manual logout | Session deleted |
| Token TTL exceeded | Session expired |

### 3.3 Token Refresh

Staff sessions support token refresh within the validity window to maintain active sessions without forcing re-login during working hours.

---

## 4. Tenant Isolation

See [MULTI-TENANCY.md](./MULTI-TENANCY.md) for full details. Security summary:

- **Application layer**: Every query filters by `tenant_id` derived from authenticated session (never from request body)
- **Database layer**: PostgreSQL Row-Level Security (RLS) provides mandatory second isolation layer
- **File storage**: Files are stored in tenant-namespaced paths with signed, tenant-scoped access URLs
- **Cross-tenant verification**: Every direct resource access (e.g., `GET /api/orders/:id`) verifies `tenant_id` matches session before returning data

**Never allowed**:
- Accepting `tenant_id` from request body or query parameter for data access scoping
- Returning resources from multiple tenants in a single API response
- Cross-tenant links in any URL or resource reference exposed to clients

---

## 5. Authorization

### 5.1 Module Entitlement Enforcement

Every API route that requires a module:
1. Reads `outletId` from session (never from client)
2. Checks entitlement cache (or database) for that outlet
3. Rejects with `403` if module not enabled

Module checks are in middleware — cannot be bypassed by route handlers.

### 5.2 RBAC Permission Enforcement

Every API route that requires a permission:
1. Reads `permissions[]` from the authenticated session
2. Checks if the required permission is present
3. Rejects with `403` if not

Permission checks are in middleware — cannot be bypassed.

### 5.3 Policy Enforcement

For operations subject to business policies (refunds, expenses above threshold, inventory adjustments):
1. Domain service calls Policy Engine before executing the operation
2. If policy requires approval, the operation is suspended pending approval
3. The approval workflow completes before the operation proceeds
4. All decisions are audit-logged

---

## 6. Input Validation

All API inputs are validated against a strict schema before reaching domain logic:

- **Required fields**: Reject if missing
- **Type checking**: Reject wrong types
- **Length limits**: Reject oversized strings
- **Numeric bounds**: Reject negative amounts, amounts exceeding configured maximums
- **Enum validation**: Reject values outside defined sets
- **Sanitization**: Strip or escape HTML from text fields
- **UUID validation**: Reject malformed IDs

Validation failures return `400 Bad Request` with specific field-level error details.

Financial amounts are validated:
- Must be positive (unless the API explicitly allows negative values like adjustments)
- Must match currency precision for the tenant's configured currency
- Must not exceed configurable maximum transaction amounts

---

## 7. Output Validation

API responses must not expose:
- Internal system identifiers or table names in error messages
- Stack traces in production responses
- Sensitive fields of other tenants
- Fields beyond the scope of the authenticated user's permission

Sensitive fields (e.g., hashed passwords, internal service tokens, raw webhook secrets) must never appear in API responses.

---

## 8. Rate Limiting

Rate limiting is applied at multiple levels:

| Endpoint Type | Limit Strategy | Action on Exceed |
|---|---|---|
| Authentication (`/api/auth/login`) | 10 attempts / minute / IP | 429 + exponential backoff |
| QR resolution (`/api/qr/resolve`) | 30 / minute / IP | 429 |
| Customer API (session-bound) | 60 / minute / session | 429 |
| Staff API (authenticated) | 120 / minute / user | 429 |
| Super Admin API | 60 / minute / admin | 429 |
| Webhook endpoints | 200 / minute / provider | 429 + retry headers |

Rate limiting is enforced server-side. Initial implementation uses database counters or in-process counters (per-process). Redis distributed rate limiting is introduced if/when horizontal scaling requires it.

---

## 9. CSRF and XSS

**CSRF Protection**:
- Session tokens delivered as HttpOnly, Secure, SameSite=Strict cookies prevent CSRF by default for same-origin requests
- For any state-mutating API call that must accept cross-origin requests (e.g., payment gateway callbacks), verify the request using HMAC signature instead of relying on cookies

**XSS Protection**:
- All user-generated content is stored as plain text and escaped on render
- React's built-in XSS protection is not bypassed (no `dangerouslySetInnerHTML` without explicit justification)
- Content Security Policy (CSP) headers set for all frontend routes
- HttpOnly cookies prevent JavaScript access to session tokens

---

## 10. Secure Cookies and Tokens

| Attribute | Customer Session | Staff Session |
|---|---|---|
| `HttpOnly` | Yes | Yes |
| `Secure` | Yes (HTTPS only) | Yes (HTTPS only) |
| `SameSite` | Strict | Strict |
| `Path` | Scoped to app path | Scoped to app path |
| Token exposure | Never in JS | Never in JS |

Tokens are never stored in `localStorage` or `sessionStorage`.

---

## 11. Secrets Management

- Database connection strings, API keys, and payment credentials are never committed to version control
- Secrets are injected at runtime via environment variables managed by the deployment platform (Vercel secrets, or equivalent)
- Each environment tier (local, preview, staging, production) has completely separate secrets
- Production secrets are accessible only to the deployment pipeline and human operators — not to AI agents or automated scripts

---

## 12. Payment Security

- Payment card data never touches ASSO servers (tokenized via payment gateway)
- Payment amounts are verified server-side against the bill/folio before processing
- Frontend cannot inflate or deflate payment amounts
- Payment webhooks are verified using provider-specific HMAC signatures before processing
- Duplicate webhook delivery is handled via idempotency (payment result stored, re-delivery returns same result)
- Refunds require both RBAC permission and optional policy approval

---

## 13. QR Security

- QR codes contain opaque tokens only — no tenant ID, room number, or URL structure embedded
- Destination is determined entirely server-side after token resolution
- QR tokens are cryptographically random (not sequential, not guessable)
- Rate limiting on resolution endpoint prevents brute-force
- Disabled or rotated QR codes are rejected even if the token is physically present (e.g., printed)
- Session created from QR is scoped to the resolved context — cannot be used to access other contexts

**Shared QR Consideration**: When a QR is photographed and shared (e.g., a restaurant table QR), multiple people may create sessions. This is acceptable since sessions are context-bound. For more sensitive contexts (hotel rooms), additional validation at check-in is the mitigation.

---

## 14. File Upload Security

- Files are uploaded directly to storage (not routed through the application server)
- Upload URLs are signed with short TTL (5 minutes)
- Allowed MIME types are whitelisted per upload context (e.g., only `image/*` and `application/pdf` for expense receipts)
- File size limits enforced at the storage layer
- Download URLs are signed and tenant-scoped (cannot be shared to access another tenant's files)
- Virus scanning: `OPEN DECISION` — evaluate ClamAV or cloud-based scanning in Phase 5

---

## 15. Audit Logs

Audit logs record security-relevant events in the append-only `audit_events` table:

| Category | Events Logged |
|---|---|
| Authentication | Login success/failure, password changes, lockouts |
| Authorization | Every `403` from an authenticated session |
| Data Access | Super admin access to tenant data |
| Financial | All folio charges, payments, refunds, adjustments |
| Inventory | All stock adjustments, inter-outlet transfers |
| Configuration | Module enable/disable, policy changes, role changes |
| Staff | Staff creation, deactivation, role assignment |

Audit records:
- Are append-only (no UPDATE or DELETE)
- Include actor, timestamp, tenant, action, and before/after state where applicable
- Are accessible to authorized operators and super admins
- Are retained per the data retention policy

---

## 16. Security Events and Monitoring

Events that trigger alerts (to be configured in Phase 5):

- Multiple consecutive login failures from the same IP or account
- Super admin accessing tenant data (always logged; alert on high volume)
- Payment webhook signature verification failures
- Unusual large financial transactions (above configurable threshold)
- High rate of `403` responses from a single session

---

## 17. Abuse Protection

- IP-based rate limiting on all public endpoints
- QR abuse: rate-limited resolution, context validation, session binding
- Brute-force protection on login (account lockout + IP rate limiting)
- Customer session abuse: sessions are context-bound and time-limited
- API abuse: per-user and per-session rate limits

---

## 18. Staff Account Security

- Passwords enforced to meet minimum complexity (configurable)
- Password reset uses time-limited, single-use tokens
- Account lockout after N failed login attempts
- Staff accounts deactivated (not deleted) when an employee leaves — historical records preserved
- Staff cannot access outlets they are not assigned to (RBAC enforcement)

---

## 19. Backup and Recovery

> `OPEN DECISION` — Formal backup and recovery SLAs to be defined in Phase 5.

Preliminary principles:
- Database backups automated by Supabase (or managed PostgreSQL provider)
- Point-in-time recovery available
- Backup restore tested regularly (at least quarterly)
- Financial and audit data retention takes precedence over storage cost
- Recovery time objective (RTO) and recovery point objective (RPO) to be defined per environment
