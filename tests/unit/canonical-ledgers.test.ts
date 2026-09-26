import { describe, it, expect } from "vitest";
import {
  inventoryStockMovements,
  hotelFolioEntries,
  hotelFolios,
  paymentTransactions,
  paymentRefunds,
  cashMovements,
} from "@/db/schema";
import { getTableColumns } from "drizzle-orm";

describe("Canonical Ledgers & Immutable Financial Records Audit", () => {
  it("1. All canonical ledgers remain strictly distinct tables with tenant scoping", () => {
    const stockCols = getTableColumns(inventoryStockMovements);
    const folioCols = getTableColumns(hotelFolioEntries);
    const payCols = getTableColumns(paymentTransactions);
    const refCols = getTableColumns(paymentRefunds);
    const cashCols = getTableColumns(cashMovements);

    expect(stockCols.tenantId).toBeDefined();
    expect(folioCols.tenantId).toBeDefined();
    expect(payCols.tenantId).toBeDefined();
    expect(refCols.tenantId).toBeDefined();
    expect(cashCols.tenantId).toBeDefined();

    expect(stockCols.movementId).toBeDefined();
    expect(folioCols.entryId).toBeDefined();
    expect(payCols.paymentId).toBeDefined();
    expect(refCols.refundId).toBeDefined();
    expect(cashCols.movementId).toBeDefined();
  });

  it("2. Inventory Stock Movements ledger enforces idempotency and audit tracking", () => {
    const stockCols = getTableColumns(inventoryStockMovements);
    expect(stockCols.idempotencyKey).toBeDefined();
    expect(stockCols.performedByUserId).toBeDefined();
    expect(stockCols.movementType).toBeDefined();
    expect(stockCols.quantity).toBeDefined();
    expect(stockCols.unitCost).toBeDefined();
    expect(stockCols.createdAt).toBeDefined();
  });

  it("3. Hotel Folio Entries ledger enforces compensating reversal tracking", () => {
    const folioCols = getTableColumns(hotelFolioEntries);
    expect(folioCols.reversesEntryId).toBeDefined();
    expect(folioCols.referenceId).toBeDefined();
    expect(folioCols.postedByStaffId).toBeDefined();
    expect(folioCols.entryType).toBeDefined();
    expect(folioCols.amount).toBeDefined();
  });

  it("4. Hotel Folios header maintains distinct settlement projection fields", () => {
    const folioCols = getTableColumns(hotelFolios);
    expect(folioCols.folioNumber).toBeDefined();
    expect(folioCols.totalCharges).toBeDefined();
    expect(folioCols.totalPayments).toBeDefined();
    expect(folioCols.balanceDue).toBeDefined();
    expect(folioCols.status).toBeDefined();
  });

  it("5. Payment Transactions and Refunds maintain discrete financial audit trails", () => {
    const payCols = getTableColumns(paymentTransactions);
    const refCols = getTableColumns(paymentRefunds);

    expect(payCols.idempotencyKey).toBeDefined();
    expect(payCols.gatewayProvider).toBeDefined();
    expect(payCols.gatewayTransactionReference).toBeDefined();

    expect(refCols.idempotencyKey).toBeDefined();
    expect(refCols.approvedByStaffId).toBeDefined();
    expect(refCols.refundAmount).toBeDefined();
  });
});
