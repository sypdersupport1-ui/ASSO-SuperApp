"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Receipt,
  CreditCard,
  Split,
  DollarSign,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Grid3X3,
  CalendarDays,
  UserCheck,
  ShieldCheck,
  ChevronRight,
  Percent,
  Wallet,
  Clock,
  Sparkles,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface BillSummary {
  billId: string;
  billNumber: string;
  tenantId: string;
  outletId: string;
  tableSessionId?: string | null;
  status: string;
  totalAmount: string;
  settledAmount: string;
  remainingAmount: string;
  isFullySettled: boolean;
  createdAt: string;
}

interface BillPortion {
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
  status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  items?: Array<{
    splitItemId: string;
    orderItemId: string;
    itemName: string;
    unitPrice: string;
    allocatedQuantity: number;
    allocatedAmount: string;
  }>;
}

interface BillPayment {
  paymentId: string;
  portionId?: string | null;
  paymentMethod: string;
  amount: string;
  status: string;
  processedAt?: string | null;
  createdAt: string;
}

interface DetailedBill {
  billId: string;
  billNumber: string;
  tenantId: string;
  outletId: string;
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
  activeSplit?: {
    splitId: string;
    splitType: "EQUAL" | "ITEM" | "CUSTOM";
    totalPortions: number;
    status: string;
    portions: BillPortion[];
  } | null;
  payments: BillPayment[];
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

export default function RestaurantBillingPage() {
  const [billsList, setBillsList] = useState<BillSummary[]>([]);
  const [selectedBill, setSelectedBill] = useState<DetailedBill | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals state
  const [splitModalOpen, setSplitModalOpen] = useState<boolean>(false);
  const [splitType, setSplitType] = useState<"EQUAL" | "ITEM" | "CUSTOM">("EQUAL");
  const [equalCount, setEqualCount] = useState<number>(2);
  const [customPortions, setCustomPortions] = useState<Array<{ name: string; totalAmount: string }>>([
    { name: "Guest 1", totalAmount: "" },
    { name: "Guest 2", totalAmount: "" },
  ]);
  const [itemPortions, setItemPortions] = useState<Array<{ name: string; items: Record<string, number> }>>([
    { name: "Guest 1", items: {} },
    { name: "Guest 2", items: {} },
  ]);
  const [submittingSplit, setSubmittingSplit] = useState<boolean>(false);

  // Payment Modal state
  const [payModalOpen, setPayModalOpen] = useState<boolean>(false);
  const [payPortionId, setPayPortionId] = useState<string>("");
  const [payAmount, setPayAmount] = useState<string>("");
  const [payMethod, setPayMethod] = useState<string>("CASH");
  const [payRef, setPayRef] = useState<string>("");
  const [submittingPay, setSubmittingPay] = useState<boolean>(false);

  // Tip Modal state
  const [tipModalOpen, setTipModalOpen] = useState<boolean>(false);
  const [tipAmount, setTipAmount] = useState<string>("");
  const [tipRecipient, setTipRecipient] = useState<string>("Service Team");
  const [submittingTip, setSubmittingTip] = useState<boolean>(false);

  // Fetch Bills
  const fetchBills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = "/api/v1/restaurant/bills";
      if (statusFilter !== "ALL") {
        url += `?status=${statusFilter}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setBillsList(json.data);
        if (selectedBill) {
          // Refresh selected bill details
          const selRes = await fetch(`/api/v1/restaurant/bills/${selectedBill.billId}`);
          const selJson = await selRes.json();
          if (selJson.success) {
            setSelectedBill(selJson.data);
          }
        }
      } else {
        setError(json.error?.message || "Failed to load restaurant bills.");
      }
    } catch {
      setError("Network error loading restaurant bills.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedBill?.billId]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  // Load single bill details
  const selectBill = async (billId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/v1/restaurant/bills/${billId}`);
      const json = await res.json();
      if (json.success) {
        setSelectedBill(json.data);
      } else {
        setError(json.error?.message || "Failed to load bill details.");
      }
    } catch {
      setError("Network error loading bill details.");
    }
  };

  // Create Bill Split Submit
  const handleCreateSplit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBill) return;
    setSubmittingSplit(true);
    setError(null);

    try {
      let payload: any;
      if (splitType === "EQUAL") {
        payload = {
          splitType: "EQUAL",
          portionsCount: equalCount,
        };
      } else if (splitType === "ITEM") {
        payload = {
          splitType: "ITEM",
          portions: itemPortions
            .map((p) => ({
              name: p.name,
              items: Object.entries(p.items)
                .filter(([_, qty]) => qty > 0)
                .map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
            }))
            .filter((p) => p.items.length > 0),
        };
      } else {
        payload = {
          splitType: "CUSTOM",
          portions: customPortions.filter((p) => p.name && p.totalAmount),
        };
      }

      const res = await fetch(`/api/v1/restaurant/bills/${selectedBill.billId}/splits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success) {
        setSelectedBill(json.data);
        setSplitModalOpen(false);
        setSuccessMessage("Bill split created successfully with exact reconciliation.");
        setTimeout(() => setSuccessMessage(null), 4000);
        fetchBills();
      } else {
        setError(json.error?.message || "Failed to create bill split.");
      }
    } catch {
      setError("Network error creating bill split.");
    } finally {
      setSubmittingSplit(false);
    }
  };

  // Record Payment Submit
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBill) return;
    setSubmittingPay(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/restaurant/bills/${selectedBill.billId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portionId: payPortionId || undefined,
          amount: payAmount,
          paymentMethod: payMethod,
          gatewayTransactionReference: payRef || undefined,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSelectedBill(json.data);
        setPayModalOpen(false);
        setPayAmount("");
        setPayPortionId("");
        setPayRef("");
        setSuccessMessage("Payment recorded and ledger updated successfully.");
        setTimeout(() => setSuccessMessage(null), 4000);
        fetchBills();
      } else {
        setError(json.error?.message || "Failed to record payment.");
      }
    } catch {
      setError("Network error recording payment.");
    } finally {
      setSubmittingPay(false);
    }
  };

  // Tip Allocation Submit
  const handleAllocateTip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBill) return;
    setSubmittingTip(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/restaurant/bills/${selectedBill.billId}/tips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipAmount,
          distributions: [
            {
              recipientName: tipRecipient,
              amount: tipAmount,
            },
          ],
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSelectedBill(json.data);
        setTipModalOpen(false);
        setTipAmount("");
        setSuccessMessage("Tip allocated and reconciled to bill total.");
        setTimeout(() => setSuccessMessage(null), 4000);
        fetchBills();
      } else {
        setError(json.error?.message || "Failed to allocate tip.");
      }
    } catch {
      setError("Network error allocating tip.");
    } finally {
      setSubmittingTip(false);
    }
  };

  const filteredBills = billsList.filter((b) => {
    if (searchQuery.trim()) {
      return (
        b.billNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.billId.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-display">
              Restaurant POS & Billing
            </h1>
            <Badge className="bg-emerald-600 text-white border-0 text-xs">
              R3.6 Financial Ledger
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Authoritative bill totals, deterministic bill splitting, tip distribution, and multi-payment settlement.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <Link href="/restaurant/tables">
            <Button variant="outline" size="sm" className="flex items-center gap-1.5 text-xs">
              <Grid3X3 className="h-3.5 w-3.5 text-indigo-500" />
              Floor Map
            </Button>
          </Link>

          <Link href="/restaurant/reservations">
            <Button variant="outline" size="sm" className="flex items-center gap-1.5 text-xs">
              <CalendarDays className="h-3.5 w-3.5 text-emerald-500" />
              Reservations
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchBills}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Billing Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <AlertTitle>Operation Confirmed</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Bills Directory (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search bills by number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border rounded-md px-2.5 py-2 bg-background border-border"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="PAID">Paid</option>
            </select>
          </div>

          <div className="space-y-3 max-h-[750px] overflow-y-auto pr-1">
            {loading && billsList.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-indigo-500" />
                Loading billing ledger...
              </div>
            ) : filteredBills.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-lg text-sm text-muted-foreground">
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No restaurant bills found for current filter.
              </div>
            ) : (
              filteredBills.map((b) => {
                const isSelected = selectedBill?.billId === b.billId;
                return (
                  <div
                    key={b.billId}
                    onClick={() => selectBill(b.billId)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-sm"
                        : "border-border hover:border-muted-foreground/40 bg-card"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-foreground">{b.billNumber}</span>
                      <Badge
                        className={`text-xs ${
                          b.status === "PAID"
                            ? "bg-emerald-600 text-white"
                            : b.status === "PARTIALLY_PAID"
                            ? "bg-amber-600 text-white"
                            : "bg-blue-600 text-white"
                        }`}
                      >
                        {b.status}
                      </Badge>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Total: <strong className="text-foreground">₹{b.totalAmount}</strong></span>
                      <span>Paid: <strong className="text-emerald-600">₹{b.settledAmount}</strong></span>
                      <span>Due: <strong className="text-amber-600">₹{b.remainingAmount}</strong></span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Detailed Bill Terminal (7 cols) */}
        <div className="lg:col-span-7">
          {selectedBill ? (
            <div className="space-y-6">
              {/* Financial Status Summary Card */}
              <Card className="border-border shadow-sm">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <Receipt className="h-5 w-5 text-indigo-500" />
                        {selectedBill.billNumber}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        Created {new Date(selectedBill.createdAt).toLocaleString()}
                        {selectedBill.settledAt && ` • Settled ${new Date(selectedBill.settledAt).toLocaleTimeString()}`}
                      </CardDescription>
                    </div>
                    <Badge
                      className={`text-sm px-3 py-1 ${
                        selectedBill.status === "PAID"
                          ? "bg-emerald-600 text-white"
                          : selectedBill.status === "PARTIALLY_PAID"
                          ? "bg-amber-600 text-white"
                          : "bg-blue-600 text-white"
                      }`}
                    >
                      {selectedBill.status}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Three Metric Cards */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 bg-muted/40 rounded-lg border">
                      <div className="text-xs text-muted-foreground">Bill Total</div>
                      <div className="text-xl font-bold text-foreground mt-1">₹{selectedBill.totalAmount}</div>
                    </div>

                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg border border-emerald-200 dark:border-emerald-800/40">
                      <div className="text-xs text-emerald-600 dark:text-emerald-400">Total Paid</div>
                      <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
                        ₹{selectedBill.settledAmount}
                      </div>
                    </div>

                    <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800/40">
                      <div className="text-xs text-amber-600 dark:text-amber-400">Balance Due</div>
                      <div className="text-xl font-bold text-amber-700 dark:text-amber-300 mt-1">
                        ₹{selectedBill.remainingAmount}
                      </div>
                    </div>
                  </div>

                  {/* Charges Breakdown */}
                  <div className="text-xs space-y-1.5 p-3 rounded-md bg-muted/20 border border-border">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Items Subtotal:</span>
                      <span className="font-mono">₹{selectedBill.subtotalAmount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax (GST):</span>
                      <span className="font-mono">₹{selectedBill.taxAmount}</span>
                    </div>
                    {Number(selectedBill.platformFeeAmount) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Platform Fee:</span>
                        <span className="font-mono">₹{selectedBill.platformFeeAmount}</span>
                      </div>
                    )}
                    {Number(selectedBill.discountAmount) > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Discount:</span>
                        <span className="font-mono">-₹{selectedBill.discountAmount}</span>
                      </div>
                    )}
                    {Number(selectedBill.tipAmount) > 0 && (
                      <div className="flex justify-between text-indigo-600">
                        <span>Tip / Gratuity:</span>
                        <span className="font-mono">+₹{selectedBill.tipAmount}</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                    {selectedBill.status !== "PAID" && (
                      <>
                        <Button
                          onClick={() => {
                            setPayPortionId("");
                            setPayAmount(selectedBill.remainingAmount);
                            setPayModalOpen(true);
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs flex items-center gap-1.5"
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          Record Payment
                        </Button>

                        <Button
                          variant="outline"
                          onClick={() => setSplitModalOpen(true)}
                          className="text-xs flex items-center gap-1.5"
                        >
                          <Split className="h-3.5 w-3.5 text-indigo-500" />
                          Split Bill
                        </Button>

                        <Button
                          variant="outline"
                          onClick={() => {
                            setTipAmount(selectedBill.tipAmount);
                            setTipModalOpen(true);
                          }}
                          className="text-xs flex items-center gap-1.5"
                        >
                          <Percent className="h-3.5 w-3.5 text-amber-500" />
                          {Number(selectedBill.tipAmount) > 0 ? "Adjust Tip" : "Add Tip"}
                        </Button>
                      </>
                    )}

                    {selectedBill.status === "PAID" && (
                      <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold">
                        <CheckCircle2 className="h-4 w-4" />
                        This bill is fully settled. Canonical ledger balanced.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Active Split Portions Display */}
              {selectedBill.activeSplit && (
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Split className="h-4 w-4 text-indigo-500" />
                        Active Split ({selectedBill.activeSplit.splitType} • {selectedBill.activeSplit.totalPortions} Portions)
                      </CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {selectedBill.activeSplit.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {selectedBill.activeSplit.portions.map((p) => (
                        <div
                          key={p.portionId}
                          className="p-3 rounded-lg border border-border flex items-center justify-between gap-4 text-xs"
                        >
                          <div>
                            <div className="font-semibold text-foreground flex items-center gap-2">
                              <span>{p.name}</span>
                              <Badge
                                className={`text-[10px] ${
                                  p.status === "PAID"
                                    ? "bg-emerald-600 text-white"
                                    : p.status === "PARTIALLY_PAID"
                                    ? "bg-amber-600 text-white"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {p.status}
                              </Badge>
                            </div>
                            <div className="text-muted-foreground mt-1">
                              Subtotal: ₹{p.allocatedAmount} • Tax: ₹{p.taxAmount}
                              {Number(p.tipAmount) > 0 && ` • Tip: ₹${p.tipAmount}`}
                            </div>
                            {p.items && p.items.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {p.items.map((it) => (
                                  <span
                                    key={it.splitItemId}
                                    className="bg-muted px-1.5 py-0.5 rounded text-[10px] text-foreground font-mono"
                                  >
                                    {it.allocatedQuantity}x {it.itemName} (₹{it.allocatedAmount})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="text-right">
                            <div className="font-bold text-foreground">₹{p.totalAmount}</div>
                            <div className="text-muted-foreground text-[11px]">
                              Paid: ₹{p.paidAmount} | Due: <span className="text-amber-600 font-semibold">₹{p.remainingAmount}</span>
                            </div>
                            {p.status !== "PAID" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setPayPortionId(p.portionId);
                                  setPayAmount(p.remainingAmount);
                                  setPayModalOpen(true);
                                }}
                                className="mt-1.5 h-7 text-xs text-emerald-600 hover:text-emerald-700"
                              >
                                Pay Portion
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payments History Ledger */}
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-500" />
                    Recorded Payment Transactions ({selectedBill.payments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedBill.payments.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground">
                      No payments recorded yet for this bill.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {selectedBill.payments.map((pm) => (
                        <div key={pm.paymentId} className="py-2.5 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-foreground">{pm.paymentMethod}</span>
                            <span className="text-muted-foreground ml-2">
                              {new Date(pm.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold font-mono text-emerald-600">+₹{pm.amount}</span>
                            <Badge className="bg-emerald-600 text-white text-[10px]">{pm.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center border border-dashed rounded-xl p-12 text-center text-muted-foreground">
              <Receipt className="h-12 w-12 opacity-30 mb-3" />
              <h3 className="font-semibold text-foreground">No Bill Selected</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Select an existing bill from the ledger on the left to configure bill splits, record partial or full payments, and distribute tips.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Bill Split */}
      <Dialog open={splitModalOpen} onOpenChange={setSplitModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Split className="h-5 w-5 text-indigo-500" />
              Split Bill — {selectedBill?.billNumber}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Choose a splitting method. Mathematical invariants enforce that all split portions reconcile exactly to the bill total (₹{selectedBill?.totalAmount}).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSplit} className="space-y-4 pt-2">
            <div className="flex gap-2 p-1 bg-muted rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setSplitType("EQUAL")}
                className={`flex-1 py-1.5 rounded-md font-medium transition-all ${
                  splitType === "EQUAL" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                Equal Split
              </button>
              <button
                type="button"
                onClick={() => setSplitType("ITEM")}
                className={`flex-1 py-1.5 rounded-md font-medium transition-all ${
                  splitType === "ITEM" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                Item-Based Split
              </button>
              <button
                type="button"
                onClick={() => setSplitType("CUSTOM")}
                className={`flex-1 py-1.5 rounded-md font-medium transition-all ${
                  splitType === "CUSTOM" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                Custom Amounts
              </button>
            </div>

            {splitType === "EQUAL" ? (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-foreground">Number of Guests / Portions</label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={2}
                    max={20}
                    value={equalCount}
                    onChange={(e) => setEqualCount(Math.max(2, parseInt(e.target.value, 10) || 2))}
                    className="text-sm"
                  />
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    ≈ ₹{(Number(selectedBill?.totalAmount || 0) / equalCount).toFixed(2)} per guest
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  * Any 1-cent or fractional remainder is deterministically absorbed by the last portion so the total reconciles 100% with zero drift.
                </p>
              </div>
            ) : splitType === "ITEM" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">Allocate Menu Items to Guests</label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setItemPortions([
                        ...itemPortions,
                        { name: `Guest ${itemPortions.length + 1}`, items: {} },
                      ])
                    }
                    className="text-[11px] h-7"
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add Guest
                  </Button>
                </div>

                {!selectedBill?.billItems || selectedBill.billItems.length === 0 ? (
                  <div className="p-3 rounded-lg border border-dashed text-xs text-muted-foreground text-center">
                    No discrete order items linked to this bill. Please use Equal Split or Custom Amounts.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {itemPortions.map((ip, gIdx) => (
                      <div key={gIdx} className="p-2.5 rounded-lg border border-border space-y-2 bg-muted/30">
                        <div className="flex items-center justify-between gap-2">
                          <Input
                            placeholder={`Guest ${gIdx + 1}`}
                            value={ip.name}
                            onChange={(e) => {
                              const updated = [...itemPortions];
                              updated[gIdx].name = e.target.value;
                              setItemPortions(updated);
                            }}
                            className="text-xs h-7 w-36 font-semibold"
                          />
                          <span className="text-[11px] text-muted-foreground">Guest #{gIdx + 1}</span>
                        </div>

                        <div className="space-y-1.5 pl-1">
                          {selectedBill.billItems!.map((bItem) => {
                            const curQty = ip.items[bItem.orderItemId] || 0;
                            return (
                              <div
                                key={bItem.orderItemId}
                                className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0"
                              >
                                <div className="truncate flex-1 pr-2">
                                  <span className="font-medium text-foreground">{bItem.itemName}</span>
                                  <span className="text-muted-foreground text-[10px] ml-1.5">
                                    (₹{bItem.unitPrice}, total ordered: {bItem.quantity})
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-xs"
                                    onClick={() => {
                                      const updated = [...itemPortions];
                                      const newQty = Math.max(0, curQty - 1);
                                      updated[gIdx].items = {
                                        ...updated[gIdx].items,
                                        [bItem.orderItemId]: newQty,
                                      };
                                      setItemPortions(updated);
                                    }}
                                  >
                                    -
                                  </Button>
                                  <span className="w-5 text-center font-mono font-bold text-xs">{curQty}</span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-xs"
                                    onClick={() => {
                                      const updated = [...itemPortions];
                                      const newQty = Math.min(bItem.quantity, curQty + 1);
                                      updated[gIdx].items = {
                                        ...updated[gIdx].items,
                                        [bItem.orderItemId]: newQty,
                                      };
                                      setItemPortions(updated);
                                    }}
                                  >
                                    +
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  * Subtotal, tax, and fees are automatically calculated server-side according to exact decimal apportionment.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-foreground">Portion Breakdown</label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {customPortions.map((cp, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        placeholder={`Guest ${idx + 1}`}
                        value={cp.name}
                        onChange={(e) => {
                          const updated = [...customPortions];
                          updated[idx].name = e.target.value;
                          setCustomPortions(updated);
                        }}
                        className="text-xs flex-1"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Amount"
                        value={cp.totalAmount}
                        onChange={(e) => {
                          const updated = [...customPortions];
                          updated[idx].totalAmount = e.target.value;
                          setCustomPortions(updated);
                        }}
                        className="text-xs w-28"
                      />
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCustomPortions([
                      ...customPortions,
                      { name: `Guest ${customPortions.length + 1}`, totalAmount: "" },
                    ])
                  }
                  className="text-xs w-full"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Portion
                </Button>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setSplitModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingSplit} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {submittingSplit ? "Creating Split..." : "Confirm Split"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Record Payment */}
      <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-emerald-500" />
              Record Payment
            </DialogTitle>
            <DialogDescription className="text-xs">
              Record a payment transaction against {payPortionId ? "selected split portion" : "bill balance"}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordPayment} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-foreground">Payment Amount (₹)</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
                className="text-sm mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Payment Method</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="w-full text-sm border rounded-md px-3 py-2 bg-background border-border mt-1"
              >
                <option value="CASH">Cash</option>
                <option value="CARD">Credit / Debit Card</option>
                <option value="UPI">UPI</option>
                <option value="NETBANKING">Net Banking</option>
                <option value="HOUSE_ACCOUNT">House Account</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Transaction / Reference ID (Optional)</label>
              <Input
                placeholder="e.g. UPI-198273645"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                className="text-sm mt-1"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setPayModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingPay} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {submittingPay ? "Recording..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Tip Allocation */}
      <Dialog open={tipModalOpen} onOpenChange={setTipModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-amber-500" />
              Tip & Gratuity Allocation
            </DialogTitle>
            <DialogDescription className="text-xs">
              Add or adjust the tip amount for this bill and attribute it to staff or service pool.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAllocateTip} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-foreground">Tip Amount (₹)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                required
                className="text-sm mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Recipient / Pool Name</label>
              <Input
                value={tipRecipient}
                onChange={(e) => setTipRecipient(e.target.value)}
                required
                className="text-sm mt-1"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setTipModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingTip} className="bg-amber-600 hover:bg-amber-700 text-white">
                {submittingTip ? "Allocating..." : "Save Tip"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
