# ASSO Chat & Conversations UX Specification

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 4)  
> **Authority:** Aligned with Phase 2 Architecture (`SHARED-ENGINES.md`) and Phase 3 File Security Model  

---

## 1. Chat Philosophy & Use Cases

ASSO provides a shared, real-time messaging engine serving two distinct operational streams:
1. **Guest-to-Staff Communication:** A guest in Room 304 or Table 12 chats directly with the front desk, waiter, or concierge without installing WhatsApp or third-party apps.
2. **Internal Staff Dispatch:** Front desk messaging housekeeping or kitchen leads regarding urgent guest requests.

---

## 2. Interface Anatomy (Staff Workspace View)

```text
┌──────────────────────────────┬────────────────────────────────────────────────────────┐
│ Active Conversations (4)     │ Room 304 - Ananya Sharma (Deluxe King)   [Escalate] [⋮]│
├──────────────────────────────┼────────────────────────────────────────────────────────┤
│ [●] Room 304 (Ananya S.)     │ [12:30 PM] System: Session initiated via Room QR       │
│     "Could we get 2 extra..."│                                                        │
│     12:32 PM  • [1]          │ [12:31 PM] Guest (Room 304):                           │
│                              │ Could we get 2 extra bath towels and drinking water?   │
│ [ ] Table 14 (Spice Bistro)  │                                                        │
│     "Can we get the bill?"   │ [12:32 PM] Front Desk (Rahul M.):                      │
│     12:28 PM                 │ Absolutely, Ms. Sharma! Housekeeping has dispatched    │
│                              │ them now.                                       [✓✓]   │
│ [ ] Maintenance Desk         │                                                        │
│     "AC unit Room 204 fixed" │                                                        │
│     11:45 AM                 ├────────────────────────────────────────────────────────┤
│                              │ [Type a reply...                        ] [📎] [Send →]│
└──────────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 3. Interaction & Visual Standards

### 3.1 Message Bubble Styling
- **Guest Messages:** Left-aligned, high-contrast light background (`--bg-surface`, border `--border-default`), dark text. Displays sender name and physical context tag (`Room 304`).
- **Staff Replies:** Right-aligned, primary brand tint (`--primary-subtle`), dark text. Displays staff name and role badge (`Front Desk Agent`).
- **System Events:** Center-aligned, small muted caption text (`--text-muted`, e.g. *"Service Request #SR-102 created from this conversation"*).

### 3.2 Message Status & Read Receipts
- `Sending...`: Muted clock icon.
- `Delivered`: Single gray checkmark (`✓`).
- `Read / Seen`: Double emerald checkmarks (`✓✓`).

### 3.3 Media & Photo Attachments
- Guests or staff can attach photos (e.g. guest sends photo of a broken bathroom tap or maintenance issue):
  - Thumbnail preview renders inline inside the chat bubble with a 1:1 aspect ratio.
  - Clicking thumbnail opens full-screen accessible modal lightbox.
  - Enforces Phase 3 security controls: Pre-signed PUT URL, strict MIME validation (`image/jpeg`, `image/png`, `image/webp`), max 5MB size limit.

### 3.4 Operational Escalation Action
- Any conversation thread features a prominent header action: `[Escalate to Service Ticket]`.
- Clicking prompts staff to select ticket category (`Housekeeping Amenity`, `Plumbing Maintenance`, `Luggage Assistance`), automatically linking the conversation history to the newly created `service_requests` record.
