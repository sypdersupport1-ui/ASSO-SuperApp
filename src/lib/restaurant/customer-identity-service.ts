import { eq, and, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers, type Customer } from "@/db/schema/core";
import { customerSessions, type CustomerSession } from "@/db/schema/context";
import { restaurantTables, restaurantTableSessions } from "@/db/schema/restaurant";
import { signJwt } from "@/lib/auth/jwt";
import { ValidationError, NotFoundError, AuthenticationError } from "@/lib/api/errors";

/**
 * Normalizes phone numbers for consistent deduplication and tenant isolation.
 * Strips whitespace, hyphens, brackets, dots.
 * Automatically prefixes 10-digit numbers with +91 standard mobile prefix.
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  let cleaned = trimmed.replace(/[\s\-\(\)\.]/g, "");
  
  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.slice(2);
  }
  
  if (/^\d{10}$/.test(cleaned)) {
    cleaned = `+91${cleaned}`;
  }
  
  return cleaned;
}

export interface CustomerIdentityInput {
  fullName: string;
  phone: string;
  email?: string | null;
}

/**
 * Finds an existing customer by normalized phone within the tenant,
 * or creates a new business customer record in the shared Customer Engine.
 * 
 * Invariants:
 * 1. Name and phone are REQUIRED.
 * 2. Strictly tenant/business isolated.
 * 3. Does NOT create duplicate customer records for the same tenant & normalized phone.
 */
export async function findOrCreateBusinessCustomer(
  tenantId: string,
  input: CustomerIdentityInput
): Promise<Customer> {
  const fullName = input.fullName?.trim();
  const rawPhone = input.phone?.trim();

  if (!fullName || fullName.length < 2) {
    throw new ValidationError("Customer name is required and must be at least 2 characters.");
  }

  if (!rawPhone) {
    throw new ValidationError("Customer phone number is required.");
  }

  const normalizedPhone = normalizePhoneNumber(rawPhone);
  if (normalizedPhone.length < 8) {
    throw new ValidationError("Please provide a valid phone number (at least 8 digits).");
  }

  const db = getDb();

  // 1. Check for existing customer within tenant by normalized phone
  const [existingCustomer] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.tenantId, tenantId),
        eq(customers.phone, normalizedPhone)
      )
    )
    .limit(1);

  if (existingCustomer) {
    return existingCustomer;
  }

  // 2. Create new business customer record in shared Customer Engine
  const [newCustomer] = await db
    .insert(customers)
    .values({
      tenantId,
      fullName,
      phone: normalizedPhone,
      email: input.email?.trim() || null,
    })
    .returning();

  return newCustomer;
}

/**
 * Links a customer identity (Name + Phone) to an active restaurant customer session.
 * 
 * Invariants:
 * 1. Session must exist, belong to tenant, and be active/unexpired.
 * 2. Deduplicates/finds or creates business customer.
 * 3. Updates customer_sessions with customer_id, customer_name, customer_phone.
 * 4. Mints enriched Customer JWT with customerId claim.
 */
export async function identifyCustomerSession(
  tenantId: string,
  sessionId: string,
  input: CustomerIdentityInput
): Promise<{
  customer: Customer;
  session: CustomerSession;
  sessionToken: string;
}> {
  const db = getDb();

  // 1. Verify active customer session
  const [session] = await db
    .select()
    .from(customerSessions)
    .where(
      and(
        eq(customerSessions.sessionId, sessionId),
        eq(customerSessions.tenantId, tenantId),
        eq(customerSessions.sessionStatus, "ACTIVE"),
        gt(customerSessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!session) {
    throw new AuthenticationError("Active customer session not found or expired. Please re-scan table QR.");
  }

  // 2. Find or create business customer
  const customer = await findOrCreateBusinessCustomer(tenantId, input);

  // 3. Update customer_sessions record
  const [updatedSession] = await db
    .update(customerSessions)
    .set({
      customerId: customer.customerId,
      customerName: customer.fullName,
      customerPhone: customer.phone,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(customerSessions.sessionId, sessionId),
        eq(customerSessions.tenantId, tenantId)
      )
    )
    .returning();

  // 4. Optionally update table session if active table session exists for this context
  try {
    const [tableRow] = await db
      .select()
      .from(restaurantTables)
      .where(
        and(
          eq(restaurantTables.contextId, session.contextId),
          eq(restaurantTables.tenantId, tenantId)
        )
      )
      .limit(1);

    if (tableRow) {
      const [activeTableSession] = await db
        .select()
        .from(restaurantTableSessions)
        .where(
          and(
            eq(restaurantTableSessions.tableId, tableRow.tableId),
            eq(restaurantTableSessions.status, "ACTIVE")
          )
        )
        .limit(1);

      if (activeTableSession && !activeTableSession.customerName) {
        await db
          .update(restaurantTableSessions)
          .set({
            customerName: customer.fullName,
            customerPhone: customer.phone,
            updatedAt: new Date(),
          })
          .where(eq(restaurantTableSessions.sessionId, activeTableSession.sessionId));
      }
    }
  } catch {
    // Non-critical table session sync failure
  }

  // 5. Mint updated Customer JWT
  const sessionToken = signJwt(
    {
      sub: session.sessionId,
      tenantId,
      outletId: session.outletId,
      contextId: session.contextId,
      customerId: customer.customerId,
      sessionType: "CUSTOMER",
      roles: [],
      permissions: [],
      isSuperAdmin: false,
    },
    14400 // 4 hours
  );

  return {
    customer,
    session: updatedSession,
    sessionToken,
  };
}
