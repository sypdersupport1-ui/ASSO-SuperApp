# ASSO Entity Relationships & Architecture Diagrams

> **Version:** 1.0.0  
> **Status:** SPECIFICATION / DESIGN ARTIFACT (PHASE 3)  
> **Authority:** Aligned with `ENTITY-CATALOG.md` and `DATABASE-SCHEMA.md`  

---

## 1. Canonical ER Overview

The diagram below maps the relationships across Core Platform, Identity, Context, Catalog, Ordering, Billing, and Shared Engines.

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ OUTLETS : "owns"
    ORGANIZATIONS ||--o{ STAFF_PROFILES : "employs"
    ORGANIZATIONS ||--o{ TENANT_ENTITLEMENTS : "subscribes"
    USERS ||--o{ STAFF_PROFILES : "authenticates"
    STAFF_PROFILES ||--o{ STAFF_ROLES : "assigned"
    ROLES ||--o{ STAFF_ROLES : "grants"
    ROLES ||--o{ ROLE_PERMISSIONS : "contains"
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : "defines"
    
    OUTLETS ||--o{ BUSINESS_CONTEXTS : "contains"
    BUSINESS_CONTEXTS ||--o{ QR_TOKENS : "referenced_by"
    QR_TOKENS ||--o{ CUSTOMER_SESSIONS : "authenticates"
    
    OUTLETS ||--o{ CATALOGS : "offers"
    CATALOGS ||--o{ CATALOG_CATEGORIES : "contains"
    CATALOG_CATEGORIES ||--o{ CATALOG_ITEMS : "groups"
    CATALOG_ITEMS ||--o{ CATALOG_ITEM_MODIFIERS : "configured_with"
    
    BUSINESS_CONTEXTS ||--o{ ORDERS : "associated_with"
    CUSTOMER_SESSIONS ||--o{ ORDERS : "places"
    ORDERS ||--o{ ORDER_ITEMS : "contains"
    ORDER_ITEMS ||--o{ ORDER_ITEM_MODIFIERS : "customized_by"
    
    ORDERS ||--o{ BILL_ORDERS : "consolidated_in"
    BILLS ||--o{ BILL_ORDERS : "groups"
    BILLS ||--o{ PAYMENT_TRANSACTIONS : "settled_by"
    PAYMENT_TRANSACTIONS ||--o{ PAYMENT_REFUNDS : "refunds"
    
    OUTLETS ||--o{ INVENTORY_LOCATIONS : "houses"
    INVENTORY_LOCATIONS ||--o{ INVENTORY_STOCK_BALANCES : "tracks"
    INVENTORY_ITEMS ||--o{ INVENTORY_STOCK_BALANCES : "quantifies"
    INVENTORY_LOCATIONS ||--o{ INVENTORY_STOCK_MOVEMENTS : "records"
    
    OUTLETS ||--o{ EXPENSES : "incurs"
    OUTLETS ||--o{ CASH_SESSIONS : "operates"
    CASH_SESSIONS ||--o{ CASH_MOVEMENTS : "logs"
    
    BUSINESS_CONTEXTS ||--o{ SERVICE_REQUESTS : "originates"
    BUSINESS_CONTEXTS ||--o{ CONVERSATIONS : "anchors"
    CONVERSATIONS ||--o{ MESSAGES : "contains"
```

---

## 2. Tenant Isolation Architecture

The multi-tenant hierarchy is strictly enforced at every level. No entity escapes the `tenant_id` boundary.

```mermaid
graph TD
    subgraph Multi_Tenancy_Hierarchy ["Multi-Tenancy Hierarchy"]
        P[Platform Super Admin]
        T1[Tenant: Organization Alpha]
        T2[Tenant: Organization Beta]
        
        O1[Outlet 1: Grand Palace Hotel]
        O2[Outlet 2: Spice Garden Bistro]
        O3[Outlet 3: Starlight Cinema]
        
        C1[Context: Room 301]
        C2[Context: Table 14]
        C3[Context: Screen 1 - Seat G12]
        
        P -->|Manages Plans & Modules| T1
        P -->|Manages Plans & Modules| T2
        
        T1 -->|tenant_id| O1
        T1 -->|tenant_id| O2
        T2 -->|tenant_id| O3
        
        O1 -->|outlet_id| C1
        O2 -->|outlet_id| C2
        O3 -->|outlet_id| C3
    end

    subgraph Data_Isolation_Boundary ["Tenant Data Isolation Boundary"]
        DB[(PostgreSQL Database)]
        RLS[PostgreSQL Row-Level Security]
        SESSION["SET LOCAL app.current_tenant_id = 'T1'"]
        
        SESSION --> RLS
        RLS -->|Strict Isolation Policy| DB
    end
```

---

## 3. Hotel Vertical Data Model

Hotel maps physical rooms to `business_contexts` and links Guest Stays, Folios, and Housekeeping to shared platform engines.

```mermaid
erDiagram
    OUTLETS ||--o{ HOTEL_ROOM_TYPES : "configures"
    HOTEL_ROOM_TYPES ||--o{ HOTEL_ROOMS : "classifies"
    BUSINESS_CONTEXTS ||--|| HOTEL_ROOMS : "physical_link"
    HOTEL_GUESTS ||--o{ HOTEL_STAYS : "reserves"
    HOTEL_ROOMS ||--o{ HOTEL_STAYS : "assigned_to"
    HOTEL_STAYS ||--|| HOTEL_FOLIOS : "charges_to"
    HOTEL_FOLIOS ||--o{ HOTEL_FOLIO_ENTRIES : "contains_ledger"
    HOTEL_ROOMS ||--o{ HOTEL_HOUSEKEEPING_TASKS : "requires"
    STAFF_PROFILES ||--o{ HOTEL_HOUSEKEEPING_TASKS : "attends"
    
    HOTEL_FOLIO_ENTRIES ||--o| BILLS : "references_bill"
    HOTEL_FOLIO_ENTRIES ||--o| PAYMENT_TRANSACTIONS : "references_payment"
```

---

## 4. Restaurant Vertical Data Model

Restaurant maps dining areas and tables to `business_contexts`, linking Queues, Reservations, and Kitchen Display Systems (KDS).

```mermaid
erDiagram
    OUTLETS ||--o{ RESTAURANT_DINING_AREAS : "zones"
    RESTAURANT_DINING_AREAS ||--o{ RESTAURANT_TABLES : "contains"
    BUSINESS_CONTEXTS ||--|| RESTAURANT_TABLES : "physical_link"
    RESTAURANT_TABLES ||--o{ RESTAURANT_RESERVATIONS : "reserves"
    RESTAURANT_TABLES ||--o{ RESTAURANT_QUEUE_ENTRIES : "assigns"
    
    RESTAURANT_TABLES ||--o{ ORDERS : "generates"
    ORDERS ||--o{ ORDER_ITEMS : "includes"
    ORDER_ITEMS }|--|| CATALOG_ITEMS : "ordered"
```

---

## 5. Cinema Vertical Data Model

Cinema maps screens and seats to `business_contexts`, supporting in-seat ordering and screen-area concessions.

```mermaid
erDiagram
    OUTLETS ||--o{ CINEMA_SCREENS : "houses"
    CINEMA_SCREENS ||--o{ CINEMA_SEATS : "arranges"
    BUSINESS_CONTEXTS ||--|| CINEMA_SEATS : "physical_link"
    CINEMA_SCREENS ||--o{ CINEMA_SHOWS : "schedules"
    
    CINEMA_SEATS ||--o{ ORDERS : "seat_order"
    CINEMA_SEATS ||--o{ SERVICE_REQUESTS : "seat_assistance"
```
