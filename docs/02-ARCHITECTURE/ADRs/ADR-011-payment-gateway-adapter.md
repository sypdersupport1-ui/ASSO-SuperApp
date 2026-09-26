# ADR-011: Payment Gateway Adapter Architecture

**Status**: Accepted (Architecture Resolved; Provider Implementation Deferred)  
**Date**: 2026-09-26  
**Deciders**: Human Product Owner, Antigravity  
**Resolves**: Open Decision #2 (Payment provider selection)

---

## Context

ASSO must support payments across all three verticals:
- Hotel: Room advance deposits, guest folio checkout settlements, counter payments.
- Restaurant: Instant table bill settlement via QR (UPI, Card), POS cashier payments.
- Cinema: Instant concession checkout via QR, box-office / counter POS.

Hard-coding the Payment Engine to a specific commercial payment gateway (e.g., Razorpay, Stripe, PhonePe) violates clean architectural boundaries, creates vendor lock-in, and complicates automated testing and international expansion.

An architectural decision is required to ensure the Payment Engine remains strictly provider-neutral while defining concrete integration pathways.

---

## Decision

1. **Provider-Neutral Payment Domain**:
   ASSO adopts a strict **Payment Gateway Adapter Pattern**:
   ```text
   ASSO Payment Domain (PaymentEngine, Transactions, Ledger)
             ↓
   PaymentGatewayAdapter Interface (standard contracts)
             ↓
   ┌───────────────────────┬───────────────────────┬───────────────────────┐
   │ MockPaymentAdapter    │ RazorpayAdapter       │ StripeAdapter         │
   │ (Local / Preview / CI)│ (Deferred Future)     │ (Deferred Future)     │
   └───────────────────────┴───────────────────────┴───────────────────────┘
   ```

2. **Provider Implementation Deferred — DO NOT Implement Razorpay Now**:
   The Human Product Owner has finalized the decision: **build provider-neutral payment architecture; do not implement Razorpay yet**.
   Specifically:
   - **DO NOT** add Razorpay SDK dependencies.
   - **DO NOT** create or require Razorpay production credentials.
   - **DO NOT** implement live Razorpay API calls or endpoints.
   - **DO NOT** implement Razorpay webhooks.
   - **DO NOT** hard-code Razorpay identifiers or entities into the domain model.
   - **DO NOT** make Razorpay a mandatory platform dependency.

3. **Development, Preview & CI via `MockPaymentAdapter`**:
   - A **`MockPaymentAdapter`** is the standard adapter for non-production environments (Local, Preview, CI).
   - Allows full checkout simulations, callback verification, and refund lifecycles without external API keys or live banking networks.
   - Any future commercial provider (Razorpay, Stripe, or others) will be introduced purely as an adapter implementation behind this boundary when commercially approved.

---

## Technical Architecture

### 1. Adapter Contract (`PaymentGatewayAdapter`)

```typescript
export interface PaymentGatewayAdapter {
  readonly providerId: string;

  /** Create an order/intent with the gateway */
  createOrder(params: CreateGatewayOrderParams): Promise<GatewayOrderResult>;

  /** Verify cryptographic signature of client payment callback */
  verifySignature(params: VerifySignatureParams): boolean;

  /** Parse and validate incoming webhook payload */
  verifyAndParseWebhook(headers: Record<string, string>, body: unknown): WebhookEvent;

  /** Process refund */
  processRefund(params: GatewayRefundParams): Promise<GatewayRefundResult>;
}
```

### 2. Idempotency & Financial Safety
- **Every payment initiation** requires a client-generated `Idempotency-Key` (UUIDv4) stored in `payment_idempotency`.
- **Webhook Processing**:
  - Payment webhooks are validated by HMAC cryptographic signature.
  - Webhooks are recorded in `payment_webhooks` table.
  - Processing is strictly idempotent: re-delivered webhooks return HTTP 200 without duplicate ledger mutations.
- **Server-Side Validation**:
  - Amount and currency are always verified server-side against the corresponding `Bill` or `Folio`. The client never dictates the payable amount.

---

## Consequences

**Positive**:
- 100% provider-agnostic domain logic.
- Automated tests and preview deployments run reliably with `MockPaymentAdapter` (no internet or sandbox credentials required).
- Zero vendor lock-in; easy migration or multi-gateway routing in the future.
- Strict compliance with environment isolation (no production credentials in dev/preview).

**Trade-offs & Mitigations**:
- *Trade-off*: Slight abstraction overhead to map gateway-specific fields to domain structures.
  *Mitigation*: Well-defined TypeScript interfaces make mapping explicit and testable.

---

## Review Trigger

Revisit upon multi-country launch or when introducing custom merchant direct-settlement accounts.
