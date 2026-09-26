# ASSO Standard API Error Model & Taxonomy

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 3)  
> **Authority:** Aligned with `API-ARCHITECTURE.md` and Security Standards (`AGENTS.md`)  

---

## 1. Unified Error Response Envelope

All API errors return a standard JSON structure with HTTP status codes matching the error category:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request payload failed validation checks.",
    "details": [
      {
        "field": "items[0].quantity",
        "issue": "Quantity must be an integer greater than 0.",
        "received": -2
      }
    ]
  },
  "meta": {
    "requestId": "req_01HAB98765",
    "timestamp": "2026-09-26T12:45:00.000Z"
  }
}
```

---

## 2. Canonical Platform Error Codes

| HTTP Status | Error Code (`code`) | Description |
| :--- | :--- | :--- |
| `400` | `INVALID_PAYLOAD` | Malformed JSON or unparseable request body. |
| `400` | `VALIDATION_FAILED` | Field-level schema validation errors. |
| `400` | `INVALID_STATE_TRANSITION` | Attempted invalid workflow state transition (e.g. COMPLETED → PLACED). |
| `401` | `AUTHENTICATION_REQUIRED` | Missing, expired, or malformed authentication token. |
| `401` | `MFA_CHALLENGE_REQUIRED` | TOTP MFA verification required to complete login. |
| `403` | `MODULE_NOT_ENTITLED` | Tenant plan/addons do not include the required module. |
| `403` | `PERMISSION_DENIED` | Staff role lacks the specific RBAC permission. |
| `403` | `POLICY_VIOLATION` | Business policy condition failed (e.g. refund requires manager approval). |
| `404` | `RESOURCE_NOT_FOUND` | Requested entity does not exist within the tenant scope. |
| `409` | `CONCURRENT_MODIFICATION` | OCC timestamp mismatch or conflicting concurrent update. |
| `409` | `IDEMPOTENCY_CONFLICT` | Reused idempotency key with conflicting request parameters. |
| `422` | `BUSINESS_RULE_VIOLATION`| Semantic violation (e.g. insufficient inventory balance, room already occupied). |
| `429` | `RATE_LIMIT_EXCEEDED` | Request threshold breached for IP, session, or tenant. |
| `500` | `INTERNAL_SERVER_ERROR` | Unhandled platform error (scrubbed, safe message returned). |

---

## 3. Strict Information Redaction Policy

To prevent sensitive information exposure and reconnaissance attacks:
1. **Never Expose Internal Details:** PostgreSQL error codes, table names, constraint names, file paths, and stack traces are strictly stripped before sending responses to clients.
2. **Correlation via Request ID:** Detailed stack traces and diagnostic logs are recorded internally in server logs keyed by `requestId`. The client receives only the `requestId` to provide to technical support.
3. **Consistent 404 for Cross-Tenant Probing:** If an attacker attempts to access another tenant's resource UUID, the API returns a generic `RESOURCE_NOT_FOUND` (`404`), never `PERMISSION_DENIED` (`403`), preventing IDOR existence enumeration.
