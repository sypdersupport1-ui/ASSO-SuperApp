import { BusinessRuleError, ValidationError } from "@/lib/api/errors";

// ============================================================================
// Types & Constants
// ============================================================================

export const HOTEL_FOLIO_STATUSES = [
  "OPEN",
  "CLOSED",
] as const;
export type HotelFolioStatus = typeof HOTEL_FOLIO_STATUSES[number];

export const HOTEL_FOLIO_ENTRY_TYPES = [
  "ROOM_CHARGE",
  "FOOD_CHARGE",
  "SERVICE_CHARGE",
  "TAX",
  "PAYMENT",
  "ADJUSTMENT",
  "REFUND",
  "REVERSAL",
] as const;
export type HotelFolioEntryType = typeof HOTEL_FOLIO_ENTRY_TYPES[number];

export const HOTEL_PAYMENT_METHODS = [
  "CASH",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "UPI",
  "BANK_TRANSFER",
  "ROOM_CREDIT",
] as const;
export type HotelPaymentMethod = typeof HOTEL_PAYMENT_METHODS[number];

export type FolioEntryDirection = "DEBIT" | "CREDIT";

// ============================================================================
// State Transition Machine
// ============================================================================

const FOLIO_STATUS_TRANSITIONS: Record<HotelFolioStatus, HotelFolioStatus[]> = {
  OPEN: ["CLOSED"],
  CLOSED: ["OPEN"], // Reopenable only under explicit authorized policy
};

/**
 * Validates whether a folio status transition is legally permitted.
 */
export function validateFolioStatusTransition(
  fromStatus: HotelFolioStatus,
  toStatus: HotelFolioStatus
): void {
  if (fromStatus === toStatus) {
    return;
  }

  const allowed = FOLIO_STATUS_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    throw new BusinessRuleError(
      `Invalid folio status transition from '${fromStatus}' to '${toStatus}'.`
    );
  }
}

/**
 * Determines whether a folio entry type is valid.
 */
export function isFolioEntryType(value: string): value is HotelFolioEntryType {
  return (HOTEL_FOLIO_ENTRY_TYPES as readonly string[]).includes(value);
}

/**
 * Determines whether a folio entry represents a debit (charge / refund / debit-adjustment)
 * or a credit (payment / reversal of charge / credit-adjustment).
 */
export function getEntryDirection(entryType: HotelFolioEntryType, amount: number): FolioEntryDirection {
  if (entryType === "PAYMENT") {
    return "CREDIT";
  }
  if (entryType === "ROOM_CHARGE" || entryType === "FOOD_CHARGE" || entryType === "SERVICE_CHARGE" || entryType === "TAX" || entryType === "REFUND") {
    return "DEBIT";
  }
  // ADJUSTMENT or REVERSAL depend on numeric sign
  return amount >= 0 ? "DEBIT" : "CREDIT";
}

export interface FolioEntryComputationItem {
  entryType: HotelFolioEntryType | string;
  amount: string | number;
}

export interface CalculatedFolioBalances {
  totalCharges: string;
  totalPayments: string;
  balanceDue: string;
}

/**
 * Deterministic balance computation derived from immutable ledger entries.
 * Accounting Convention:
 * - Debits (charges, refunds, positive adjustments) increase balanceDue.
 * - Credits (payments, negative adjustments, negative reversals) reduce balanceDue.
 * - Net Balance Due = Total Charges - Total Payments.
 */
export function calculateFolioBalances(
  entries: FolioEntryComputationItem[]
): CalculatedFolioBalances {
  let chargesTotal = 0;
  let paymentsTotal = 0;

  for (const entry of entries) {
    const amt = typeof entry.amount === "number" ? entry.amount : parseFloat(entry.amount || "0");
    if (isNaN(amt)) continue;

    const type = entry.entryType as HotelFolioEntryType;

    if (type === "PAYMENT") {
      // Payments are stored with negative sign or positive magnitude; we accumulate absolute payment
      paymentsTotal += Math.abs(amt);
    } else if (type === "REFUND") {
      // Refund represents money returned to guest, effectively increasing outstanding debt or reducing previous credit
      chargesTotal += Math.abs(amt);
    } else if (type === "ADJUSTMENT" || type === "REVERSAL") {
      if (amt < 0) {
        // Credit adjustment / reduction
        paymentsTotal += Math.abs(amt);
      } else {
        // Additional debit / surcharge
        chargesTotal += amt;
      }
    } else {
      // Standard charges: ROOM_CHARGE, FOOD_CHARGE, SERVICE_CHARGE, TAX
      chargesTotal += amt;
    }
  }

  const netBalance = chargesTotal - paymentsTotal;

  return {
    totalCharges: chargesTotal.toFixed(4),
    totalPayments: paymentsTotal.toFixed(4),
    balanceDue: netBalance.toFixed(4),
  };
}
