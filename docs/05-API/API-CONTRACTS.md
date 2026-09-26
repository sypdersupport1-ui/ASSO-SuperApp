# ASSO Canonical API Contracts (OpenAPI Compatible)

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 3)  
> **Base Path:** `/api/v1/`  
> **Authority:** Aligned with `API-RESOURCE-CATALOG.md` and `DATABASE-SCHEMA.md`  

---

## 1. Create Order Contract

### `POST /api/v1/orders`

Creates a new customer or staff order within an active physical context (Hotel Room, Restaurant Table, Cinema Seat).

#### Headers
- `Authorization`: `Bearer <token>` (Customer Session Token or Staff JWT)
- `X-Tenant-ID`: `<uuid>` (Optional if embedded in JWT)
- `Idempotency-Key`: `<string>` (Mandatory, max 100 chars)
- `Content-Type`: `application/json`

#### Request Payload Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["outletId", "contextId", "items"],
  "properties": {
    "outletId": { "type": "string", "format": "uuid" },
    "contextId": { "type": "string", "format": "uuid" },
    "orderSource": { "type": "string", "enum": ["QR_CUSTOMER", "STAFF_POS", "DESK_ORDER"] },
    "specialInstructions": { "type": "string", "maxLength": 500 },
    "items": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["itemId", "quantity"],
        "properties": {
          "itemId": { "type": "string", "format": "uuid" },
          "quantity": { "type": "integer", "minimum": 1 },
          "notes": { "type": "string", "maxLength": 200 },
          "modifierIds": {
            "type": "array",
            "items": { "type": "string", "format": "uuid" }
          }
        }
      }
    }
  }
}
```

#### Success Response: `201 Created`
```json
{
  "success": true,
  "data": {
    "orderId": "7a3f4e12-8822-491a-96e0-1c394c8e7102",
    "orderNumber": "ORD-2026-0042",
    "status": "PLACED",
    "contextId": "91a82f34-1188-4c32-b811-9e2001bb8711",
    "subtotalAmount": 550.00,
    "taxAmount": 27.50,
    "totalAmount": 577.50,
    "currency": "INR",
    "placedAt": "2026-09-26T12:30:00.000Z"
  },
  "meta": {
    "requestId": "req_01HAB12345",
    "timestamp": "2026-09-26T12:30:00.120Z"
  }
}
```

#### Failure Responses
- `400 Bad Request`: Validation failure (e.g. empty items array, invalid quantity).
- `401 Unauthorized`: Invalid/expired customer session or staff JWT.
- `409 Conflict`: `Idempotency-Key` conflict with mismatched request payload.

---

## 2. Provider-Neutral Payment Intent Contract

### `POST /api/v1/payments/intent`

Initializes a payment intent for settling a bill. Provider-neutral design (DEC-002).

#### Headers
- `Authorization`: `Bearer <token>`
- `Idempotency-Key`: `<string>` (Mandatory)
- `Content-Type`: `application/json`

#### Request Payload Schema
```json
{
  "type": "object",
  "required": ["billId", "amount", "paymentMethod"],
  "properties": {
    "billId": { "type": "string", "format": "uuid" },
    "amount": { "type": "number", "minimum": 0.01 },
    "currency": { "type": "string", "default": "INR" },
    "paymentMethod": { "type": "string", "enum": ["GATEWAY", "UPI", "CARD", "CASH"] }
  }
}
```

#### Success Response: `200 OK`
```json
{
  "success": true,
  "data": {
    "paymentId": "48b11c90-9921-4f11-9980-001294819283",
    "status": "PENDING",
    "amount": 577.50,
    "currency": "INR",
    "gatewayOrderDetails": {
      "provider": "MOCK_GATEWAY",
      "orderId": "order_gateway_991823",
      "clientSecret": "tok_mock_sec_1294819"
    }
  },
  "meta": { "requestId": "req_01HAB23456" }
}
```

---

## 3. Hotel Guest Check-in Contract

### `POST /api/v1/hotel/checkin`

Performs guest check-in, creates the stay record, and initializes the guest folio ledger.

#### Headers
- `Authorization`: `Bearer <staff_jwt>`
- `Content-Type`: `application/json`

#### Request Payload Schema
```json
{
  "type": "object",
  "required": ["outletId", "roomId", "guest", "expectedCheckOutTime"],
  "properties": {
    "outletId": { "type": "string", "format": "uuid" },
    "roomId": { "type": "string", "format": "uuid" },
    "expectedCheckOutTime": { "type": "string", "format": "date-time" },
    "guest": {
      "type": "object",
      "required": ["fullName", "phone"],
      "properties": {
        "fullName": { "type": "string", "minLength": 2 },
        "phone": { "type": "string" },
        "email": { "type": "string", "format": "email" },
        "idProofType": { "type": "string" },
        "idProofNumberMasked": { "type": "string" }
      }
    }
  }
}
```

#### Success Response: `201 Created`
```json
{
  "success": true,
  "data": {
    "stayId": "e1189382-7711-4822-ba33-918200192841",
    "roomId": "f9182381-8811-4192-ba22-118299102831",
    "roomNumber": "304",
    "folioId": "28192841-9922-4712-ba44-881928410291",
    "folioNumber": "FOL-2026-0304",
    "status": "CHECKED_IN",
    "checkInTime": "2026-09-26T14:00:00.000Z"
  },
  "meta": { "requestId": "req_01HAB34567" }
}
```
