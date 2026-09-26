# ASSO — Integrations Architecture

**Phase**: 2 — Master Architecture  
**Status**: Approved for Phase 2  
**Last Updated**: 2026-09-26

---

## 1. Integration Principle

All external integrations are isolated behind **adapters** (also called ports/interfaces). The ASSO domain model does not know about specific external providers.

```text
ASSO Domain Logic
      ↓
Adapter Interface (internal contract)
      ↓
Provider Implementation (replaceable)
      ↓
External Provider (Stripe, Razorpay, SendGrid, etc.)
```

This means:
- Switching payment providers does not change domain logic
- Switching email providers does not change notification logic
- Adding a new payment provider does not require modifying the billing or ordering engines

---

## 2. Payment Integrations

### 2.1 Architecture

```text
Payment Engine
      ↓
IPaymentAdapter (interface)
      ├── RazorpayAdapter
      ├── StripeAdapter
      └── FutureProviderAdapter
```

**IPaymentAdapter interface**:
```text
createPaymentIntent(amount, currency, metadata) → {intentId, clientSecret}
confirmPayment(intentId) → {status, transactionId}
initiateRefund(transactionId, amount, reason) → {refundId, status}
verifyWebhook(payload, signature) → {valid: boolean}
getPaymentStatus(transactionId) → {status, amount, metadata}
```

### 2.2 Provider Selection

> `OPEN DECISION` — Payment provider not finalized. Razorpay (India-first) or Stripe (international) are the primary candidates.

Requirements for the selected provider:
- India-centric payment methods (UPI, cards, net banking, wallets)
- Webhook support with HMAC signature verification
- Idempotency key support
- Refund API
- Sandbox / test mode for development and preview

### 2.3 Security

- Provider API keys stored as secrets (not in code or version control)
- Separate sandbox keys for non-production environments
- Webhook signatures verified before any processing
- Card data never touches ASSO servers (gateway-tokenized)

---

## 3. Email Integrations

### 3.1 Architecture

```text
Notification Engine
      ↓
IEmailAdapter (interface)
      ├── SendGridAdapter
      ├── ResendAdapter
      └── AWSEmailAdapter
```

**IEmailAdapter interface**:
```text
sendTransactional(to, templateId, variables) → {messageId}
sendBatch(recipients[], templateId, variables[]) → {batchId}
```

### 3.2 Use Cases

| Trigger | Email Sent To |
|---|---|
| Order confirmation | Customer (if email provided) |
| Payment receipt | Customer (if email provided) |
| Staff invitation | New staff member |
| Expense approval needed | Approver |
| PO approval needed | Approver |
| Low-stock alert | Manager |
| Password reset | User |
| Guest checkout summary | Guest (Hotel, if email provided) |

### 3.3 Provider Selection

> `OPEN DECISION` — Email provider not finalized. Resend, SendGrid, or AWS SES are candidates.

---

## 4. SMS / Messaging Integrations

### 4.1 Architecture

```text
Notification Engine
      ↓
ISMSAdapter (interface)
      ├── TwilioAdapter
      ├── AWS_SNS_Adapter
      └── MSG91Adapter (India)
```

### 4.2 Use Cases

| Trigger | SMS Sent To |
|---|---|
| Order ready (if no push/app) | Customer |
| Service request update | Customer |
| Table available (Queue) | Waiting customer |
| OTP for sensitive operations (future) | Staff |

> `OPEN DECISION` — SMS provider not finalized. MSG91 or Twilio (India-focused) are candidates.

---

## 5. Push Notifications

Browser push notifications for the Customer App and Business Console:

**Use cases**:
- Customer: Order status updates, service request updates
- KDS: New order received (kitchen display)
- Staff: New service request, new chat message

**Implementation**: Web Push API (VAPID) via the browser. No native app push (React Native / FCM) until mobile apps are built (`FUTURE`).

> `OPEN DECISION` — Whether browser push notifications are in initial scope or deferred.

---

## 6. File / Object Storage

### 6.1 Architecture

```text
File Engine
      ↓
IStorageAdapter (interface)
      ├── SupabaseStorageAdapter
      └── AWSS3Adapter
```

**IStorageAdapter interface**:
```text
generateUploadUrl(bucket, key, options) → {uploadUrl, expiresAt}
generateDownloadUrl(bucket, key, options) → {downloadUrl, expiresAt}
deleteFile(bucket, key) → void
```

### 6.2 Storage Buckets

| Bucket | Contents | Access |
|---|---|---|
| `expense-attachments` | Expense receipt images | Private (signed URLs, tenant-scoped) |
| `catalog-images` | Menu / catalog item images | Public (CDN) |
| `profile-images` | Staff profile photos | Private (signed URLs) |
| `exports` | Report exports, data exports | Private (signed URLs, short TTL) |
| `qr-assets` | Generated QR code images | Private (signed URLs) |

---

## 7. Future Integrations

The following integrations are architecturally planned but not in current scope:

| Integration | Status | Notes |
|---|---|---|
| Online booking systems (hotel) | `FUTURE` | Requires reservation module to be built first |
| Accounting software (e.g., Tally, Zoho Books) | `FUTURE` | Export-based initially |
| Loyalty / CRM platforms | `FUTURE` | Requires customer identity work first |
| POS hardware integrations | `FUTURE` / `OPEN DECISION` | Printer, cash drawer, card terminal |
| Channel manager (hotel OTAs) | `FUTURE` | Requires reservation module |
| WhatsApp Business API | `FUTURE` | For conversation/notification channel |
| Third-party inventory suppliers | `FUTURE` | EDI / catalog import |

---

## 8. Webhook Integration (Inbound)

For external services that push events to ASSO (e.g., payment gateway):

```text
POST /api/webhooks/[provider]

1. Identify provider from path
2. Verify HMAC/signature (provider-specific)
3. Return 200 immediately (acknowledge receipt)
4. Enqueue background job for processing
5. Background worker processes idempotently
```

**Webhook security**:
- Each provider has a unique webhook endpoint
- Webhook secret is per-provider and per-environment
- Signature verification rejects all unverified payloads
- Replay protection: check event ID against `processed_events` table

---

## 9. Integration Testing Strategy

External integrations are tested using:

- **Sandbox modes**: Payment providers, SMS/email providers all have test modes
- **Adapters are testable**: The adapter interface can be swapped with a test double in unit/integration tests
- **Preview environments always use sandbox credentials** — never production credentials
- **Contract tests**: Verify the adapter implementation matches the expected interface contract
