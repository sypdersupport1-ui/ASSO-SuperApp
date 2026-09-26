# ASSO — Observability Architecture

**Phase**: 2 — Master Architecture  
**Status**: Approved for Phase 2  
**Last Updated**: 2026-09-26

> The observability tooling stack will be selected and provisioned in **Phase 5 (Engineering & Operations)**. This document defines the architectural requirements for observability — what must be observed and how the system is designed to support it.

---

## 1. Observability Layers

ASSO distinguishes three types of observability records:

| Layer | Purpose | Audience |
|---|---|---|
| **Application Logs** | Technical system behavior | Developers, Operations |
| **Business Audit Logs** | Immutable business event trail | Business operators, Compliance, Legal |
| **Metrics** | System health and performance indicators | Operations, Developers |

These must not be conflated. Business audit records are not application logs. Application error logs are not audit records.

---

## 2. Structured Application Logging

All application logs are **structured JSON** — not free-text strings:

```json
{
  "level": "info",
  "timestamp": "2026-09-26T08:30:00.000Z",
  "requestId": "req_abc123",
  "tenantId": "org_xyz",
  "outletId": "outlet_abc",
  "userId": "user_123",
  "method": "POST",
  "path": "/api/v1/orders",
  "statusCode": 201,
  "durationMs": 45,
  "message": "Order created"
}
```

### Log Levels

| Level | Usage |
|---|---|
| `error` | Unexpected failures that require investigation |
| `warn` | Degraded behavior, recoverable errors, deprecated usage |
| `info` | Normal significant events (request received, order created) |
| `debug` | Detailed trace information (development only, not in production) |

### What Must Be Logged

| Event | Level |
|---|---|
| Every inbound request (method, path, status, duration) | `info` |
| Authentication failures | `warn` |
| Authorization failures (403) | `warn` |
| Domain operation errors | `error` |
| Background job failures | `error` |
| External service errors (payment gateway, email, SMS) | `error` |
| Database query errors | `error` |
| Rate limit exceeded | `warn` |
| Webhook signature failures | `warn` |

### What Must NOT Be Logged

- Passwords or password hashes
- Full payment card numbers
- Session tokens
- Sensitive PII (phone numbers, email addresses) except where needed for audit
- Request body content for payment endpoints

---

## 3. Business Audit Logs

See [DATA-OWNERSHIP.md](./DATA-OWNERSHIP.md) and [SECURITY-ARCHITECTURE.md](./SECURITY-ARCHITECTURE.md) for the audit engine design.

Audit records are stored in the `audit_events` table in PostgreSQL. This is separate from application logs.

**Key distinctions**:
- Audit records are **business-level** records: "Manager Ravi approved refund of ₹750 for Order #1234"
- Application logs are **technical** records: "POST /api/v1/refunds returned 200 in 83ms"

Audit records are:
- Append-only (never updated or deleted)
- Tenant-scoped
- Queryable by tenant admins for their own data
- Queryable by super admins for any tenant
- Retained per the data retention policy

---

## 4. Health Check Endpoints

The application exposes standard health endpoints:

```
GET /api/health
→ 200 OK if application is running
→ Response: { "status": "ok", "uptime": 3600 }

GET /api/ready
→ 200 OK if application can serve traffic (app + database connection)
→ 503 if database is unreachable
→ Response: { "status": "ready", "database": "connected" }

GET /api/version
→ { "version": "1.0.0", "buildId": "build_abc", "deployedAt": "..." }
```

These endpoints are used by:
- Deployment platform (Vercel) for health monitoring
- Load balancers for routing decisions
- Monitoring tools for availability checks

---

## 5. Application Metrics

The following metrics must be collectible from the application:

| Metric | Type | Description |
|---|---|---|
| `http_request_duration_ms` | Histogram | Request duration by path and status |
| `http_request_total` | Counter | Total requests by path, method, status |
| `auth_login_attempts_total` | Counter | Login attempts by result (success/failure) |
| `db_query_duration_ms` | Histogram | Database query duration |
| `db_connection_pool_size` | Gauge | Current connection pool utilization |
| `background_job_queue_depth` | Gauge | Number of pending background jobs |
| `background_job_duration_ms` | Histogram | Job processing duration by job type |
| `background_job_failures_total` | Counter | Failed jobs by job type |
| `cache_hit_rate` | Gauge | In-process cache hit rate per cache key |
| `tenant_active_sessions` | Gauge | Active customer sessions per tenant |
| `payment_gateway_errors_total` | Counter | Payment gateway errors by provider |

> `OPEN DECISION` — Metrics collection tooling: Prometheus + Grafana, Datadog, New Relic, or equivalent. To be selected in Phase 5.

---

## 6. Error Monitoring

All unhandled exceptions and unexpected errors must be captured by an error monitoring service:

- Full stack trace
- Request context (requestId, path, userId, tenantId)
- Breadcrumb trail (actions leading to the error)
- Environment information (build version, environment)
- Error grouping by type and location

> `OPEN DECISION` — Error monitoring service: Sentry, Datadog, Rollbar, or equivalent. To be selected in Phase 5.

---

## 7. Tracing

Full distributed tracing is not required initially (there is no distributed system). However, request tracing within the monolith is valuable:

- Each inbound request is assigned a `requestId` (UUID)
- `requestId` is propagated through all log entries for that request
- `requestId` is included in API error responses (for support investigations)
- `requestId` is passed to background jobs enqueued during the request

This provides a lightweight trace without distributed tracing infrastructure.

If ASSO later extracts services, distributed tracing (OpenTelemetry) is introduced at that point.

---

## 8. Performance Monitoring

Metrics to track for performance visibility:

- **Database query duration**: P50, P95, P99 per query type
- **API response time**: P50, P95, P99 per endpoint
- **Background job processing time**: P50, P95, P99 per job type
- **Payment gateway response time**: P50, P95, P99

Performance budgets (to be formalized in Phase 5):
- API responses should complete within 300ms (P95) under normal load
- Database queries should complete within 50ms (P95) for operational queries
- Background jobs should complete within 30 seconds (P95)

---

## 9. Operational Dashboards

When observability tooling is provisioned (Phase 5), dashboards are built for:

| Dashboard | Audience | Key Metrics |
|---|---|---|
| Platform Health | ASSO Operations | Uptime, error rate, request rate, latency |
| Database Health | ASSO Operations | Connection utilization, query performance, storage |
| Background Jobs | ASSO Operations | Queue depth, job success rate, processing time |
| Tenant Activity | ASSO Operations | Active tenants, session counts, order volumes |
| Payment Operations | ASSO Operations | Payment success rate, gateway errors |
| Security Events | ASSO Operations | Auth failures, 403s, rate limit hits |

---

## 10. Log Retention

| Log Type | Retention | Storage |
|---|---|---|
| Application logs | 30 days in hot storage, 1 year archived | Log aggregation service |
| Business audit logs | Minimum 2 years | PostgreSQL (primary), archival after 1 year |
| Error reports | 90 days | Error monitoring service |
| Metrics | 30 days raw, 1 year aggregated | Metrics service |

> Retention policies finalized in Phase 5.
