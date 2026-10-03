import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  bills,
  paymentTransactions,
  orders,
  orderItems,
  type Bill,
  type PaymentTransaction,
} from "@/db/schema/operations";
import {
  restaurantTables,
  restaurantTableSessions,
  restaurantBillSplits,
  restaurantBillSplitPortions,
  restaurantBillSplitItems,
  restaurantTipDistributions,
  type RestaurantBillSplit,
  type RestaurantBillSplitPortion,
  type RestaurantBillSplitItem,
  type RestaurantTipDistribution,
  type RestaurantSplitType,
  type RestaurantPortionStatus,
} from "@/db/schema/restaurant";
import { assertModuleEntitlement } from "@/lib/entitlements/checker";
import { staffProfiles } from "@/db/schema/core";
import {
  ValidationError,
  NotFoundError,
  BusinessRuleError,
} from "@/lib/api/errors";
import { Decimal, type DecimalLike } from "@/lib/decimal";
import { createDomainEvent, recordOutboxEvent } from "@/lib/events/outbox";
import { recordAuditEvent } from "@/lib/audit";
import { realtimeHub } from "@/lib/realtime/sse";
import type { JwtPayload } from "@/lib/auth/jwt";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function safeUuid(val?: string | null): string | null {
  if (!val) return null;
  return UUID_REGEX.test(val) ? val : null;
}

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface GenerateBillInput {
  tableSessionId?: string;
  orderIds?: string[];
  notes?: string;
}

export interface SplitEqualInput {
  splitType: "EQUAL";
  portionsCount: number;
  names?: string[];
  notes?: string;
}

export interface ItemAllocationItem {
  orderItemId: string;
  quantity: number;
}

export interface ItemAllocationPortion {
  name: string;
  items: ItemAllocationItem[];
}

export interface SplitItemInput {
  splitType: "ITEM";
  portions: ItemAllocationPortion[];
  notes?: string;
}

export interface CustomPortionInput {
  name: string;
  totalAmount: DecimalLike;
}

export interface SplitCustomInput {
  splitType: "CUSTOM";
  portions: CustomPortionInput[];
  notes?: string;
}

export type CreateBillSplitInput = SplitEqualInput | SplitItemInput | SplitCustomInput;

export interface RecordPaymentInput {
  portionId?: string;
  amount: DecimalLike;
  paymentMethod: "CASH" | "UPI" | "CARD" | "NETBANKING" | "GATEWAY" | "HOUSE_ACCOUNT";
  gatewayTransactionReference?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface TipDistributionItemInput {
  staffId?: string;
  recipientName: string;
  amount: DecimalLike;
  percentage?: DecimalLike;
  notes?: string;
}

export interface AllocateTipInput {
  tipAmount: DecimalLike;
  distributions?: TipDistributionItemInput[];
}

export interface DetailedBillPortionDto {
  portionId: string;
  portionNumber: number;
  name: string;
  allocatedAmount: string;
  taxAmount: string;
  platformFeeAmount: string;
  discountAmount: string;
  tipAmount: string;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  status: RestaurantPortionStatus;
  items?: Array<{
    splitItemId: string;
    orderItemId: string;
    itemName: string;
    unitPrice: string;
    allocatedQuantity: number;
    allocatedAmount: string;
  }>;
}

export interface DetailedBillResponseDto {
  billId: string;
  billNumber: string;
  tenantId: string;
  outletId: string;
  contextId?: string | null;
  tableSessionId?: string | null;
  orderId?: string | null;
  status: string;
  subtotalAmount: string;
  taxAmount: string;
  platformFeeAmount: string;
  discountAmount: string;
  tipAmount: string;
  totalAmount: string;
  settledAmount: string;
  remainingAmount: string;
  isFullySettled: boolean;
  notes?: string | null;
  settledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  activeSplit?: {
    splitId: string;
    splitType: RestaurantSplitType;
    totalPortions: number;
    status: string;
    portions: DetailedBillPortionDto[];
  } | null;
  payments: Array<{
    paymentId: string;
    portionId?: string | null;
    paymentMethod: string;
    amount: string;
    status: string;
    processedAt?: string | null;
    createdAt: string;
  }>;
  tipDistributions: Array<{
    tipDistributionId: string;
    staffId?: string | null;
    recipientName: string;
    amount: string;
    percentage?: string | null;
    notes?: string | null;
  }>;
  billItems?: Array<{
    orderItemId: string;
    itemName: string;
    unitPrice: string;
    quantity: number;
  }>;
}

// ============================================================================
// Helper: Unique Bill Number Generator
// ============================================================================

function generateBillNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `BILL-${dateStr}-${rand}`;
}

// ============================================================================
// Service: Generate Restaurant Bill
// ============================================================================

export async function generateRestaurantBill(
  tenantId: string,
  outletId: string,
  input: GenerateBillInput,
  user?: JwtPayload
): Promise<DetailedBillResponseDto> {
  assertModuleEntitlement(tenantId, "RESTAURANT", user?.isSuperAdmin || false);
  const db = getDb();

  return await db.transaction(async (tx) => {
    // 1. Gather associated orders
    let targetOrders: typeof orders.$inferSelect[] = [];

    if (input.tableSessionId) {
      // Verify table session exists and belongs to tenant
      const [session] = await tx
        .select()
        .from(restaurantTableSessions)
        .where(
          and(
            eq(restaurantTableSessions.tenantId, tenantId),
            eq(restaurantTableSessions.outletId, outletId),
            eq(restaurantTableSessions.sessionId, input.tableSessionId)
          )
        )
        .limit(1);

      if (!session) {
        throw new NotFoundError("Restaurant table session not found.");
      }

      // Check for existing uncancelled bill for this active session
      const [existingBill] = await tx
        .select()
        .from(bills)
        .where(
          and(
            eq(bills.tenantId, tenantId),
            eq(bills.outletId, outletId),
            eq(bills.tableSessionId, input.tableSessionId)
          )
        )
        .orderBy(desc(bills.createdAt))
        .limit(1);

      if (existingBill && existingBill.status !== "VOIDED") {
        return await getBillDetailsTx(tx, tenantId, existingBill.billId);
      }

      // Fetch all non-cancelled orders for this session
      targetOrders = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, tenantId),
            eq(orders.tableSessionId, input.tableSessionId)
          )
        );
    } else if (input.orderIds && input.orderIds.length > 0) {
      targetOrders = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, tenantId),
            eq(orders.outletId, outletId),
            inArray(orders.orderId, input.orderIds)
          )
        );
    } else {
      throw new ValidationError("Must specify either tableSessionId or orderIds to generate a bill.");
    }

    const activeOrders = targetOrders.filter((o) => o.status !== "CANCELLED");
    if (activeOrders.length === 0) {
      throw new BusinessRuleError("No active non-cancelled orders found to generate a bill.");
    }

    // 2. Exact Decimal aggregation of totals from authoritative orders
    let subtotal = Decimal.zero();
    let tax = Decimal.zero();
    let platformFee = Decimal.zero();
    let discount = Decimal.zero();

    for (const o of activeOrders) {
      subtotal = subtotal.plus(Decimal.from(o.subtotalAmount));
      tax = tax.plus(Decimal.from(o.taxAmount));
      platformFee = platformFee.plus(Decimal.from(o.platformFeeAmount || "0"));
      discount = discount.plus(Decimal.from(o.discountAmount || "0"));
    }

    const total = subtotal.plus(tax).plus(platformFee).minus(discount);

    // 3. Create authoritative bill record
    const billNumber = generateBillNumber();
    const [newBill] = await tx
      .insert(bills)
      .values({
        tenantId,
        outletId,
        contextId: activeOrders[0].contextId,
        tableSessionId: input.tableSessionId || activeOrders[0].tableSessionId,
        orderId: activeOrders.length === 1 ? activeOrders[0].orderId : null,
        billNumber,
        status: "OPEN",
        subtotalAmount: subtotal.toFixed(4),
        taxAmount: tax.toFixed(4),
        platformFeeAmount: platformFee.toFixed(4),
        discountAmount: discount.toFixed(4),
        tipAmount: "0.0000",
        totalAmount: total.toFixed(4),
        settledAmount: "0.0000",
        notes: input.notes,
      })
      .returning();

    // 4. Record domain event in transactional outbox
    const billEvent = createDomainEvent({
      eventType: "RESTAURANT_BILL_GENERATED",
      tenantId,
      outletId,
      vertical: "RESTAURANT",
      aggregateType: "BILL",
      aggregateId: newBill.billId,
      payload: {
        billId: newBill.billId,
        billNumber: newBill.billNumber,
        tenantId,
        outletId,
        tableSessionId: newBill.tableSessionId,
        totalAmount: total.toFixed(2),
        subtotalAmount: subtotal.toFixed(2),
        taxAmount: tax.toFixed(2),
        platformFeeAmount: platformFee.toFixed(2),
        discountAmount: discount.toFixed(2),
      },
    });
    await recordOutboxEvent(tx, billEvent);

    // 5. Audit event
    await recordAuditEvent({
      tenantId,
      userId: user?.sub,
      action: "BILL_GENERATED",
      resourceType: "BILL",
      resourceId: newBill.billId,
      payload: {
        billNumber,
        totalAmount: total.toFixed(2),
        tableSessionId: newBill.tableSessionId,
      },
    });

    return await getBillDetailsTx(tx, tenantId, newBill.billId);
  });
}

// ============================================================================
// Service: Get Bill Details & Live Reconciliation
// ============================================================================

export async function getBillDetails(
  tenantId: string,
  billId: string
): Promise<DetailedBillResponseDto> {
  const db = getDb();
  return await getBillDetailsTx(db, tenantId, billId);
}

async function getBillDetailsTx(
  dbOrTx: any,
  tenantId: string,
  billId: string
): Promise<DetailedBillResponseDto> {
  const [bill] = await dbOrTx
    .select()
    .from(bills)
    .where(and(eq(bills.tenantId, tenantId), eq(bills.billId, billId)))
    .limit(1);

  if (!bill) {
    throw new NotFoundError("Restaurant bill not found.");
  }

  // Active split & portions
  const [activeSplit] = await dbOrTx
    .select()
    .from(restaurantBillSplits)
    .where(
      and(
        eq(restaurantBillSplits.tenantId, tenantId),
        eq(restaurantBillSplits.billId, billId),
        eq(restaurantBillSplits.status, "ACTIVE")
      )
    )
    .limit(1);

  let activeSplitDto = null;
  if (activeSplit) {
    const portions = await dbOrTx
      .select()
      .from(restaurantBillSplitPortions)
      .where(
        and(
          eq(restaurantBillSplitPortions.tenantId, tenantId),
          eq(restaurantBillSplitPortions.splitId, activeSplit.splitId)
        )
      )
      .orderBy(restaurantBillSplitPortions.portionNumber);

    // Fetch split items if item-based split
    let splitItems: Array<typeof restaurantBillSplitItems.$inferSelect & { itemName?: string; unitPrice?: string }> = [];
    if (activeSplit.splitType === "ITEM") {
      const portionIds = portions.map((p: any) => p.portionId);
      if (portionIds.length > 0) {
        splitItems = await dbOrTx
          .select({
            splitItemId: restaurantBillSplitItems.splitItemId,
            portionId: restaurantBillSplitItems.portionId,
            orderItemId: restaurantBillSplitItems.orderItemId,
            allocatedQuantity: restaurantBillSplitItems.allocatedQuantity,
            allocatedAmount: restaurantBillSplitItems.allocatedAmount,
            itemName: orderItems.itemName,
            unitPrice: orderItems.unitPrice,
          })
          .from(restaurantBillSplitItems)
          .innerJoin(orderItems, eq(restaurantBillSplitItems.orderItemId, orderItems.orderItemId))
          .where(
            and(
              eq(restaurantBillSplitItems.tenantId, tenantId),
              inArray(restaurantBillSplitItems.portionId, portionIds)
            )
          );
      }
    }

    const portionsDto: DetailedBillPortionDto[] = portions.map((p: any) => {
      const total = Decimal.from(p.totalAmount);
      const paid = Decimal.from(p.paidAmount);
      const rem = total.minus(paid);

      const itemsForPortion = splitItems
        .filter((it: any) => it.portionId === p.portionId)
        .map((it: any) => ({
          splitItemId: it.splitItemId,
          orderItemId: it.orderItemId,
          itemName: it.itemName || "",
          unitPrice: Decimal.from(it.unitPrice || "0").toFixed(2),
          allocatedQuantity: it.allocatedQuantity,
          allocatedAmount: Decimal.from(it.allocatedAmount).toFixed(2),
        }));

      return {
        portionId: p.portionId,
        portionNumber: p.portionNumber,
        name: p.name,
        allocatedAmount: Decimal.from(p.allocatedAmount).toFixed(2),
        taxAmount: Decimal.from(p.taxAmount).toFixed(2),
        platformFeeAmount: Decimal.from(p.platformFeeAmount).toFixed(2),
        discountAmount: Decimal.from(p.discountAmount).toFixed(2),
        tipAmount: Decimal.from(p.tipAmount).toFixed(2),
        totalAmount: total.toFixed(2),
        paidAmount: paid.toFixed(2),
        remainingAmount: rem.isNegative() ? "0.00" : rem.toFixed(2),
        status: p.status as RestaurantPortionStatus,
        items: itemsForPortion.length > 0 ? itemsForPortion : undefined,
      };
    });

    activeSplitDto = {
      splitId: activeSplit.splitId,
      splitType: activeSplit.splitType as RestaurantSplitType,
      totalPortions: activeSplit.totalPortions,
      status: activeSplit.status,
      portions: portionsDto,
    };
  }

  // Payment transactions
  const payments = await dbOrTx
    .select()
    .from(paymentTransactions)
    .where(
      and(
        eq(paymentTransactions.tenantId, tenantId),
        eq(paymentTransactions.billId, billId)
      )
    )
    .orderBy(desc(paymentTransactions.createdAt));

  // Tip distributions
  const tipDist = await dbOrTx
    .select()
    .from(restaurantTipDistributions)
    .where(
      and(
        eq(restaurantTipDistributions.tenantId, tenantId),
        eq(restaurantTipDistributions.billId, billId)
      )
    )
    .orderBy(desc(restaurantTipDistributions.createdAt));

  // Bill order items (available for item-based splitting)
  let billItems: Array<{ orderItemId: string; itemName: string; unitPrice: string; quantity: number }> = [];
  let orderIdsForItems: string[] = [];
  if (bill.tableSessionId) {
    const sessionOrders = await dbOrTx
      .select({ orderId: orders.orderId })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.tableSessionId, bill.tableSessionId), sql`${orders.status} != 'CANCELLED'`));
    orderIdsForItems = sessionOrders.map((o: any) => o.orderId);
  } else if (bill.orderId) {
    orderIdsForItems = [bill.orderId];
  }
  if (orderIdsForItems.length > 0) {
    const rawItems = await dbOrTx
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.tenantId, tenantId), inArray(orderItems.orderId, orderIdsForItems), sql`${orderItems.itemStatus} != 'CANCELLED'`));
    billItems = rawItems.map((it: any) => ({
      orderItemId: it.orderItemId,
      itemName: it.itemName,
      unitPrice: Decimal.from(it.unitPrice || "0").toFixed(2),
      quantity: it.quantity,
    }));
  }

  const totalDec = Decimal.from(bill.totalAmount);
  const settledDec = Decimal.from(bill.settledAmount);
  const remainingDec = totalDec.minus(settledDec);
  const isFullySettled = settledDec.greaterThanOrEqualTo(totalDec) && totalDec.isPositive();

  return {
    billId: bill.billId,
    billNumber: bill.billNumber,
    tenantId: bill.tenantId,
    outletId: bill.outletId,
    contextId: bill.contextId,
    tableSessionId: bill.tableSessionId,
    orderId: bill.orderId,
    status: bill.status,
    subtotalAmount: Decimal.from(bill.subtotalAmount).toFixed(2),
    taxAmount: Decimal.from(bill.taxAmount).toFixed(2),
    platformFeeAmount: Decimal.from(bill.platformFeeAmount || "0").toFixed(2),
    discountAmount: Decimal.from(bill.discountAmount || "0").toFixed(2),
    tipAmount: Decimal.from(bill.tipAmount || "0").toFixed(2),
    totalAmount: totalDec.toFixed(2),
    settledAmount: settledDec.toFixed(2),
    remainingAmount: remainingDec.isNegative() ? "0.00" : remainingDec.toFixed(2),
    isFullySettled,
    notes: bill.notes,
    settledAt: bill.settledAt?.toISOString() || null,
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
    activeSplit: activeSplitDto,
    payments: payments.map((p: any) => ({
      paymentId: p.paymentId,
      portionId: p.portionId,
      paymentMethod: p.paymentMethod,
      amount: Decimal.from(p.amount).toFixed(2),
      status: p.status,
      processedAt: p.processedAt?.toISOString() || null,
      createdAt: p.createdAt.toISOString(),
    })),
    tipDistributions: tipDist.map((t: any) => ({
      tipDistributionId: t.tipDistributionId,
      staffId: t.staffId,
      recipientName: t.recipientName,
      amount: Decimal.from(t.amount).toFixed(2),
      percentage: t.percentage ? Decimal.from(t.percentage).toFixed(4) : null,
      notes: t.notes,
    })),
    billItems,
  };
}

// ============================================================================
// Service: List Bills
// ============================================================================

export async function listBills(
  tenantId: string,
  options?: {
    outletId?: string;
    status?: string;
    tableSessionId?: string;
    limit?: number;
    offset?: number;
  }
) {
  const db = getDb();
  const limit = Math.min(options?.limit || 50, 100);
  const offset = options?.offset || 0;

  const conditions = [eq(bills.tenantId, tenantId)];
  if (options?.outletId) conditions.push(eq(bills.outletId, options.outletId));
  if (options?.status) conditions.push(eq(bills.status, options.status));
  if (options?.tableSessionId) conditions.push(eq(bills.tableSessionId, options.tableSessionId));

  const rows = await db
    .select()
    .from(bills)
    .where(and(...conditions))
    .orderBy(desc(bills.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((b) => {
    const total = Decimal.from(b.totalAmount);
    const settled = Decimal.from(b.settledAmount);
    const remaining = total.minus(settled);
    return {
      billId: b.billId,
      billNumber: b.billNumber,
      tenantId: b.tenantId,
      outletId: b.outletId,
      tableSessionId: b.tableSessionId,
      status: b.status,
      totalAmount: total.toFixed(2),
      settledAmount: settled.toFixed(2),
      remainingAmount: remaining.isNegative() ? "0.00" : remaining.toFixed(2),
      isFullySettled: settled.greaterThanOrEqualTo(total) && total.isPositive(),
      createdAt: b.createdAt.toISOString(),
    };
  });
}

// ============================================================================
// Service: Create Bill Split (Equal, Item-Based, Custom)
// ============================================================================

export async function createBillSplit(
  tenantId: string,
  billId: string,
  input: CreateBillSplitInput,
  user?: JwtPayload
): Promise<DetailedBillResponseDto> {
  assertModuleEntitlement(tenantId, "RESTAURANT", user?.isSuperAdmin || false);
  const db = getDb();

  return await db.transaction(async (tx) => {
    // 1. Pessimistic lock on bill row
    const [bill] = await tx
      .select()
      .from(bills)
      .where(and(eq(bills.tenantId, tenantId), eq(bills.billId, billId)))
      .for("update")
      .limit(1);

    if (!bill) {
      throw new NotFoundError("Restaurant bill not found.");
    }

    if (bill.status === "PAID") {
      throw new BusinessRuleError("Cannot split an already fully paid bill.");
    }
    if (bill.status === "VOIDED") {
      throw new BusinessRuleError("Cannot split a voided bill.");
    }

    // 2. Check existing active splits: Cannot re-split if any portion has received payment
    const existingSplits = await tx
      .select()
      .from(restaurantBillSplits)
      .where(
        and(
          eq(restaurantBillSplits.tenantId, tenantId),
          eq(restaurantBillSplits.billId, billId),
          eq(restaurantBillSplits.status, "ACTIVE")
        )
      );

    if (existingSplits.length > 0) {
      for (const exSplit of existingSplits) {
        const [paidPortion] = await tx
          .select()
          .from(restaurantBillSplitPortions)
          .where(
            and(
              eq(restaurantBillSplitPortions.tenantId, tenantId),
              eq(restaurantBillSplitPortions.splitId, exSplit.splitId),
              sql`${restaurantBillSplitPortions.paidAmount} > 0`
            )
          )
          .limit(1);

        if (paidPortion) {
          throw new BusinessRuleError("Cannot re-split a bill with settled or partially paid portions.");
        }

        // Deactivate existing un-paid split
        await tx
          .update(restaurantBillSplits)
          .set({ status: "CANCELLED", updatedAt: new Date() })
          .where(eq(restaurantBillSplits.splitId, exSplit.splitId));
      }
    }

    // Authoritative Bill Figures
    const billSubtotal = Decimal.from(bill.subtotalAmount);
    const billTax = Decimal.from(bill.taxAmount);
    const billPlatformFee = Decimal.from(bill.platformFeeAmount || "0");
    const billDiscount = Decimal.from(bill.discountAmount || "0");
    const billTip = Decimal.from(bill.tipAmount || "0");
    const billTotal = Decimal.from(bill.totalAmount);

    let createdPortions: Array<{
      portionNumber: number;
      name: string;
      allocatedAmount: Decimal; // subtotal
      taxAmount: Decimal;
      platformFeeAmount: Decimal;
      discountAmount: Decimal;
      tipAmount: Decimal;
      totalAmount: Decimal;
      items?: ItemAllocationItem[];
    }> = [];

    // ------------------------------------------------------------------------
    // Case A: EQUAL SPLIT
    // ------------------------------------------------------------------------
    if (input.splitType === "EQUAL") {
      const N = input.portionsCount;
      if (!Number.isInteger(N) || N < 2) {
        throw new ValidationError("Equal split requires portionsCount to be an integer of at least 2.");
      }

      const NDec = Decimal.from(N);
      let runningSubtotal = Decimal.zero();
      let runningTax = Decimal.zero();
      let runningFee = Decimal.zero();
      let runningDiscount = Decimal.zero();
      let runningTip = Decimal.zero();
      let runningTotal = Decimal.zero();

      for (let i = 1; i <= N; i++) {
        const isLast = i === N;
        const name = input.names?.[i - 1] || `Portion ${i}`;

        let pSub: Decimal;
        let pTax: Decimal;
        let pFee: Decimal;
        let pDisc: Decimal;
        let pTip: Decimal;
        let pTot: Decimal;

        if (!isLast) {
          pSub = billSubtotal.dividedBy(NDec, 2, "HALF_UP");
          pTax = billTax.dividedBy(NDec, 2, "HALF_UP");
          pFee = billPlatformFee.dividedBy(NDec, 2, "HALF_UP");
          pDisc = billDiscount.dividedBy(NDec, 2, "HALF_UP");
          pTip = billTip.dividedBy(NDec, 2, "HALF_UP");
          pTot = pSub.plus(pTax).plus(pFee).plus(pTip).minus(pDisc);

          runningSubtotal = runningSubtotal.plus(pSub);
          runningTax = runningTax.plus(pTax);
          runningFee = runningFee.plus(pFee);
          runningDiscount = runningDiscount.plus(pDisc);
          runningTip = runningTip.plus(pTip);
          runningTotal = runningTotal.plus(pTot);
        } else {
          // Last-Portion Remainder Absorption: exact difference
          pSub = billSubtotal.minus(runningSubtotal);
          pTax = billTax.minus(runningTax);
          pFee = billPlatformFee.minus(runningFee);
          pDisc = billDiscount.minus(runningDiscount);
          pTip = billTip.minus(runningTip);
          pTot = billTotal.minus(runningTotal);
        }

        createdPortions.push({
          portionNumber: i,
          name,
          allocatedAmount: pSub,
          taxAmount: pTax,
          platformFeeAmount: pFee,
          discountAmount: pDisc,
          tipAmount: pTip,
          totalAmount: pTot,
        });
      }
    }
    // ------------------------------------------------------------------------
    // Case B: ITEM-BASED SPLIT
    // ------------------------------------------------------------------------
    else if (input.splitType === "ITEM") {
      const portionsInput = input.portions;
      if (!Array.isArray(portionsInput) || portionsInput.length < 2) {
        throw new ValidationError("Item-based split requires at least 2 portions.");
      }

      // 1. Fetch all items on orders linked to this bill
      let orderList: typeof orders.$inferSelect[] = [];
      if (bill.tableSessionId) {
        orderList = await tx
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.tenantId, tenantId),
              eq(orders.tableSessionId, bill.tableSessionId),
              sql`${orders.status} != 'CANCELLED'`
            )
          );
      } else if (bill.orderId) {
        orderList = await tx
          .select()
          .from(orders)
          .where(and(eq(orders.tenantId, tenantId), eq(orders.orderId, bill.orderId)));
      }

      const orderIds = orderList.map((o) => o.orderId);
      if (orderIds.length === 0) {
        throw new BusinessRuleError("No order items found associated with this bill.");
      }

      const availableItems = await tx
        .select()
        .from(orderItems)
        .where(
          and(
            eq(orderItems.tenantId, tenantId),
            inArray(orderItems.orderId, orderIds),
            sql`${orderItems.itemStatus} != 'CANCELLED'`
          )
        );

      const itemsMap = new Map(availableItems.map((it) => [it.orderItemId, it]));

      // 2. Validate quantity allocations across all portions
      const itemAllocatedCount = new Map<string, number>();

      for (const p of portionsInput) {
        if (!p.items || p.items.length === 0) {
          throw new ValidationError(`Portion '${p.name}' must have at least one item assigned.`);
        }
        for (const it of p.items) {
          if (!itemsMap.has(it.orderItemId)) {
            throw new ValidationError(`Order item '${it.orderItemId}' does not belong to this bill.`);
          }
          if (it.quantity <= 0) {
            throw new ValidationError(`Assigned quantity for item '${it.orderItemId}' must be greater than zero.`);
          }
          const curr = itemAllocatedCount.get(it.orderItemId) || 0;
          itemAllocatedCount.set(it.orderItemId, curr + it.quantity);
        }
      }

      for (const [orderItemId, totalAssignedQty] of itemAllocatedCount.entries()) {
        const itemRow = itemsMap.get(orderItemId)!;
        if (totalAssignedQty > itemRow.quantity) {
          throw new ValidationError(
            `Allocated quantity (${totalAssignedQty}) for item '${itemRow.itemName}' exceeds ordered quantity (${itemRow.quantity}).`
          );
        }
      }

      // 3. Calculate subtotal per portion and allocate proportional tax/fees
      let runningSubtotal = Decimal.zero();
      let runningTax = Decimal.zero();
      let runningFee = Decimal.zero();
      let runningDiscount = Decimal.zero();
      let runningTip = Decimal.zero();
      let runningTotal = Decimal.zero();

      const portionSubtotals: Decimal[] = portionsInput.map((p) => {
        let pSub = Decimal.zero();
        for (const it of p.items) {
          const itemRow = itemsMap.get(it.orderItemId)!;
          const lineSub = Decimal.from(itemRow.unitPrice).times(it.quantity);
          pSub = pSub.plus(lineSub);
        }
        return pSub;
      });

      const totalPortionSubtotal = Decimal.sum(...portionSubtotals);
      if (totalPortionSubtotal.isZero()) {
        throw new ValidationError("Item split subtotal cannot be zero.");
      }

      for (let i = 0; i < portionsInput.length; i++) {
        const isLast = i === portionsInput.length - 1;
        const pInput = portionsInput[i];
        const pSub = portionSubtotals[i];

        let pTax: Decimal;
        let pFee: Decimal;
        let pDisc: Decimal;
        let pTip: Decimal;
        let pTot: Decimal;

        if (!isLast) {
          const ratio = pSub.dividedBy(billSubtotal.isZero() ? Decimal.one() : billSubtotal, 6);
          pTax = billTax.times(ratio).round(2, "HALF_UP");
          pFee = billPlatformFee.times(ratio).round(2, "HALF_UP");
          pDisc = billDiscount.times(ratio).round(2, "HALF_UP");
          pTip = billTip.times(ratio).round(2, "HALF_UP");
          pTot = pSub.plus(pTax).plus(pFee).plus(pTip).minus(pDisc);

          runningSubtotal = runningSubtotal.plus(pSub);
          runningTax = runningTax.plus(pTax);
          runningFee = runningFee.plus(pFee);
          runningDiscount = runningDiscount.plus(pDisc);
          runningTip = runningTip.plus(pTip);
          runningTotal = runningTotal.plus(pTot);
        } else {
          // Last portion absorbs rounding difference so exact sum === bill total
          pTax = billTax.minus(runningTax);
          pFee = billPlatformFee.minus(runningFee);
          pDisc = billDiscount.minus(runningDiscount);
          pTip = billTip.minus(runningTip);
          pTot = billTotal.minus(runningTotal);
        }

        createdPortions.push({
          portionNumber: i + 1,
          name: pInput.name,
          allocatedAmount: pSub,
          taxAmount: pTax,
          platformFeeAmount: pFee,
          discountAmount: pDisc,
          tipAmount: pTip,
          totalAmount: pTot,
          items: pInput.items,
        });
      }
    }
    // ------------------------------------------------------------------------
    // Case C: CUSTOM AMOUNT SPLIT
    // ------------------------------------------------------------------------
    else if (input.splitType === "CUSTOM") {
      const portionsInput = input.portions;
      if (!Array.isArray(portionsInput) || portionsInput.length < 2) {
        throw new ValidationError("Custom split requires at least 2 portions.");
      }

      let sumCustom = Decimal.zero();
      for (const p of portionsInput) {
        const amt = Decimal.from(p.totalAmount);
        if (amt.lessThanOrEqualTo(Decimal.zero())) {
          throw new ValidationError("Each custom split portion amount must be greater than zero.");
        }
        sumCustom = sumCustom.plus(amt);
      }

      if (!sumCustom.equals(billTotal)) {
        throw new ValidationError(
          `Sum of custom split portions (${sumCustom.toFixed(2)}) does not reconcile to bill total (${billTotal.toFixed(2)}).`
        );
      }

      createdPortions = portionsInput.map((p, idx) => ({
        portionNumber: idx + 1,
        name: p.name,
        allocatedAmount: Decimal.from(p.totalAmount),
        taxAmount: Decimal.zero(),
        platformFeeAmount: Decimal.zero(),
        discountAmount: Decimal.zero(),
        tipAmount: Decimal.zero(),
        totalAmount: Decimal.from(p.totalAmount),
      }));
    } else {
      throw new ValidationError("Unsupported splitType. Must be 'EQUAL', 'ITEM', or 'CUSTOM'.");
    }

    // 4. Mathematical Invariant Verification: Exact Reconciliation
    const totalSplitSum = Decimal.sum(...createdPortions.map((p) => p.totalAmount));
    if (!totalSplitSum.equals(billTotal)) {
      throw new BusinessRuleError(
        `Critical financial reconciliation failure: Split sum (${totalSplitSum.toFixed(2)}) != Bill total (${billTotal.toFixed(2)}).`
      );
    }

    // 5. Insert split header
    const [newSplit] = await tx
      .insert(restaurantBillSplits)
      .values({
        tenantId,
        outletId: bill.outletId,
        billId,
        splitType: input.splitType,
        totalPortions: createdPortions.length,
        status: "ACTIVE",
        notes: input.notes,
      })
      .returning();

    // 6. Insert portions and items
    for (const p of createdPortions) {
      const [newPortion] = await tx
        .insert(restaurantBillSplitPortions)
        .values({
          tenantId,
          outletId: bill.outletId,
          splitId: newSplit.splitId,
          portionNumber: p.portionNumber,
          name: p.name,
          allocatedAmount: p.allocatedAmount.toFixed(4),
          taxAmount: p.taxAmount.toFixed(4),
          platformFeeAmount: p.platformFeeAmount.toFixed(4),
          discountAmount: p.discountAmount.toFixed(4),
          tipAmount: p.tipAmount.toFixed(4),
          totalAmount: p.totalAmount.toFixed(4),
          paidAmount: "0.0000",
          status: "UNPAID",
        })
        .returning();

      if (p.items && p.items.length > 0) {
        for (const it of p.items) {
          const [orderItem] = await tx
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderItemId, it.orderItemId))
            .limit(1);

          const itemAllocAmt = Decimal.from(orderItem.unitPrice).times(it.quantity);
          await tx.insert(restaurantBillSplitItems).values({
            tenantId,
            outletId: bill.outletId,
            portionId: newPortion.portionId,
            orderItemId: it.orderItemId,
            allocatedQuantity: it.quantity,
            allocatedAmount: itemAllocAmt.toFixed(4),
          });
        }
      }
    }

    // 7. Domain outbox event
    const splitEvent = createDomainEvent({
      eventType: "RESTAURANT_BILL_SPLIT_CREATED",
      tenantId,
      outletId: bill.outletId,
      vertical: "RESTAURANT",
      aggregateType: "BILL_SPLIT",
      aggregateId: newSplit.splitId,
      payload: {
        billId,
        splitId: newSplit.splitId,
        tenantId,
        outletId: bill.outletId,
        splitType: input.splitType,
        totalPortions: createdPortions.length,
        totalAmount: billTotal.toFixed(2),
      },
    });
    await recordOutboxEvent(tx, splitEvent);

    // 8. Audit event
    await recordAuditEvent({
      tenantId,
      userId: user?.sub,
      action: "BILL_SPLIT_CREATED",
      resourceType: "BILL_SPLIT",
      resourceId: newSplit.splitId,
      payload: {
        billId,
        splitType: input.splitType,
        totalPortions: createdPortions.length,
        totalAmount: billTotal.toFixed(2),
      },
    });

    return await getBillDetailsTx(tx, tenantId, billId);
  });
}

// ============================================================================
// Service: Record Bill Payment (Multi-Payment Settlement)
// ============================================================================

export async function recordBillPayment(
  tenantId: string,
  billId: string,
  input: RecordPaymentInput,
  user?: JwtPayload
): Promise<DetailedBillResponseDto> {
  assertModuleEntitlement(tenantId, "RESTAURANT", user?.isSuperAdmin || false);
  const db = getDb();

  return await db.transaction(async (tx) => {
    // 1. Pessimistic lock on bill
    const [bill] = await tx
      .select()
      .from(bills)
      .where(and(eq(bills.tenantId, tenantId), eq(bills.billId, billId)))
      .for("update")
      .limit(1);

    if (!bill) {
      throw new NotFoundError("Restaurant bill not found.");
    }

    if (bill.status === "PAID") {
      throw new BusinessRuleError("Bill is already fully paid and settled.");
    }
    if (bill.status === "VOIDED") {
      throw new BusinessRuleError("Cannot process payment for a voided bill.");
    }

    const paymentAmount = Decimal.from(input.amount);
    if (paymentAmount.lessThanOrEqualTo(Decimal.zero())) {
      throw new ValidationError("Payment amount must be greater than zero.");
    }

    const billTotal = Decimal.from(bill.totalAmount);
    const billSettled = Decimal.from(bill.settledAmount);
    const billRemaining = billTotal.minus(billSettled);

    // Strict invariant: Never allow overpayments
    if (paymentAmount.greaterThan(billRemaining)) {
      throw new BusinessRuleError(
        `Payment amount (${paymentAmount.toFixed(2)}) exceeds remaining bill balance (${billRemaining.toFixed(2)}). Overpayments are not permitted.`
      );
    }

    // 2. If payment is allocated to a specific split portion:
    let targetPortion: typeof restaurantBillSplitPortions.$inferSelect | null = null;
    if (input.portionId) {
      const [portion] = await tx
        .select()
        .from(restaurantBillSplitPortions)
        .where(
          and(
            eq(restaurantBillSplitPortions.tenantId, tenantId),
            eq(restaurantBillSplitPortions.portionId, input.portionId)
          )
        )
        .for("update")
        .limit(1);

      if (!portion) {
        throw new NotFoundError("Specified split portion not found.");
      }

      const portionTotal = Decimal.from(portion.totalAmount);
      const portionPaid = Decimal.from(portion.paidAmount);
      const portionRemaining = portionTotal.minus(portionPaid);

      if (paymentAmount.greaterThan(portionRemaining)) {
        throw new BusinessRuleError(
          `Payment amount (${paymentAmount.toFixed(2)}) exceeds remaining portion balance (${portionRemaining.toFixed(2)}).`
        );
      }

      const newPortionPaid = portionPaid.plus(paymentAmount);
      const portionStatus: RestaurantPortionStatus = newPortionPaid.greaterThanOrEqualTo(portionTotal)
        ? "PAID"
        : "PARTIALLY_PAID";

      await tx
        .update(restaurantBillSplitPortions)
        .set({
          paidAmount: newPortionPaid.toFixed(4),
          status: portionStatus,
          updatedAt: new Date(),
        })
        .where(eq(restaurantBillSplitPortions.portionId, portion.portionId));

      targetPortion = portion;
    }

    // 3. Record payment transaction in canonical ledger
    const [newPayment] = await tx
      .insert(paymentTransactions)
      .values({
        tenantId,
        outletId: bill.outletId,
        billId: bill.billId,
        portionId: input.portionId || null,
        paymentMethod: input.paymentMethod,
        gatewayProvider: "MOCK",
        gatewayTransactionReference: input.gatewayTransactionReference || null,
        amount: paymentAmount.toFixed(4),
        currency: "INR",
        status: "PAID", // Captured
        idempotencyKey: input.idempotencyKey || null,
        receivedByStaffId: safeUuid(user?.sub),
        notes: input.notes || null,
        processedAt: new Date(),
      })
      .returning();

    // 4. Update bill settled amount & status
    const newSettledAmount = billSettled.plus(paymentAmount);
    const isNowFullySettled = newSettledAmount.greaterThanOrEqualTo(billTotal);
    const newBillStatus = isNowFullySettled ? "PAID" : "PARTIALLY_PAID";

    await tx
      .update(bills)
      .set({
        settledAmount: newSettledAmount.toFixed(4),
        status: newBillStatus,
        settledAt: isNowFullySettled ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(bills.billId, bill.billId));

    // 5. If fully settled, also check if active split is fully settled
    if (isNowFullySettled) {
      await tx
        .update(restaurantBillSplits)
        .set({ status: "SETTLED", updatedAt: new Date() })
        .where(
          and(
            eq(restaurantBillSplits.tenantId, tenantId),
            eq(restaurantBillSplits.billId, bill.billId),
            eq(restaurantBillSplits.status, "ACTIVE")
          )
        );
    }

    // 6. Transactional Outbox Events
    const paymentEvent = createDomainEvent({
      eventType: "RESTAURANT_PAYMENT_RECEIVED",
      tenantId,
      outletId: bill.outletId,
      vertical: "RESTAURANT",
      aggregateType: "PAYMENT",
      aggregateId: newPayment.paymentId,
      payload: {
        billId: bill.billId,
        paymentId: newPayment.paymentId,
        portionId: input.portionId || null,
        tenantId,
        outletId: bill.outletId,
        amount: paymentAmount.toFixed(2),
        paymentMethod: input.paymentMethod,
        settledAmount: newSettledAmount.toFixed(2),
        remainingAmount: billTotal.minus(newSettledAmount).toFixed(2),
        status: newBillStatus,
      },
    });
    await recordOutboxEvent(tx, paymentEvent);

    if (isNowFullySettled) {
      const settledEvent = createDomainEvent({
        eventType: "RESTAURANT_BILL_SETTLED",
        tenantId,
        outletId: bill.outletId,
        vertical: "RESTAURANT",
        aggregateType: "BILL",
        aggregateId: bill.billId,
        payload: {
          billId: bill.billId,
          billNumber: bill.billNumber,
          tenantId,
          outletId: bill.outletId,
          tableSessionId: bill.tableSessionId,
          totalAmount: billTotal.toFixed(2),
          settledAmount: newSettledAmount.toFixed(2),
          tipAmount: Decimal.from(bill.tipAmount || "0").toFixed(2),
          settledAt: new Date().toISOString(),
        },
      });
      await recordOutboxEvent(tx, settledEvent);
    }

    // 7. Audit Event
    await recordAuditEvent({
      tenantId,
      userId: user?.sub,
      action: isNowFullySettled ? "BILL_SETTLED" : "PAYMENT_RECORDED",
      resourceType: "PAYMENT",
      resourceId: newPayment.paymentId,
      payload: {
        billId: bill.billId,
        amount: paymentAmount.toFixed(2),
        settledAmount: newSettledAmount.toFixed(2),
        billStatus: newBillStatus,
      },
    });

    // 8. Realtime event
    realtimeHub.broadcastToTenant(tenantId, "BILL_PAYMENT", {
      billId: bill.billId,
      amount: paymentAmount.toFixed(2),
      status: newBillStatus,
    });

    return await getBillDetailsTx(tx, tenantId, billId);
  });
}

// ============================================================================
// Service: Tip Allocation & Distribution
// ============================================================================

export async function allocateBillTip(
  tenantId: string,
  billId: string,
  input: AllocateTipInput,
  user?: JwtPayload
): Promise<DetailedBillResponseDto> {
  assertModuleEntitlement(tenantId, "RESTAURANT", user?.isSuperAdmin || false);
  const db = getDb();

  return await db.transaction(async (tx) => {
    // 1. Lock bill row
    const [bill] = await tx
      .select()
      .from(bills)
      .where(and(eq(bills.tenantId, tenantId), eq(bills.billId, billId)))
      .for("update")
      .limit(1);

    if (!bill) {
      throw new NotFoundError("Restaurant bill not found.");
    }

    if (bill.status === "PAID") {
      throw new BusinessRuleError("Cannot alter tip on an already fully settled bill.");
    }
    if (bill.status === "VOIDED") {
      throw new BusinessRuleError("Cannot alter tip on a voided bill.");
    }

    const tipAmount = Decimal.from(input.tipAmount);
    if (tipAmount.isNegative()) {
      throw new ValidationError("Tip amount cannot be negative.");
    }

    // 2. Validate distributions if provided
    if (input.distributions && input.distributions.length > 0) {
      let sumDist = Decimal.zero();
      let hasPercentages = true;
      let sumPercentages = Decimal.zero();

      for (const d of input.distributions) {
        const amt = Decimal.from(d.amount);
        if (amt.lessThanOrEqualTo(Decimal.zero())) {
          throw new ValidationError("Tip distribution amount must be greater than zero.");
        }
        sumDist = sumDist.plus(amt);

        if (d.staffId) {
          const validStaffUuid = safeUuid(d.staffId);
          if (!validStaffUuid) {
            throw new ValidationError(`Invalid staffId UUID format: '${d.staffId}'.`);
          }
          const [staff] = await tx
            .select()
            .from(staffProfiles)
            .where(
              and(
                eq(staffProfiles.tenantId, tenantId),
                eq(staffProfiles.staffId, validStaffUuid)
              )
            )
            .limit(1);
          if (!staff) {
            throw new ValidationError(`Staff recipient '${d.staffId}' not found within current tenant.`);
          }
        }

        if (d.percentage !== undefined && d.percentage !== null) {
          const pct = Decimal.from(d.percentage);
          if (pct.lessThanOrEqualTo(Decimal.zero()) || pct.greaterThan(Decimal.from(100))) {
            throw new ValidationError(`Tip distribution percentage must be between 0 and 100. Received: '${d.percentage}'.`);
          }
          sumPercentages = sumPercentages.plus(pct);
        } else {
          hasPercentages = false;
        }
      }

      if (!sumDist.equals(tipAmount)) {
        throw new ValidationError(
          `Sum of tip distributions (${sumDist.toFixed(2)}) must reconcile exactly to bill tip amount (${tipAmount.toFixed(2)}).`
        );
      }

      if (hasPercentages && !sumPercentages.round(2).equals(Decimal.from(100))) {
        throw new ValidationError(
          `Sum of tip distribution percentages (${sumPercentages.toFixed(2)}%) must equal 100%.`
        );
      }
    }

    // 3. Recompute bill total: subtotal + tax + platformFee + tip - discount
    const subtotal = Decimal.from(bill.subtotalAmount);
    const tax = Decimal.from(bill.taxAmount);
    const platformFee = Decimal.from(bill.platformFeeAmount || "0");
    const discount = Decimal.from(bill.discountAmount || "0");
    const newTotal = subtotal.plus(tax).plus(platformFee).plus(tipAmount).minus(discount);

    await tx
      .update(bills)
      .set({
        tipAmount: tipAmount.toFixed(4),
        totalAmount: newTotal.toFixed(4),
        updatedAt: new Date(),
      })
      .where(eq(bills.billId, billId));

    // 4. Clear old distributions and insert new
    await tx
      .delete(restaurantTipDistributions)
      .where(
        and(
          eq(restaurantTipDistributions.tenantId, tenantId),
          eq(restaurantTipDistributions.billId, billId)
        )
      );

    if (input.distributions && input.distributions.length > 0) {
      for (const d of input.distributions) {
        await tx.insert(restaurantTipDistributions).values({
          tenantId,
          outletId: bill.outletId,
          billId,
          staffId: safeUuid(d.staffId),
          recipientName: d.recipientName,
          amount: Decimal.from(d.amount).toFixed(4),
          percentage: d.percentage ? Decimal.from(d.percentage).toFixed(4) : null,
          notes: d.notes || null,
          distributedByUserId: safeUuid(user?.sub),
        });
      }
    }

    // 5. Outbox Event
    const tipEvent = createDomainEvent({
      eventType: "RESTAURANT_TIP_ALLOCATED",
      tenantId,
      outletId: bill.outletId,
      vertical: "RESTAURANT",
      aggregateType: "BILL",
      aggregateId: billId,
      payload: {
        billId,
        tenantId,
        outletId: bill.outletId,
        tipAmount: tipAmount.toFixed(2),
        distributionCount: input.distributions?.length || 0,
      },
    });
    await recordOutboxEvent(tx, tipEvent);

    // 6. Audit Event
    await recordAuditEvent({
      tenantId,
      userId: user?.sub,
      action: "TIP_ALLOCATED",
      resourceType: "BILL",
      resourceId: billId,
      payload: {
        tipAmount: tipAmount.toFixed(2),
        totalAmount: newTotal.toFixed(2),
      },
    });

    return await getBillDetailsTx(tx, tenantId, billId);
  });
}
