import { eq, and, or, ilike, desc, count, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers, type Customer } from "@/db/schema/core";
import { hotelGuests, hotelReservations, type HotelGuest } from "@/db/schema/hotel";
import { ValidationError, NotFoundError, BusinessRuleError } from "@/lib/api/errors";
import { recordAuditEvent } from "@/lib/audit";

export interface GuestProfileDetail {
  guestId: string;
  tenantId: string;
  customerId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  idProofType: string | null;
  idProofNumberMasked: string | null;
  nationality: string | null;
  vipStatus: string | null;
  preferences: Record<string, unknown> | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateHotelGuestInput {
  fullName: string;
  phone?: string;
  email?: string;
  idProofType?: string;
  idProofNumberMasked?: string;
  nationality?: string;
  vipStatus?: "STANDARD" | "VIP" | "VVIP";
  preferences?: Record<string, unknown>;
  notes?: string;
}

export interface UpdateHotelGuestInput {
  fullName?: string;
  phone?: string;
  email?: string;
  idProofType?: string;
  idProofNumberMasked?: string;
  nationality?: string;
  vipStatus?: "STANDARD" | "VIP" | "VVIP";
  preferences?: Record<string, unknown>;
  notes?: string;
}

/**
 * List Hotel Guests for a tenant with customer identity join, search, and pagination
 */
export async function listHotelGuests(
  tenantId: string,
  options: { search?: string; limit?: number; offset?: number } = {}
): Promise<{ guests: GuestProfileDetail[]; total: number }> {
  const db = getDb();
  const limit = Math.min(options.limit ?? 50, 100);
  const offset = options.offset ?? 0;

  const conditions = [eq(hotelGuests.tenantId, tenantId)];

  if (options.search && options.search.trim() !== "") {
    const q = `%${options.search.trim()}%`;
    conditions.push(
      or(
        ilike(customers.fullName, q),
        ilike(customers.phone, q),
        ilike(customers.email, q)
      )!
    );
  }

  // Count total matching
  const [totalResult] = await db
    .select({ total: count() })
    .from(hotelGuests)
    .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
    .where(and(...conditions));

  const total = Number(totalResult?.total ?? 0);

  const rows = await db
    .select({
      guestId: hotelGuests.guestId,
      tenantId: hotelGuests.tenantId,
      customerId: hotelGuests.customerId,
      fullName: customers.fullName,
      phone: customers.phone,
      email: customers.email,
      idProofType: hotelGuests.idProofType,
      idProofNumberMasked: hotelGuests.idProofNumberMasked,
      nationality: hotelGuests.nationality,
      vipStatus: hotelGuests.vipStatus,
      preferences: hotelGuests.preferences,
      notes: hotelGuests.notes,
      createdAt: hotelGuests.createdAt,
      updatedAt: hotelGuests.updatedAt,
    })
    .from(hotelGuests)
    .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
    .where(and(...conditions))
    .orderBy(desc(hotelGuests.createdAt))
    .limit(limit)
    .offset(offset);

  return { guests: rows as GuestProfileDetail[], total };
}

/**
 * Get Hotel Guest by ID with reservation summary
 */
export async function getHotelGuestById(
  tenantId: string,
  guestId: string
): Promise<GuestProfileDetail & { reservations: any[] }> {
  const db = getDb();

  const [row] = await db
    .select({
      guestId: hotelGuests.guestId,
      tenantId: hotelGuests.tenantId,
      customerId: hotelGuests.customerId,
      fullName: customers.fullName,
      phone: customers.phone,
      email: customers.email,
      idProofType: hotelGuests.idProofType,
      idProofNumberMasked: hotelGuests.idProofNumberMasked,
      nationality: hotelGuests.nationality,
      vipStatus: hotelGuests.vipStatus,
      preferences: hotelGuests.preferences,
      notes: hotelGuests.notes,
      createdAt: hotelGuests.createdAt,
      updatedAt: hotelGuests.updatedAt,
    })
    .from(hotelGuests)
    .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
    .where(and(eq(hotelGuests.guestId, guestId), eq(hotelGuests.tenantId, tenantId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Hotel Guest", `Guest with ID '${guestId}' was not found.`);
  }

  // Fetch recent reservations for this guest
  const reservations = await db
    .select()
    .from(hotelReservations)
    .where(and(eq(hotelReservations.guestId, guestId), eq(hotelReservations.tenantId, tenantId)))
    .orderBy(desc(hotelReservations.arrivalDate))
    .limit(10);

  return {
    ...(row as GuestProfileDetail),
    reservations,
  };
}

/**
 * Create a Hotel Guest: attaches to shared Customer identity or creates customer atomically
 */
export async function createHotelGuest(
  tenantId: string,
  input: CreateHotelGuestInput,
  userId?: string
): Promise<GuestProfileDetail> {
  const db = getDb();

  if (!input.fullName || input.fullName.trim().length < 2) {
    throw new ValidationError("Full name is required (at least 2 characters).");
  }

  // 1. Check if a Customer already exists under this tenant with the same phone or email
  let customerId: string | undefined;
  if (input.phone && input.phone.trim()) {
    const [existingCustomer] = await db
      .select({ customerId: customers.customerId })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.phone, input.phone.trim())))
      .limit(1);

    if (existingCustomer) {
      customerId = existingCustomer.customerId;
    }
  }

  if (!customerId && input.email && input.email.trim()) {
    const [existingCustomer] = await db
      .select({ customerId: customers.customerId })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.email, input.email.trim().toLowerCase())))
      .limit(1);

    if (existingCustomer) {
      customerId = existingCustomer.customerId;
    }
  }

  // 2. If no existing shared customer, create one
  if (!customerId) {
    const [newCustomer] = await db
      .insert(customers)
      .values({
        tenantId,
        fullName: input.fullName.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
      })
      .returning();

    customerId = newCustomer.customerId;
  }

  // 3. Create Hotel Guest Context
  const [createdGuest] = await db
    .insert(hotelGuests)
    .values({
      tenantId,
      customerId,
      idProofType: input.idProofType?.trim() || null,
      idProofNumberMasked: input.idProofNumberMasked?.trim() || null,
      nationality: input.nationality?.trim() || "INDIAN",
      vipStatus: input.vipStatus || "STANDARD",
      preferences: input.preferences || {},
      notes: input.notes?.trim() || null,
    })
    .returning();

  // Audit event (PII protected: masked/redacted in logs)
  await recordAuditEvent({
    tenantId,
    userId,
    action: "HOTEL_GUEST_CREATED",
    resourceType: "HOTEL_GUEST",
    resourceId: createdGuest.guestId,
    payload: {
      customerId,
      vipStatus: createdGuest.vipStatus,
      nationality: createdGuest.nationality,
    },
  });

  return {
    guestId: createdGuest.guestId,
    tenantId: createdGuest.tenantId,
    customerId: createdGuest.customerId,
    fullName: input.fullName.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim().toLowerCase() || null,
    idProofType: createdGuest.idProofType,
    idProofNumberMasked: createdGuest.idProofNumberMasked,
    nationality: createdGuest.nationality,
    vipStatus: createdGuest.vipStatus,
    preferences: createdGuest.preferences as Record<string, unknown> | null,
    notes: createdGuest.notes,
    createdAt: createdGuest.createdAt,
    updatedAt: createdGuest.updatedAt,
  };
}

/**
 * Update Hotel Guest Context and Customer Identity
 */
export async function updateHotelGuest(
  tenantId: string,
  guestId: string,
  input: UpdateHotelGuestInput,
  userId?: string
): Promise<GuestProfileDetail> {
  const db = getDb();

  const [current] = await db
    .select({
      guestId: hotelGuests.guestId,
      customerId: hotelGuests.customerId,
    })
    .from(hotelGuests)
    .where(and(eq(hotelGuests.guestId, guestId), eq(hotelGuests.tenantId, tenantId)))
    .limit(1);

  if (!current) {
    throw new NotFoundError("Hotel Guest", `Guest with ID '${guestId}' was not found.`);
  }

  // Update customer fields if provided
  const customerUpdates: Partial<Customer> = {};
  if (input.fullName !== undefined) customerUpdates.fullName = input.fullName.trim();
  if (input.phone !== undefined) customerUpdates.phone = input.phone?.trim() || null;
  if (input.email !== undefined) customerUpdates.email = input.email?.trim().toLowerCase() || null;

  if (Object.keys(customerUpdates).length > 0) {
    customerUpdates.updatedAt = new Date();
    await db
      .update(customers)
      .set(customerUpdates)
      .where(eq(customers.customerId, current.customerId));
  }

  // Update hotel guest fields
  const guestUpdates: Partial<HotelGuest> = {};
  if (input.idProofType !== undefined) guestUpdates.idProofType = input.idProofType?.trim() || null;
  if (input.idProofNumberMasked !== undefined) guestUpdates.idProofNumberMasked = input.idProofNumberMasked?.trim() || null;
  if (input.nationality !== undefined) guestUpdates.nationality = input.nationality?.trim() || null;
  if (input.vipStatus !== undefined) guestUpdates.vipStatus = input.vipStatus;
  if (input.preferences !== undefined) guestUpdates.preferences = input.preferences;
  if (input.notes !== undefined) guestUpdates.notes = input.notes?.trim() || null;
  guestUpdates.updatedAt = new Date();

  await db
    .update(hotelGuests)
    .set(guestUpdates)
    .where(eq(hotelGuests.guestId, guestId));

  await recordAuditEvent({
    tenantId,
    userId,
    action: "HOTEL_GUEST_UPDATED",
    resourceType: "HOTEL_GUEST",
    resourceId: guestId,
    payload: {
      vipStatus: guestUpdates.vipStatus,
      updatedCustomer: Object.keys(customerUpdates).length > 0,
    },
  });

  return await getHotelGuestById(tenantId, guestId);
}
