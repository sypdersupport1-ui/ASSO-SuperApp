# ASSO Authentication Architecture & Identity Specifications

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 3)  
> **Authority:** Aligned with Phase 2 Security Architecture (`ADR-005`, `SECURITY-ARCHITECTURE.md`)  

---

## 1. Authentication Persona Hierarchy

ASSO supports three distinct authentication classes:
1. **Super Admin (Platform Operators):** Multi-factor authenticated (MFA) via TOTP, accessing cross-tenant platform administration.
2. **Staff Members (Business Operators):** Authenticated via email/phone and password/OTP, mapped to one or more tenants and outlets with fine-grained RBAC roles.
3. **Guest / Customer Sessions (Contextual QR Users):** Ephemeral, cryptographic sessions bound to an active physical context (Hotel Room, Restaurant Table, Cinema Seat) without requiring permanent account registration.

---

## 2. Token Architecture & Session Management

### 2.1 Staff & Super Admin JWT Tokens
- **Access Token:** Short-lived JWT (15-minute expiration), signed via RS256 / EdDSA. Contains `sub` (user_id), `tenant_id`, `outlet_id`, `role_ids`, `permissions`, and `is_super_admin`.
- **Refresh Token:** Long-lived opaque token (7 to 30 days), stored hashed (SHA-256) in `user_sessions` database table. Can be instantly revoked on password reset or suspicious activity.
- **MFA Enforcement:** Mandatory TOTP (RFC 6238) for Super Admins and high-privilege business roles (`TENANT_ADMIN`, `FINANCE_CONTROLLER`).

### 2.2 Customer Ephemeral QR Sessions
- **Session Lifecycle:** Generated upon successful resolution of an active `qr_tokens` record.
- **Context Binding:** Bound strictly to `(tenant_id, outlet_id, context_id)`.
- **Duration:** Valid for the duration of the visit:
  - Hotel: Bound to guest stay dates.
  - Restaurant: 3 hours default or until table checkout.
  - Cinema: Bound to showtime end time + 30 minutes.
- **Device Fingerprint:** Stored to prevent casual session link hijacking.

---

## 3. Session Revocation & Security Invariants

1. **Immediate Revocation:** Deactivating a staff user in `staff_profiles` or deleting a session from `user_sessions` immediately rejects subsequent refresh calls. Short-lived access tokens expire within 15 minutes.
2. **Password Security:** Passwords are never stored raw. Hashing uses Argon2id or bcrypt (cost factor 12+) via Supabase Auth / Node.js standard libraries.
3. **Concurrent Session Controls:** Configurable limit on concurrent active sessions per staff account.
