# ASSO — Failure & Recovery Architecture

**Phase**: 2 — Master Architecture  
**Status**: Approved for Phase 2  
**Last Updated**: 2026-09-26

---

## 1. Failure Principle

> The architecture must assume failures will happen. The question is not whether a failure occurs, but what the system does when it does.

ASSO is designed so that common failure scenarios are handled gracefully, without data loss or incorrect business state.

---

## 2. Database Operation Failures

### Scenario: Database query fails mid-request

**Behavior**:
- Transaction is rolled back automatically (PostgreSQL)
- No partial state is written
- Client receives `500 Internal Server Error` with a `requestId` for investigation
- Application logs record the error with full context
- The client retries (idempotency key prevents duplicate effects if the operation is retried)

### Scenario: Database connection lost mid-request

**Behavior**:
- Connection pool detects broken connection
- Pool replaces the connection
- In-flight request returns `503 Service Unavailable`
- Client should retry after brief backoff

### Scenario: Database is completely unreachable

**Behavior**:
- `/api/ready` health check returns `503`
- Load balancer / deployment platform removes the instance from rotation (or does not route to it)
- No requests are served until database connectivity is restored
- Alert is triggered for operations team

---

## 3. Payment Failures and Recovery

### Scenario: Payment succeeds at gateway but confirmation response is lost

**Problem**: The payment gateway processes the payment, but the network fails before ASSO receives the confirmation. The user's card is charged but ASSO has not recorded the payment.

**Mitigation**:
1. The payment gateway sends a webhook to `/api/webhooks/[provider]` confirming the payment
2. The webhook handler processes the payment idempotently using the gateway's transaction ID
3. If the webhook arrives, the payment is recorded correctly
4. If the webhook is delayed, the UI shows "payment pending" until confirmed
5. If the user resubmits, the idempotency key prevents double-charging

**Recovery path**: Payment status can be polled from the gateway using the stored `intentId` during reconciliation.

### Scenario: Payment webhook is delivered twice

**Behavior**:
- Webhook handler checks `processed_events` table for the event ID
- If already processed, the handler returns `200 OK` immediately without re-processing
- No duplicate payment record is created

### Scenario: Refund initiated but confirmation is lost

**Behavior**:
- The refund record is created with status `PROCESSING`
- The gateway webhook delivers the refund confirmation
- Refund status is updated to `COMPLETED`
- If webhook is delayed: the refund record shows as pending; the support team can manually verify with the gateway using the refund ID

### Scenario: Payment gateway is unavailable

**Behavior**:
- Payment attempt returns `503` with a user-friendly message
- No payment record is created (the operation was not attempted at the gateway level)
- Retry with exponential backoff in the background job (for staff-initiated payments)
- Customer-facing: Show error, allow retry

---

## 4. Inventory Failures

### Scenario: Inventory update fails after order is placed

**Behavior**:
- If inventory consumption is done via domain event (async), the stock movement job will retry automatically
- If inventory consumption fails after N retries, the job is marked as failed and an alert is raised
- Inventory discrepancy is resolved manually via a stock adjustment with audit record

**Principle**: Ordering proceeds independently of inventory consumption in the async model. Inventory is a trailing record — order delivery is not blocked by inventory update failure.

### Scenario: Stock transfer partially applied (stock-out succeeds, stock-in fails)

**Behavior**:
- The transfer uses a single database transaction encompassing both stock movements
- If the transaction fails, both stock-out and stock-in are rolled back
- The transfer remains in `IN_TRANSIT` state until the issue is resolved
- Manual reconciliation by an authorized manager if the transaction fails repeatedly

---

## 5. Background Job Failures

### Scenario: Notification job fails

**Behavior**:
- Job is retried with exponential backoff (configurable, e.g., 3 retries over 15 minutes)
- After N failures, the job is marked `DEAD` and recorded in the failed jobs table
- Operations team can review and manually re-trigger failed jobs
- Notifications are best-effort — a failed notification does not constitute a data integrity failure

### Scenario: Report generation job fails

**Behavior**:
- Job is retried (up to 3 attempts)
- If all retries fail, the report is marked as `FAILED`
- User sees a "Report generation failed — please try again" message
- Report can be re-triggered manually

### Scenario: Application process crashes while processing a background job

**Behavior**:
- Job remains in `RUNNING` state in the queue
- After a configurable heartbeat timeout, pg-boss marks the job as `FAILED` and reschedules it
- Job handlers are idempotent — re-running a job that was partially completed does not cause double-effects

---

## 6. External Service Unavailability

### Scenario: Email provider is unreachable

**Behavior**:
- The email delivery job retries with exponential backoff
- After N retries, the job is marked as failed
- Critical notifications (password reset) show a "We were unable to send the email — try again" message
- Operational notifications (order confirmation) are best-effort; failure is logged but not surfaced to the user

### Scenario: SMS provider is unreachable

**Same as Email**. SMS notifications are best-effort.

### Scenario: File storage is unreachable during upload

**Behavior**:
- Signed upload URL has already been issued; the upload fails at the storage layer
- The client receives an error from the storage provider
- The file record is not created in the database (the client must notify the API after successful upload)
- Client retries the upload with the same signed URL (if still valid) or requests a new one

---

## 7. User-Facing Race Conditions

### Scenario: User refreshes during a payment

**Behavior**:
- Payment intent was created server-side before the page refresh
- On re-load, the UI fetches current bill/folio status
- If payment is completed, the settled bill is shown
- If payment is pending (webhook not yet received), "payment is being confirmed" is shown
- If payment failed, the option to retry is shown

### Scenario: Two staff members try to check in the same guest simultaneously

**Behavior**:
- The first check-in request creates the stay and the folio — the room status changes to `OCCUPIED`
- The second check-in request for the same room finds the room is no longer `AVAILABLE`
- Second request returns `409 Conflict` with a message explaining the room is occupied
- Enforced via database-level constraint or optimistic locking (timestamp-based)

### Scenario: Customer order at the same table from multiple devices

**Behavior**:
- Multiple customer sessions may exist for the same table (one per device)
- Each session can submit orders independently
- All orders are posted to the same table bill
- > `OPEN DECISION` — Whether sessions from multiple devices for the same table should be merged or kept separate.

---

## 8. Network Interruption During Operation

### Scenario: Customer loses connection mid-order

**Behavior**:
- If the order was not yet submitted: The cart is held client-side. On reconnect, the cart is still present and the customer can resubmit.
- If the order was submitted but confirmation was not received: The customer retries. The idempotency key (generated client-side before submission) prevents duplicate order creation.
- The customer sees "checking order status..." on reconnect and the UI resolves the state by querying the server.

### Scenario: Staff loses connection during checkout

**Behavior**:
- If payment was not initiated: No action taken. Staff reconnects and initiates payment.
- If payment was initiated but confirmation not received: Staff sees "payment pending" state. The webhook from the payment gateway resolves the state automatically.

---

## 9. Idempotency Implementation

Operations where duplicate execution could cause damage are protected by idempotency keys:

| Operation | Key Source | Storage |
|---|---|---|
| Customer order creation | Client-generated UUID, stored in session | `orders.idempotency_key` |
| POS transaction | Client-generated UUID | `pos_transactions.idempotency_key` |
| Payment creation | Client-generated UUID | `payment_transactions.idempotency_key` |
| Expense submission | Client-generated UUID | `expenses.idempotency_key` |
| Folio charge posting | Generated from source (orderId + chargeType) | `folio_entries.idempotency_key` |
| Stock movement creation | Generated from source (transferId + direction) | `stock_movements.idempotency_key` |
| Webhook processing | Provider event ID | `processed_events.event_id` |

**Idempotency behavior**:
- If the key is new: Execute the operation, store the result
- If the key already exists with status `COMPLETED`: Return the stored result (no re-execution)
- If the key already exists with status `PROCESSING` (in-flight): Return `202 Accepted` (still processing)
- If the key already exists with status `FAILED`: Treat as a new attempt (allow retry)

---

## 10. Failure Recovery Runbook Stubs

> Detailed runbooks for each failure scenario will be documented in Phase 5 (Engineering & Operations). The following are stubs that define what must be addressed.

| Failure | Runbook Required |
|---|---|
| Database unreachable | Connection recovery, failover procedure |
| Payment in inconsistent state | Manual reconciliation with gateway |
| Background job queue backed up | Scale workers, identify root cause |
| Suspicious auth failures | Account investigation, IP blocking |
| Data export requested (GDPR) | Personal data identification and export |
| Tenant data corruption | Point-in-time restore procedure |
| Mass notification failure | Fallback channel, retry strategy |
