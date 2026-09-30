import crypto from "crypto";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  hotelFolios,
  hotelFolioEntries,
} from "@/db/schema/hotel_ledger";
import {
  hotelStays,
  hotelReservations,
  hotelRooms,
  hotelRoomTypes,
  hotelGuests,
} from "@/db/schema/hotel";
import { orders } from "@/db/schema/operations";
import { customers, staffProfiles } from "@/db/schema/core";
import {
  ValidationError,
  NotFoundError,
  BusinessRuleError,
} from "@/lib/api/errors";
import {
  type HotelFolioStatus,
  type HotelFolioEntryType,
  type HotelPaymentMethod,
  validateFolioStatusTransition,
  calculateFolioBalances,
  getEntryDirection,
} from "./folio-state-machines";
import { recordAuditEvent } from "@/lib/audit";
import { getRealtimeHub } from "@/lib/realtime/sse";
import { createDomainEvent, recordOutboxEvent, processOutboxBatch } from "@/lib/events/outbox";
import { BillPaymentSuccessPayload, BillGeneratedPayload, generateSecureReceiptUrl } from "@/lib/events/types";

// ============================================================================
// DTOs & Interfaces
// ============================================================================

export interface FolioEntryDto {
  entryId: string;
  folioId: string;
  entryType: HotelFolioEntryType;
  direction: "DEBIT" | "CREDIT";
  amount: string;
  description: string;
  referenceId: string | null;
  reversesEntryId: string | null;
  postedByStaffId: string | null;
  createdAt: Date;
}

export interface FolioStaySummaryDto {
  stayId: string;
  stayNumber: string;
  status: string;
  checkInAt: Date;
  expectedCheckOutAt: Date;
  actualCheckOutAt: Date | null;
  guestName: string;
  roomNumber: string;
  roomTypeName: string;
}

export interface FolioDetailDto {
  folioId: string;
  tenantId: string;
  outletId: string;
  stayId: string;
  folioNumber: string;
  status: HotelFolioStatus;
  totalCharges: string;
  totalPayments: string;
  balanceDue: string;
  settledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  stay: FolioStaySummaryDto | null;
  entries: FolioEntryDto[];
}

export interface PostRoomChargeInput {
  amount?: number | string;
  description?: string;
  notes?: string;
}

export interface PostManualChargeInput {
  entryType?: "ROOM_CHARGE" | "SERVICE_CHARGE" | "TAX";
  amount: number | string;
  description: string;
  notes?: string;
}

export interface PostAdjustmentInput {
  amount: number | string; // Positive for additional debit, negative for credit reduction
  reason: string;
  reversesEntryId?: string;
  notes?: string;
}

export interface RecordPaymentInput {
  amount: number | string;
  paymentMethod: HotelPaymentMethod;
  referenceNumber?: string;
  notes?: string;
}

export interface RecordRefundInput {
  amount: number | string;
  originalPaymentEntryId: string;
  reason: string;
  notes?: string;
}

export interface CloseFolioInput {
  notes?: string;
}

export interface ReopenFolioInput {
  reason: string;
  notes?: string;
}

// ============================================================================
// Helper: Generate Unique Folio Number
// ============================================================================

function generateFolioNumber(): string {
  const d = new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `FOL-${dateStr}-${rand}`;
}

async function resolveStaffId(
  executor: any,
  tenantId: string,
  staffId?: string | null
): Promise<string | null> {
  if (!staffId) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(staffId)) return null;
  const [staff] = await executor
    .select({ staffId: staffProfiles.staffId })
    .from(staffProfiles)
    .where(and(eq(staffProfiles.tenantId, tenantId), eq(staffProfiles.staffId, staffId)))
    .limit(1);
  return staff ? staff.staffId : null;
}

// ============================================================================
// 1. Get or Create Folio for Stay
// ============================================================================

export async function getOrCreateFolioForStay(
  tenantId: string,
  outletId: string,
  stayId: string,
  userId?: string,
  executor?: any
) {
  const db = executor || getDb();

  // 1. Check existing folio
  const [existing] = await db
    .select()
    .from(hotelFolios)
    .where(
      and(
        eq(hotelFolios.tenantId, tenantId),
        eq(hotelFolios.stayId, stayId)
      )
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  // 2. Validate stay exists
  const [stay] = await db
    .select()
    .from(hotelStays)
    .where(
      and(
        eq(hotelStays.stayId, stayId),
        eq(hotelStays.tenantId, tenantId),
        eq(hotelStays.outletId, outletId)
      )
    )
    .limit(1);

  if (!stay) {
    throw new NotFoundError(`Hotel stay with ID '${stayId}' not found.`);
  }

  // 3. Create Folio Header
  const folioNumber = generateFolioNumber();
  const [created] = await db
    .insert(hotelFolios)
    .values({
      tenantId,
      outletId,
      stayId,
      folioNumber,
      status: "OPEN",
      totalCharges: "0.0000",
      totalPayments: "0.0000",
      balanceDue: "0.0000",
    })
    .returning();

  // Audit
  await recordAuditEvent({
    tenantId,
    userId: userId || "00000000-0000-0000-0000-000000000001",
    action: "hotel.folio.created",
    resourceType: "hotel_folio",
    resourceId: created.folioId,
    payload: {
      folioNumber: created.folioNumber,
      stayId,
      outletId,
    },
  });

  return created;
}

// ============================================================================
// 2. Get Folio Detail (Hydrated with Stay, Room, Guest, Entries)
// ============================================================================

export async function getFolioDetailByStayId(
  tenantId: string,
  outletId: string,
  stayId: string,
  userId?: string,
  executor?: any
): Promise<FolioDetailDto> {
  const db = executor || getDb();

  // Ensure folio header exists
  const folio = await getOrCreateFolioForStay(tenantId, outletId, stayId, userId, db);

  // Retrieve stay context
  const [stayRow] = await db
    .select({
      stay: hotelStays,
      room: hotelRooms,
      roomType: hotelRoomTypes,
      guest: hotelGuests,
      customer: customers,
    })
    .from(hotelStays)
    .innerJoin(hotelRooms, eq(hotelStays.roomId, hotelRooms.roomId))
    .innerJoin(hotelRoomTypes, eq(hotelRooms.roomTypeId, hotelRoomTypes.roomTypeId))
    .innerJoin(hotelGuests, eq(hotelStays.guestId, hotelGuests.guestId))
    .innerJoin(customers, eq(hotelGuests.customerId, customers.customerId))
    .where(
      and(
        eq(hotelStays.stayId, stayId),
        eq(hotelStays.tenantId, tenantId),
        eq(hotelStays.outletId, outletId)
      )
    )
    .limit(1);

  // Retrieve all immutable entries
  const entryRows = await db
    .select()
    .from(hotelFolioEntries)
    .where(
      and(
        eq(hotelFolioEntries.folioId, folio.folioId),
        eq(hotelFolioEntries.tenantId, tenantId)
      )
    )
    .orderBy(asc(hotelFolioEntries.createdAt));

  // Compute derived balances deterministically
  const balances = calculateFolioBalances(
    entryRows.map((e: typeof hotelFolioEntries.$inferSelect) => ({
      entryType: e.entryType as HotelFolioEntryType,
      amount: e.amount,
    }))
  );

  const entriesDto: FolioEntryDto[] = entryRows.map((e: typeof hotelFolioEntries.$inferSelect) => {
    const type = e.entryType as HotelFolioEntryType;
    const numAmt = parseFloat(e.amount);
    return {
      entryId: e.entryId,
      folioId: e.folioId,
      entryType: type,
      direction: getEntryDirection(type, numAmt),
      amount: e.amount,
      description: e.description,
      referenceId: e.referenceId,
      reversesEntryId: e.reversesEntryId,
      postedByStaffId: e.postedByStaffId,
      createdAt: e.createdAt,
    };
  });

  const staySummary: FolioStaySummaryDto | null = stayRow
    ? {
        stayId: stayRow.stay.stayId,
        stayNumber: stayRow.stay.stayNumber,
        status: stayRow.stay.status,
        checkInAt: stayRow.stay.checkInAt,
        expectedCheckOutAt: stayRow.stay.expectedCheckOutAt,
        actualCheckOutAt: stayRow.stay.actualCheckOutAt,
        guestName: `${stayRow.customer.firstName || ""} ${stayRow.customer.lastName || ""}`.trim() || "Guest",
        roomNumber: stayRow.room.roomNumber,
        roomTypeName: stayRow.roomType.name,
      }
    : null;

  return {
    folioId: folio.folioId,
    tenantId: folio.tenantId,
    outletId: folio.outletId,
    stayId: folio.stayId as string,
    folioNumber: folio.folioNumber,
    status: folio.status as HotelFolioStatus,
    totalCharges: balances.totalCharges,
    totalPayments: balances.totalPayments,
    balanceDue: balances.balanceDue,
    settledAt: folio.settledAt,
    createdAt: folio.createdAt,
    updatedAt: folio.updatedAt,
    stay: staySummary,
    entries: entriesDto,
  };
}

// ============================================================================
// 3. Post Room Charge to Folio
// ============================================================================

export async function postRoomCharge(params: {
  tenantId: string;
  outletId: string;
  stayId: string;
  input?: PostRoomChargeInput;
  postedByStaffId?: string;
}): Promise<FolioDetailDto> {
  const { tenantId, outletId, stayId, input, postedByStaffId } = params;
  const db = getDb();

  return await db.transaction(async (tx) => {
    // 1. Lock Stay row
    const [stay] = await tx
      .select({
        stay: hotelStays,
        room: hotelRooms,
        roomType: hotelRoomTypes,
        reservation: hotelReservations,
      })
      .from(hotelStays)
      .innerJoin(hotelRooms, eq(hotelStays.roomId, hotelRooms.roomId))
      .innerJoin(hotelRoomTypes, eq(hotelRooms.roomTypeId, hotelRoomTypes.roomTypeId))
      .innerJoin(hotelReservations, eq(hotelStays.reservationId, hotelReservations.reservationId))
      .where(
        and(
          eq(hotelStays.stayId, stayId),
          eq(hotelStays.tenantId, tenantId),
          eq(hotelStays.outletId, outletId)
        )
      )
      .for("update");

    if (!stay) {
      throw new NotFoundError(`Stay with ID '${stayId}' not found.`);
    }

    // 2. Lock / Get Folio Header
    let [folio] = await tx
      .select()
      .from(hotelFolios)
      .where(
        and(
          eq(hotelFolios.stayId, stayId),
          eq(hotelFolios.tenantId, tenantId)
        )
      )
      .for("update");

    if (!folio) {
      const folioNumber = generateFolioNumber();
      const [created] = await tx
        .insert(hotelFolios)
        .values({
          tenantId,
          outletId,
          stayId,
          folioNumber,
          status: "OPEN",
          totalCharges: "0.0000",
          totalPayments: "0.0000",
          balanceDue: "0.0000",
        })
        .returning();
      folio = created;
    }

    if (folio.status !== "OPEN") {
      throw new BusinessRuleError(
        `Cannot post charges to a closed folio (Folio status: ${folio.status}). Please reopen the folio first.`
      );
    }

    // 3. Determine authoritative charge amount
    let chargeAmount: number;
    let chargeDesc: string;

    if (input?.amount !== undefined && input?.amount !== null) {
      chargeAmount = typeof input.amount === "number" ? input.amount : parseFloat(input.amount);
      if (isNaN(chargeAmount) || chargeAmount <= 0) {
        throw new ValidationError("Room charge amount must be a positive number.");
      }
      chargeDesc = input.description || `Room Charge - Room ${stay.room.roomNumber}`;
    } else {
      // Default from reservation total amount or room base rate
      const resAmount = parseFloat(stay.reservation.totalAmount || "0");
      chargeAmount = resAmount > 0 ? resAmount : parseFloat(stay.roomType.baseRate);
      chargeDesc = input?.description || `Room Charge - Room ${stay.room.roomNumber} (${stay.roomType.name})`;
    }

    const sanitizedStaffId = await resolveStaffId(tx, tenantId, postedByStaffId);

    // 4. Insert immutable ledger entry
    const [entry] = await tx
      .insert(hotelFolioEntries)
      .values({
        tenantId,
        folioId: folio.folioId,
        entryType: "ROOM_CHARGE",
        amount: chargeAmount.toFixed(4),
        description: chargeDesc,
        referenceId: stay.stay.stayId,
        postedByStaffId: sanitizedStaffId,
      })
      .returning();

    // 5. Recalculate & Update Header
    const allEntries = await tx
      .select()
      .from(hotelFolioEntries)
      .where(eq(hotelFolioEntries.folioId, folio.folioId));

    const balances = calculateFolioBalances(
      allEntries.map((e) => ({
        entryType: e.entryType as HotelFolioEntryType,
        amount: e.amount,
      }))
    );

    await tx
      .update(hotelFolios)
      .set({
        totalCharges: balances.totalCharges,
        totalPayments: balances.totalPayments,
        balanceDue: balances.balanceDue,
        updatedAt: new Date(),
      })
      .where(eq(hotelFolios.folioId, folio.folioId));

    // Audit
    await recordAuditEvent({
      tenantId,
      userId: postedByStaffId || "00000000-0000-0000-0000-000000000001",
      action: "hotel.folio.charge_posted",
      resourceType: "hotel_folio_entry",
      resourceId: entry.entryId,
      payload: {
        folioId: folio.folioId,
        folioNumber: folio.folioNumber,
        stayId,
        entryType: "ROOM_CHARGE",
        amount: chargeAmount.toFixed(4),
        description: chargeDesc,
      },
    });

    // Realtime emission
    try {
      const hub = getRealtimeHub();
      hub.broadcastToTenant(tenantId, "hotel.folio.charge_posted", {
        folioId: folio.folioId,
        stayId,
        entryType: "ROOM_CHARGE",
        amount: chargeAmount.toFixed(4),
        balanceDue: balances.balanceDue,
      });
    } catch {
      // Non-blocking
    }

    return await getFolioDetailByStayId(tenantId, outletId, stayId, postedByStaffId, tx);
  });
}

// ============================================================================
// 4. Post Room Service F&B Order to Folio (Idempotent Billable Order Posting)
// ============================================================================

export async function postRoomServiceOrderCharge(params: {
  tenantId: string;
  outletId: string;
  orderId: string;
  postedByStaffId?: string;
}): Promise<FolioEntryDto | null> {
  const { tenantId, outletId, orderId, postedByStaffId } = params;
  const db = getDb();

  return await db.transaction(async (tx) => {
    // 1. Lock Order row
    const [orderRecord] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.orderId, orderId),
          eq(orders.tenantId, tenantId),
          eq(orders.outletId, outletId)
        )
      )
      .for("update");

    if (!orderRecord) {
      throw new NotFoundError(`Order with ID '${orderId}' not found.`);
    }

    // 2. Validate billable operational status
    if (orderRecord.status !== "DELIVERED") {
      throw new BusinessRuleError(
        `Order '${orderRecord.orderNumber}' is currently in '${orderRecord.status}' status and cannot be posted to folio until it reaches 'DELIVERED' status.`
      );
    }

    // 3. Resolve stayId from metadata or active room stay
    const meta = ((orderRecord as any).metadata as Record<string, unknown>) || {};
    let stayId = meta.stayId as string | undefined;

    if (!stayId && orderRecord.contextId) {
      const [room] = await tx
        .select()
        .from(hotelRooms)
        .where(
          and(
            eq(hotelRooms.contextId, orderRecord.contextId),
            eq(hotelRooms.tenantId, tenantId)
          )
        )
        .limit(1);

      if (room) {
        const [activeStay] = await tx
          .select()
          .from(hotelStays)
          .where(
            and(
              eq(hotelStays.roomId, room.roomId),
              eq(hotelStays.tenantId, tenantId)
            )
          )
          .orderBy(desc(hotelStays.checkInAt))
          .limit(1);

        if (activeStay) {
          stayId = activeStay.stayId;
        }
      }
    }

    if (!stayId) {
      // Order has no attached stay; cannot post to hotel folio
      return null;
    }

    // 4. Check for existing posted charge (IDEMPOTENCY / ZERO DUPLICATION)
    const [existingEntry] = await tx
      .select()
      .from(hotelFolioEntries)
      .where(
        and(
          eq(hotelFolioEntries.referenceId, orderId),
          eq(hotelFolioEntries.entryType, "FOOD_CHARGE"),
          eq(hotelFolioEntries.tenantId, tenantId)
        )
      )
      .limit(1);

    if (existingEntry) {
      const numAmt = parseFloat(existingEntry.amount);
      return {
        entryId: existingEntry.entryId,
        folioId: existingEntry.folioId,
        entryType: "FOOD_CHARGE",
        direction: getEntryDirection("FOOD_CHARGE", numAmt),
        amount: existingEntry.amount,
        description: existingEntry.description,
        referenceId: existingEntry.referenceId,
        reversesEntryId: existingEntry.reversesEntryId,
        postedByStaffId: existingEntry.postedByStaffId,
        createdAt: existingEntry.createdAt,
      };
    }

    // 5. Get / Lock Folio Header
    let [folio] = await tx
      .select()
      .from(hotelFolios)
      .where(
        and(
          eq(hotelFolios.stayId, stayId),
          eq(hotelFolios.tenantId, tenantId)
        )
      )
      .for("update");

    if (!folio) {
      const folioNumber = generateFolioNumber();
      const [created] = await tx
        .insert(hotelFolios)
        .values({
          tenantId,
          outletId,
          stayId,
          folioNumber,
          status: "OPEN",
          totalCharges: "0.0000",
          totalPayments: "0.0000",
          balanceDue: "0.0000",
        })
        .returning();
      folio = created;
    }

    if (folio.status !== "OPEN") {
      throw new BusinessRuleError(
        `Cannot post order charge to closed folio '${folio.folioNumber}'. Reopen folio to post.`
      );
    }

    // 6. Use authoritative snapshotted totalAmount from order
    const orderTotal = parseFloat(orderRecord.totalAmount);
    const description = `Room Service F&B Order #${orderRecord.orderNumber}`;

    const sanitizedStaffId = await resolveStaffId(tx, tenantId, postedByStaffId);

    // 7. Insert immutable ledger entry
    const [entry] = await tx
      .insert(hotelFolioEntries)
      .values({
        tenantId,
        folioId: folio.folioId,
        entryType: "FOOD_CHARGE",
        amount: orderTotal.toFixed(4),
        description,
        referenceId: orderId,
        postedByStaffId: sanitizedStaffId,
      })
      .returning();

    // 8. Recalculate & Update Header
    const allEntries = await tx
      .select()
      .from(hotelFolioEntries)
      .where(eq(hotelFolioEntries.folioId, folio.folioId));

    const balances = calculateFolioBalances(
      allEntries.map((e) => ({
        entryType: e.entryType as HotelFolioEntryType,
        amount: e.amount,
      }))
    );

    await tx
      .update(hotelFolios)
      .set({
        totalCharges: balances.totalCharges,
        totalPayments: balances.totalPayments,
        balanceDue: balances.balanceDue,
        updatedAt: new Date(),
      })
      .where(eq(hotelFolios.folioId, folio.folioId));

    // Audit
    await recordAuditEvent({
      tenantId,
      userId: postedByStaffId || "00000000-0000-0000-0000-000000000001",
      action: "hotel.folio.charge_posted",
      resourceType: "hotel_folio_entry",
      resourceId: entry.entryId,
      payload: {
        folioId: folio.folioId,
        folioNumber: folio.folioNumber,
        stayId,
        orderId,
        orderNumber: orderRecord.orderNumber,
        entryType: "FOOD_CHARGE",
        amount: orderTotal.toFixed(4),
      },
    });

    // Realtime emission
    try {
      const hub = getRealtimeHub();
      hub.broadcastToTenant(tenantId, "hotel.folio.charge_posted", {
        folioId: folio.folioId,
        stayId,
        orderId,
        entryType: "FOOD_CHARGE",
        amount: orderTotal.toFixed(4),
        balanceDue: balances.balanceDue,
      });
    } catch {
      // Non-blocking
    }

    return {
      entryId: entry.entryId,
      folioId: entry.folioId,
      entryType: "FOOD_CHARGE",
      direction: "DEBIT",
      amount: entry.amount,
      description: entry.description,
      referenceId: entry.referenceId,
      reversesEntryId: entry.reversesEntryId,
      postedByStaffId: entry.postedByStaffId,
      createdAt: entry.createdAt,
    };
  });
}

// ============================================================================
// 5. Post Manual Charge (Service, Laundry, Spa, Miscellaneous)
// ============================================================================

export async function postManualCharge(params: {
  tenantId: string;
  outletId: string;
  stayId: string;
  input: PostManualChargeInput;
  postedByStaffId?: string;
}): Promise<FolioDetailDto> {
  const { tenantId, outletId, stayId, input, postedByStaffId } = params;
  const db = getDb();

  const numAmt = typeof input.amount === "number" ? input.amount : parseFloat(input.amount);
  if (isNaN(numAmt) || numAmt <= 0) {
    throw new ValidationError("Manual charge amount must be a positive number.");
  }
  if (!input.description || !input.description.trim()) {
    throw new ValidationError("Description is mandatory for manual charges.");
  }

  const entryType: HotelFolioEntryType = input.entryType || "SERVICE_CHARGE";

  return await db.transaction(async (tx) => {
    // 1. Lock Folio Header
    let [folio] = await tx
      .select()
      .from(hotelFolios)
      .where(
        and(
          eq(hotelFolios.stayId, stayId),
          eq(hotelFolios.tenantId, tenantId)
        )
      )
      .for("update");

    if (!folio) {
      const folioNumber = generateFolioNumber();
      const [created] = await tx
        .insert(hotelFolios)
        .values({
          tenantId,
          outletId,
          stayId,
          folioNumber,
          status: "OPEN",
          totalCharges: "0.0000",
          totalPayments: "0.0000",
          balanceDue: "0.0000",
        })
        .returning();
      folio = created;
    }

    if (folio.status !== "OPEN") {
      throw new BusinessRuleError(
        `Cannot post charges to closed folio '${folio.folioNumber}'. Reopen folio first.`
      );
    }

    const sanitizedStaffId = await resolveStaffId(tx, tenantId, postedByStaffId);

    // 2. Insert Entry
    const [entry] = await tx
      .insert(hotelFolioEntries)
      .values({
        tenantId,
        folioId: folio.folioId,
        entryType,
        amount: numAmt.toFixed(4),
        description: input.description.trim(),
        referenceId: null,
        postedByStaffId: sanitizedStaffId,
      })
      .returning();

    // 3. Recalculate
    const allEntries = await tx
      .select()
      .from(hotelFolioEntries)
      .where(eq(hotelFolioEntries.folioId, folio.folioId));

    const balances = calculateFolioBalances(
      allEntries.map((e) => ({
        entryType: e.entryType as HotelFolioEntryType,
        amount: e.amount,
      }))
    );

    await tx
      .update(hotelFolios)
      .set({
        totalCharges: balances.totalCharges,
        totalPayments: balances.totalPayments,
        balanceDue: balances.balanceDue,
        updatedAt: new Date(),
      })
      .where(eq(hotelFolios.folioId, folio.folioId));

    // Audit
    await recordAuditEvent({
      tenantId,
      userId: postedByStaffId || "00000000-0000-0000-0000-000000000001",
      action: "hotel.folio.charge_posted",
      resourceType: "hotel_folio_entry",
      resourceId: entry.entryId,
      payload: {
        folioId: folio.folioId,
        stayId,
        entryType,
        amount: numAmt.toFixed(4),
        description: input.description.trim(),
      },
    });

    return await getFolioDetailByStayId(tenantId, outletId, stayId, postedByStaffId, tx);
  });
}

// ============================================================================
// 6. Post Adjustment / Reversal (Compensating Ledger Entries)
// ============================================================================

export async function postAdjustment(params: {
  tenantId: string;
  outletId: string;
  stayId: string;
  input: PostAdjustmentInput;
  postedByStaffId?: string;
}): Promise<FolioDetailDto> {
  const { tenantId, outletId, stayId, input, postedByStaffId } = params;
  const db = getDb();

  if (!input.reason || !input.reason.trim()) {
    throw new ValidationError("A documented reason is mandatory when posting an adjustment.");
  }

  const numAmt = typeof input.amount === "number" ? input.amount : parseFloat(input.amount);
  if (isNaN(numAmt) || numAmt === 0) {
    throw new ValidationError("Adjustment amount cannot be zero.");
  }

  return await db.transaction(async (tx) => {
    // 1. Lock Folio
    const [folio] = await tx
      .select()
      .from(hotelFolios)
      .where(
        and(
          eq(hotelFolios.stayId, stayId),
          eq(hotelFolios.tenantId, tenantId)
        )
      )
      .for("update");

    if (!folio) {
      throw new NotFoundError(`Folio for stay '${stayId}' not found.`);
    }

    if (folio.status !== "OPEN") {
      throw new BusinessRuleError(
        `Cannot post adjustments to closed folio '${folio.folioNumber}'. Reopen folio first.`
      );
    }

    let targetEntry: typeof hotelFolioEntries.$inferSelect | undefined;
    if (input.reversesEntryId) {
      const [found] = await tx
        .select()
        .from(hotelFolioEntries)
        .where(
          and(
            eq(hotelFolioEntries.entryId, input.reversesEntryId),
            eq(hotelFolioEntries.folioId, folio.folioId),
            eq(hotelFolioEntries.tenantId, tenantId)
          )
        )
        .limit(1);

      if (!found) {
        throw new NotFoundError(`Target entry with ID '${input.reversesEntryId}' not found in this folio.`);
      }
      targetEntry = found;
    }

    const entryType: HotelFolioEntryType = input.reversesEntryId ? "REVERSAL" : "ADJUSTMENT";
    const description = targetEntry
      ? `Reversal of ${targetEntry.entryType}: ${input.reason.trim()}`
      : `Adjustment: ${input.reason.trim()}`;

    const sanitizedStaffId = await resolveStaffId(tx, tenantId, postedByStaffId);

    // 2. Insert compensating entry
    const [entry] = await tx
      .insert(hotelFolioEntries)
      .values({
        tenantId,
        folioId: folio.folioId,
        entryType,
        amount: numAmt.toFixed(4),
        description,
        reversesEntryId: input.reversesEntryId || null,
        postedByStaffId: sanitizedStaffId,
      })
      .returning();

    // 3. Recalculate
    const allEntries = await tx
      .select()
      .from(hotelFolioEntries)
      .where(eq(hotelFolioEntries.folioId, folio.folioId));

    const balances = calculateFolioBalances(
      allEntries.map((e) => ({
        entryType: e.entryType as HotelFolioEntryType,
        amount: e.amount,
      }))
    );

    await tx
      .update(hotelFolios)
      .set({
        totalCharges: balances.totalCharges,
        totalPayments: balances.totalPayments,
        balanceDue: balances.balanceDue,
        updatedAt: new Date(),
      })
      .where(eq(hotelFolios.folioId, folio.folioId));

    // Audit
    await recordAuditEvent({
      tenantId,
      userId: postedByStaffId || "00000000-0000-0000-0000-000000000001",
      action: "hotel.folio.adjustment_posted",
      resourceType: "hotel_folio_entry",
      resourceId: entry.entryId,
      payload: {
        folioId: folio.folioId,
        stayId,
        entryType,
        amount: numAmt.toFixed(4),
        reason: input.reason.trim(),
        reversesEntryId: input.reversesEntryId || null,
      },
    });

    return await getFolioDetailByStayId(tenantId, outletId, stayId, postedByStaffId, tx);
  });
}

// ============================================================================
// 7. Record Payment (Internal Financial Transaction)
// ============================================================================

export async function recordPayment(params: {
  tenantId: string;
  outletId: string;
  stayId: string;
  input: RecordPaymentInput;
  postedByStaffId?: string;
}): Promise<FolioDetailDto> {
  const { tenantId, outletId, stayId, input, postedByStaffId } = params;
  const db = getDb();

  const numAmt = typeof input.amount === "number" ? input.amount : parseFloat(input.amount);
  if (isNaN(numAmt) || numAmt <= 0) {
    throw new ValidationError("Payment amount must be a positive number.");
  }

  const result = await db.transaction(async (tx) => {
    // 1. Lock Folio
    const [folio] = await tx
      .select()
      .from(hotelFolios)
      .where(
        and(
          eq(hotelFolios.stayId, stayId),
          eq(hotelFolios.tenantId, tenantId)
        )
      )
      .for("update");

    if (!folio) {
      throw new NotFoundError(`Folio for stay '${stayId}' not found.`);
    }

    if (folio.status !== "OPEN") {
      throw new BusinessRuleError(
        `Cannot record payment on closed folio '${folio.folioNumber}'. Reopen folio first.`
      );
    }

    const description = `Payment (${input.paymentMethod})${
      input.referenceNumber ? ` - Ref: ${input.referenceNumber}` : ""
    }${input.notes ? ` - ${input.notes}` : ""}`;

    // Negative stored amount represents credit reduction in balance due
    const negativeAmt = -Math.abs(numAmt);

    const sanitizedStaffId = await resolveStaffId(tx, tenantId, postedByStaffId);

    // 2. Insert Payment Ledger Entry
    const [entry] = await tx
      .insert(hotelFolioEntries)
      .values({
        tenantId,
        folioId: folio.folioId,
        entryType: "PAYMENT",
        amount: negativeAmt.toFixed(4),
        description,
        postedByStaffId: sanitizedStaffId,
      })
      .returning();

    // 3. Recalculate balances
    const allEntries = await tx
      .select()
      .from(hotelFolioEntries)
      .where(eq(hotelFolioEntries.folioId, folio.folioId));

    const balances = calculateFolioBalances(
      allEntries.map((e) => ({
        entryType: e.entryType as HotelFolioEntryType,
        amount: e.amount,
      }))
    );

    const isSettled = parseFloat(balances.balanceDue) <= 0;

    await tx
      .update(hotelFolios)
      .set({
        totalCharges: balances.totalCharges,
        totalPayments: balances.totalPayments,
        balanceDue: balances.balanceDue,
        settledAt: isSettled ? new Date() : folio.settledAt,
        updatedAt: new Date(),
      })
      .where(eq(hotelFolios.folioId, folio.folioId));

    // Audit
    await recordAuditEvent({
      tenantId,
      userId: postedByStaffId || "00000000-0000-0000-0000-000000000001",
      action: "hotel.folio.payment_recorded",
      resourceType: "hotel_folio_entry",
      resourceId: entry.entryId,
      payload: {
        folioId: folio.folioId,
        stayId,
        paymentMethod: input.paymentMethod,
        amount: numAmt.toFixed(4),
        referenceNumber: input.referenceNumber || null,
        newBalanceDue: balances.balanceDue,
      },
    });

    // Record Trusted Domain Event into Outbox
    const receiptUrl = generateSecureReceiptUrl({
      tenantId,
      vertical: "HOTEL",
      referenceType: "FOLIO",
      referenceId: folio.folioId,
      amount: numAmt.toFixed(4),
    });

    const paymentEvent = createDomainEvent<BillPaymentSuccessPayload>({
      tenantId,
      outletId,
      vertical: "HOTEL",
      eventType: "BILL_PAYMENT_SUCCESS",
      aggregateType: "HOTEL_FOLIO",
      aggregateId: folio.folioId,
      payload: {
        vertical: "HOTEL",
        folioId: folio.folioId,
        stayId,
        amount: numAmt.toFixed(4),
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber || null,
        newBalanceDue: balances.balanceDue,
        receiptUrl,
      },
      idempotencyKey: `FOLIO_PAYMENT:${entry.entryId}`,
    });

    await recordOutboxEvent(tx, paymentEvent);

    // Realtime emission
    try {
      const hub = getRealtimeHub();
      hub.broadcastToTenant(tenantId, "hotel.folio.payment_recorded", {
        folioId: folio.folioId,
        stayId,
        amount: numAmt.toFixed(4),
        balanceDue: balances.balanceDue,
      });
    } catch {
      // Non-blocking
    }

    return await getFolioDetailByStayId(tenantId, outletId, stayId, postedByStaffId, tx);
  });

  // Trigger Outbox Processing post-commit
  processOutboxBatch({ tenantId, batchSize: 5 }).catch(() => {});

  return result;
}

// ============================================================================
// 8. Record Refund (Compensating Payment Reversal)
// ============================================================================

export async function recordRefund(params: {
  tenantId: string;
  outletId: string;
  stayId: string;
  input: RecordRefundInput;
  postedByStaffId?: string;
}): Promise<FolioDetailDto> {
  const { tenantId, outletId, stayId, input, postedByStaffId } = params;
  const db = getDb();

  const numAmt = typeof input.amount === "number" ? input.amount : parseFloat(input.amount);
  if (isNaN(numAmt) || numAmt <= 0) {
    throw new ValidationError("Refund amount must be a positive number.");
  }
  if (!input.reason || !input.reason.trim()) {
    throw new ValidationError("A documented reason is mandatory when issuing a refund.");
  }

  return await db.transaction(async (tx) => {
    // 1. Lock Folio
    const [folio] = await tx
      .select()
      .from(hotelFolios)
      .where(
        and(
          eq(hotelFolios.stayId, stayId),
          eq(hotelFolios.tenantId, tenantId)
        )
      )
      .for("update");

    if (!folio) {
      throw new NotFoundError(`Folio for stay '${stayId}' not found.`);
    }

    if (folio.status !== "OPEN") {
      throw new BusinessRuleError(
        `Cannot issue refund on closed folio '${folio.folioNumber}'. Reopen folio first.`
      );
    }

    // 2. Validate original payment entry
    const [origPayment] = await tx
      .select()
      .from(hotelFolioEntries)
      .where(
        and(
          eq(hotelFolioEntries.entryId, input.originalPaymentEntryId),
          eq(hotelFolioEntries.folioId, folio.folioId),
          eq(hotelFolioEntries.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!origPayment || origPayment.entryType !== "PAYMENT") {
      throw new NotFoundError(
        `Original payment record with ID '${input.originalPaymentEntryId}' was not found on this folio.`
      );
    }

    const origPaymentAmount = Math.abs(parseFloat(origPayment.amount));
    if (numAmt > origPaymentAmount) {
      throw new ValidationError(
        `Refund amount (${numAmt}) cannot exceed the original payment amount (${origPaymentAmount}).`
      );
    }

    const description = `Refund: ${input.reason.trim()} (Ref original payment: ${origPayment.description})`;

    const sanitizedStaffId = await resolveStaffId(tx, tenantId, postedByStaffId);

    // Positive stored amount represents returning funds (increasing net balance due)
    const [entry] = await tx
      .insert(hotelFolioEntries)
      .values({
        tenantId,
        folioId: folio.folioId,
        entryType: "REFUND",
        amount: Math.abs(numAmt).toFixed(4),
        description,
        reversesEntryId: origPayment.entryId,
        postedByStaffId: sanitizedStaffId,
      })
      .returning();

    // 3. Recalculate
    const allEntries = await tx
      .select()
      .from(hotelFolioEntries)
      .where(eq(hotelFolioEntries.folioId, folio.folioId));

    const balances = calculateFolioBalances(
      allEntries.map((e) => ({
        entryType: e.entryType as HotelFolioEntryType,
        amount: e.amount,
      }))
    );

    await tx
      .update(hotelFolios)
      .set({
        totalCharges: balances.totalCharges,
        totalPayments: balances.totalPayments,
        balanceDue: balances.balanceDue,
        updatedAt: new Date(),
      })
      .where(eq(hotelFolios.folioId, folio.folioId));

    // Audit
    await recordAuditEvent({
      tenantId,
      userId: postedByStaffId || "00000000-0000-0000-0000-000000000001",
      action: "hotel.folio.refund_recorded",
      resourceType: "hotel_folio_entry",
      resourceId: entry.entryId,
      payload: {
        folioId: folio.folioId,
        stayId,
        amount: numAmt.toFixed(4),
        reason: input.reason.trim(),
        originalPaymentEntryId: origPayment.entryId,
        newBalanceDue: balances.balanceDue,
      },
    });

    return await getFolioDetailByStayId(tenantId, outletId, stayId, postedByStaffId, tx);
  });
}

// ============================================================================
// 9. Close Folio (Settlement & Front Office Closing Process)
// ============================================================================

export async function closeFolio(params: {
  tenantId: string;
  outletId: string;
  stayId: string;
  staffUserId: string;
  input?: CloseFolioInput;
}): Promise<FolioDetailDto> {
  const { tenantId, outletId, stayId, staffUserId, input } = params;
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const [folio] = await tx
      .select()
      .from(hotelFolios)
      .where(
        and(
          eq(hotelFolios.stayId, stayId),
          eq(hotelFolios.tenantId, tenantId)
        )
      )
      .for("update");

    if (!folio) {
      throw new NotFoundError(`Folio for stay '${stayId}' not found.`);
    }

    validateFolioStatusTransition(folio.status as HotelFolioStatus, "CLOSED");

    const now = new Date();
    await tx
      .update(hotelFolios)
      .set({
        status: "CLOSED",
        settledAt: folio.settledAt || now,
        updatedAt: now,
      })
      .where(eq(hotelFolios.folioId, folio.folioId));

    // Audit
    await recordAuditEvent({
      tenantId,
      userId: staffUserId,
      action: "hotel.folio.closed",
      resourceType: "hotel_folio",
      resourceId: folio.folioId,
      payload: {
        folioNumber: folio.folioNumber,
        stayId,
        balanceDue: folio.balanceDue,
        notes: input?.notes || null,
      },
    });

    // Record Trusted Domain Event into Outbox
    const receiptUrl = generateSecureReceiptUrl({
      tenantId,
      vertical: "HOTEL",
      referenceType: "FOLIO",
      referenceId: folio.folioId,
      amount: folio.totalCharges,
    });

    const billGenEvent = createDomainEvent<BillGeneratedPayload>({
      tenantId,
      outletId,
      vertical: "HOTEL",
      eventType: "BILL_GENERATED",
      aggregateType: "HOTEL_FOLIO",
      aggregateId: folio.folioId,
      payload: {
        vertical: "HOTEL",
        folioId: folio.folioId,
        stayId,
        totalCharges: folio.totalCharges,
        totalPayments: folio.totalPayments,
        balanceDue: folio.balanceDue,
        receiptUrl,
      },
      idempotencyKey: `FOLIO_CLOSE:${folio.folioId}`,
    });

    await recordOutboxEvent(tx, billGenEvent);

    // Realtime emission
    try {
      const hub = getRealtimeHub();
      hub.broadcastToTenant(tenantId, "hotel.folio.closed", {
        folioId: folio.folioId,
        stayId,
        status: "CLOSED",
      });
    } catch {
      // Non-blocking
    }

    return await getFolioDetailByStayId(tenantId, outletId, stayId, staffUserId, tx);
  });

  // Trigger Outbox Processing post-commit
  processOutboxBatch({ tenantId, batchSize: 5 }).catch(() => {});

  return result;
}

// ============================================================================
// 10. Reopen Folio (Authorized Exception Process)
// ============================================================================

export async function reopenFolio(params: {
  tenantId: string;
  outletId: string;
  stayId: string;
  staffUserId: string;
  input: ReopenFolioInput;
}): Promise<FolioDetailDto> {
  const { tenantId, outletId, stayId, staffUserId, input } = params;
  const db = getDb();

  if (!input.reason || !input.reason.trim()) {
    throw new ValidationError("A documented reason is mandatory when reopening a closed folio.");
  }

  return await db.transaction(async (tx) => {
    const [folio] = await tx
      .select()
      .from(hotelFolios)
      .where(
        and(
          eq(hotelFolios.stayId, stayId),
          eq(hotelFolios.tenantId, tenantId)
        )
      )
      .for("update");

    if (!folio) {
      throw new NotFoundError(`Folio for stay '${stayId}' not found.`);
    }

    validateFolioStatusTransition(folio.status as HotelFolioStatus, "OPEN");

    const now = new Date();
    await tx
      .update(hotelFolios)
      .set({
        status: "OPEN",
        updatedAt: now,
      })
      .where(eq(hotelFolios.folioId, folio.folioId));

    // Audit
    await recordAuditEvent({
      tenantId,
      userId: staffUserId,
      action: "hotel.folio.reopened",
      resourceType: "hotel_folio",
      resourceId: folio.folioId,
      payload: {
        folioNumber: folio.folioNumber,
        stayId,
        reason: input.reason.trim(),
        notes: input.notes || null,
      },
    });

    // Realtime emission
    try {
      const hub = getRealtimeHub();
      hub.broadcastToTenant(tenantId, "hotel.folio.reopened", {
        folioId: folio.folioId,
        stayId,
        status: "OPEN",
      });
    } catch {
      // Non-blocking
    }

    return await getFolioDetailByStayId(tenantId, outletId, stayId, staffUserId, tx);
  });
}
