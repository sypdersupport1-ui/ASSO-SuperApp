-- Migration 0002: Row-Level Security (RLS) & Tenant Isolation Policies
-- In accordance with docs/04-DATABASE/RLS-ARCHITECTURE.md

-- 1. Organizations (Tenant Root)
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_tenant_select" ON "organizations" FOR SELECT USING ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "org_tenant_insert" ON "organizations" FOR INSERT WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "org_tenant_update" ON "organizations" FOR UPDATE USING ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "org_tenant_delete" ON "organizations" FOR DELETE USING ("organization_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

-- 2. Tenant-Scoped Operational Tables
ALTER TABLE "outlets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outlets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "outlets_tenant_select" ON "outlets" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "outlets_tenant_insert" ON "outlets" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "outlets_tenant_update" ON "outlets" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "outlets_tenant_delete" ON "outlets" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "roles_tenant_select" ON "roles" FOR SELECT USING ("tenant_id" IS NULL OR "tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "roles_tenant_insert" ON "roles" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "roles_tenant_update" ON "roles" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "roles_tenant_delete" ON "roles" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "staff_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "staff_profiles_tenant_select" ON "staff_profiles" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "staff_profiles_tenant_insert" ON "staff_profiles" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "staff_profiles_tenant_update" ON "staff_profiles" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "staff_profiles_tenant_delete" ON "staff_profiles" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "tenant_entitlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_entitlements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_entitlements_tenant_select" ON "tenant_entitlements" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "tenant_entitlements_tenant_insert" ON "tenant_entitlements" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "tenant_entitlements_tenant_update" ON "tenant_entitlements" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "tenant_entitlements_tenant_delete" ON "tenant_entitlements" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "business_contexts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_contexts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "business_contexts_tenant_select" ON "business_contexts" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "business_contexts_tenant_insert" ON "business_contexts" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "business_contexts_tenant_update" ON "business_contexts" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "business_contexts_tenant_delete" ON "business_contexts" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "qr_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qr_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY "qr_tokens_tenant_select" ON "qr_tokens" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "qr_tokens_tenant_insert" ON "qr_tokens" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "qr_tokens_tenant_update" ON "qr_tokens" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "qr_tokens_tenant_delete" ON "qr_tokens" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "customer_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "customer_sessions_tenant_select" ON "customer_sessions" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "customer_sessions_tenant_insert" ON "customer_sessions" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "customer_sessions_tenant_update" ON "customer_sessions" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "customer_sessions_tenant_delete" ON "customer_sessions" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "catalogs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalogs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "catalogs_tenant_select" ON "catalogs" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "catalogs_tenant_insert" ON "catalogs" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "catalogs_tenant_update" ON "catalogs" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "catalogs_tenant_delete" ON "catalogs" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "catalog_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog_categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY "catalog_categories_tenant_select" ON "catalog_categories" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "catalog_categories_tenant_insert" ON "catalog_categories" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "catalog_categories_tenant_update" ON "catalog_categories" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "catalog_categories_tenant_delete" ON "catalog_categories" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "catalog_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "catalog_items_tenant_select" ON "catalog_items" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "catalog_items_tenant_insert" ON "catalog_items" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "catalog_items_tenant_update" ON "catalog_items" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "catalog_items_tenant_delete" ON "catalog_items" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY "orders_tenant_select" ON "orders" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "orders_tenant_insert" ON "orders" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "orders_tenant_update" ON "orders" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "orders_tenant_delete" ON "orders" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "order_items_tenant_select" ON "order_items" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "order_items_tenant_insert" ON "order_items" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "order_items_tenant_update" ON "order_items" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "order_items_tenant_delete" ON "order_items" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "order_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_status_history" FORCE ROW LEVEL SECURITY;
CREATE POLICY "order_status_history_tenant_select" ON "order_status_history" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "order_status_history_tenant_insert" ON "order_status_history" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "order_status_history_tenant_update" ON "order_status_history" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "order_status_history_tenant_delete" ON "order_status_history" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bills" FORCE ROW LEVEL SECURITY;
CREATE POLICY "bills_tenant_select" ON "bills" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "bills_tenant_insert" ON "bills" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "bills_tenant_update" ON "bills" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "bills_tenant_delete" ON "bills" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "expense_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expense_categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY "expense_categories_tenant_select" ON "expense_categories" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "expense_categories_tenant_insert" ON "expense_categories" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "expense_categories_tenant_update" ON "expense_categories" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "expense_categories_tenant_delete" ON "expense_categories" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" FORCE ROW LEVEL SECURITY;
CREATE POLICY "expenses_tenant_select" ON "expenses" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "expenses_tenant_insert" ON "expenses" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "expenses_tenant_update" ON "expenses" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "expenses_tenant_delete" ON "expenses" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "cash_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cash_sessions_tenant_select" ON "cash_sessions" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "cash_sessions_tenant_insert" ON "cash_sessions" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "cash_sessions_tenant_update" ON "cash_sessions" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "cash_sessions_tenant_delete" ON "cash_sessions" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "inventory_units" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_units" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inventory_units_tenant_select" ON "inventory_units" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inventory_units_tenant_insert" ON "inventory_units" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inventory_units_tenant_update" ON "inventory_units" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inventory_units_tenant_delete" ON "inventory_units" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "inventory_suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_suppliers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inventory_suppliers_tenant_select" ON "inventory_suppliers" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inventory_suppliers_tenant_insert" ON "inventory_suppliers" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inventory_suppliers_tenant_update" ON "inventory_suppliers" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inventory_suppliers_tenant_delete" ON "inventory_suppliers" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "inventory_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inventory_items_tenant_select" ON "inventory_items" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inventory_items_tenant_insert" ON "inventory_items" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inventory_items_tenant_update" ON "inventory_items" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inventory_items_tenant_delete" ON "inventory_items" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "inventory_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_locations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inventory_locations_tenant_select" ON "inventory_locations" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inventory_locations_tenant_insert" ON "inventory_locations" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inventory_locations_tenant_update" ON "inventory_locations" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inventory_locations_tenant_delete" ON "inventory_locations" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "inventory_stock_balances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_stock_balances" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inventory_stock_balances_tenant_select" ON "inventory_stock_balances" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inventory_stock_balances_tenant_insert" ON "inventory_stock_balances" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inventory_stock_balances_tenant_update" ON "inventory_stock_balances" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inventory_stock_balances_tenant_delete" ON "inventory_stock_balances" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "hotel_folios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hotel_folios" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hotel_folios_tenant_select" ON "hotel_folios" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "hotel_folios_tenant_insert" ON "hotel_folios" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "hotel_folios_tenant_update" ON "hotel_folios" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "hotel_folios_tenant_delete" ON "hotel_folios" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY "idempotency_keys_tenant_select" ON "idempotency_keys" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "idempotency_keys_tenant_insert" ON "idempotency_keys" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "idempotency_keys_tenant_update" ON "idempotency_keys" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "idempotency_keys_tenant_delete" ON "idempotency_keys" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

ALTER TABLE "file_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "file_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY "file_records_tenant_select" ON "file_records" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "file_records_tenant_insert" ON "file_records" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "file_records_tenant_update" ON "file_records" FOR UPDATE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "file_records_tenant_delete" ON "file_records" FOR DELETE USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

--> statement-breakpoint

-- 3. Canonical Append-Only Ledgers (Updates and Deletes strictly prohibited)
ALTER TABLE "inventory_stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_stock_movements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inv_movements_tenant_select" ON "inventory_stock_movements" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inv_movements_tenant_insert" ON "inventory_stock_movements" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "inv_movements_no_update" ON "inventory_stock_movements" FOR UPDATE USING (false);
CREATE POLICY "inv_movements_no_delete" ON "inventory_stock_movements" FOR DELETE USING (false);

--> statement-breakpoint

ALTER TABLE "hotel_folio_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hotel_folio_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "hotel_folio_entries_tenant_select" ON "hotel_folio_entries" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "hotel_folio_entries_tenant_insert" ON "hotel_folio_entries" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "hotel_folio_entries_no_update" ON "hotel_folio_entries" FOR UPDATE USING (false);
CREATE POLICY "hotel_folio_entries_no_delete" ON "hotel_folio_entries" FOR DELETE USING (false);

--> statement-breakpoint

ALTER TABLE "payment_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_transactions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_transactions_tenant_select" ON "payment_transactions" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "payment_transactions_tenant_insert" ON "payment_transactions" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "payment_transactions_no_update" ON "payment_transactions" FOR UPDATE USING (false);
CREATE POLICY "payment_transactions_no_delete" ON "payment_transactions" FOR DELETE USING (false);

--> statement-breakpoint

ALTER TABLE "payment_refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_refunds" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_refunds_tenant_select" ON "payment_refunds" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "payment_refunds_tenant_insert" ON "payment_refunds" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "payment_refunds_no_update" ON "payment_refunds" FOR UPDATE USING (false);
CREATE POLICY "payment_refunds_no_delete" ON "payment_refunds" FOR DELETE USING (false);

--> statement-breakpoint

ALTER TABLE "cash_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_movements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cash_movements_tenant_select" ON "cash_movements" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "cash_movements_tenant_insert" ON "cash_movements" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "cash_movements_no_update" ON "cash_movements" FOR UPDATE USING (false);
CREATE POLICY "cash_movements_no_delete" ON "cash_movements" FOR DELETE USING (false);

--> statement-breakpoint

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_events_tenant_select" ON "audit_events" FOR SELECT USING ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "audit_events_tenant_insert" ON "audit_events" FOR INSERT WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY "audit_events_no_update" ON "audit_events" FOR UPDATE USING (false);
CREATE POLICY "audit_events_no_delete" ON "audit_events" FOR DELETE USING (false);

--> statement-breakpoint

-- 4. Global Reference Tables (Public Read Access)
ALTER TABLE "commercial_plans" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commercial_plans_global_select" ON "commercial_plans" FOR SELECT USING (true);

--> statement-breakpoint

ALTER TABLE "platform_modules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_modules_global_select" ON "platform_modules" FOR SELECT USING (true);

--> statement-breakpoint

ALTER TABLE "plan_modules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_modules_global_select" ON "plan_modules" FOR SELECT USING (true);

--> statement-breakpoint

ALTER TABLE "pricing_configurations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing_configurations_global_select" ON "pricing_configurations" FOR SELECT USING (true);

--> statement-breakpoint

ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions_global_select" ON "permissions" FOR SELECT USING (true);

--> statement-breakpoint

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_global_select" ON "users" FOR SELECT USING (true);
