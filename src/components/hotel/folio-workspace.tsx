"use client";

import React, { useState, useEffect, useCallback } from "react";
import { hotelFetch } from "@/lib/hotel/client-auth";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Receipt,
  CreditCard,
  PlusCircle,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Lock,
  Unlock,
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  User,
  BedDouble,
  Clock,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import type { FolioDetailDto, FolioEntryDto } from "@/lib/hotel/folio-service";

interface FolioWorkspaceProps {
  stayId: string;
  onClose?: () => void;
}

export function FolioWorkspace({ stayId, onClose }: FolioWorkspaceProps) {
  const [folio, setFolio] = useState<FolioDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Modal States
  const [chargeModalOpen, setChargeModalOpen] = useState(false);
  const [chargeType, setChargeType] = useState<"ROOM_CHARGE" | "SERVICE_CHARGE" | "TAX">("ROOM_CHARGE");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeDesc, setChargeDesc] = useState("");

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CREDIT_CARD");
  const [paymentRef, setPaymentRef] = useState("");

  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [targetEntryId, setTargetEntryId] = useState<string | undefined>(undefined);

  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundPaymentEntryId, setRefundPaymentEntryId] = useState("");

  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const loadFolio = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await hotelFetch(`/api/v1/hotel/folios/${stayId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to load folio");
      }
      const json = await res.json();
      setFolio(json.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load folio.");
    } finally {
      setLoading(false);
    }
  }, [stayId]);

  useEffect(() => {
    loadFolio();
  }, [loadFolio]);

  // Handle Room / Manual Charge
  const handlePostCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await hotelFetch(`/api/v1/hotel/folios/${stayId}/charges`, {
        method: "POST",
        body: JSON.stringify({
          entryType: chargeType,
          amount: chargeAmount ? parseFloat(chargeAmount) : undefined,
          description: chargeDesc.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to post charge");
      }
      const json = await res.json();
      setFolio(json.data);
      setChargeModalOpen(false);
      setChargeAmount("");
      setChargeDesc("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Charge failed");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Payment Recording
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await hotelFetch(`/api/v1/hotel/folios/${stayId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: parseFloat(paymentAmount),
          paymentMethod,
          referenceNumber: paymentRef.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to record payment");
      }
      const json = await res.json();
      setFolio(json.data);
      setPaymentModalOpen(false);
      setPaymentAmount("");
      setPaymentRef("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Adjustment
  const handlePostAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await hotelFetch(`/api/v1/hotel/folios/${stayId}/adjustments`, {
        method: "POST",
        body: JSON.stringify({
          amount: parseFloat(adjustAmount),
          reason: adjustReason.trim(),
          reversesEntryId: targetEntryId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to post adjustment");
      }
      const json = await res.json();
      setFolio(json.data);
      setAdjustmentModalOpen(false);
      setAdjustAmount("");
      setAdjustReason("");
      setTargetEntryId(undefined);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Adjustment failed");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Refund
  const handleRecordRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await hotelFetch(`/api/v1/hotel/folios/${stayId}/refunds`, {
        method: "POST",
        body: JSON.stringify({
          amount: parseFloat(refundAmount),
          originalPaymentEntryId: refundPaymentEntryId,
          reason: refundReason.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to issue refund");
      }
      const json = await res.json();
      setFolio(json.data);
      setRefundModalOpen(false);
      setRefundAmount("");
      setRefundReason("");
      setRefundPaymentEntryId("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Close Folio
  const handleCloseFolio = async () => {
    setActionLoading(true);
    try {
      const res = await hotelFetch(`/api/v1/hotel/folios/${stayId}/close`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to close folio");
      }
      const json = await res.json();
      setFolio(json.data);
      setCloseConfirmOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Close failed");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reopen Folio
  const handleReopenFolio = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await hotelFetch(`/api/v1/hotel/folios/${stayId}/reopen`, {
        method: "POST",
        body: JSON.stringify({
          reason: reopenReason.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to reopen folio");
      }
      const json = await res.json();
      setFolio(json.data);
      setReopenModalOpen(false);
      setReopenReason("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Reopen failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-emerald-500" />
        <p className="text-sm text-zinc-400">Loading guest folio and ledger records...</p>
      </div>
    );
  }

  if (error || !folio) {
    return (
      <div className="p-8 bg-red-950/20 border border-red-800/40 rounded-xl text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-red-400 mx-auto" />
        <p className="text-red-300 font-medium">{error || "Folio not found."}</p>
        <Button variant="outline" size="sm" onClick={loadFolio}>
          Try Again
        </Button>
      </div>
    );
  }

  const isClosed = folio.status === "CLOSED";
  const numBalance = parseFloat(folio.balanceDue);
  const isSettled = numBalance === 0;

  return (
    <div className="space-y-6">
      {/* Folio Header Card */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono tracking-wider text-emerald-400 uppercase bg-emerald-950/60 border border-emerald-800/50 px-2.5 py-0.5 rounded-full">
                {folio.folioNumber}
              </span>
              <Badge
                variant={isClosed ? "secondary" : "default"}
                className={
                  isClosed
                    ? "bg-zinc-800 text-zinc-400 border-zinc-700"
                    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                }
              >
                {isClosed ? <Lock className="w-3 h-3 mr-1" /> : <Unlock className="w-3 h-3 mr-1" />}
                {folio.status}
              </Badge>
            </div>
            <h2 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
              <Receipt className="w-6 h-6 text-emerald-400" />
              {folio.stay ? `${folio.stay.guestName}'s Folio` : "Guest Folio"}
            </h2>
            {folio.stay && (
              <p className="text-xs text-zinc-400 flex items-center gap-3">
                <span className="flex items-center gap-1 text-zinc-300">
                  <BedDouble className="w-3.5 h-3.5 text-zinc-400" />
                  Room {folio.stay.roomNumber} ({folio.stay.roomTypeName})
                </span>
                <span>•</span>
                <span className="font-mono text-zinc-400">Stay #{folio.stay.stayNumber}</span>
                <span>•</span>
                <span className="text-zinc-400">Status: {folio.stay.status}</span>
              </p>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={loadFolio}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Refresh
            </Button>

            {!isClosed ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setChargeType("ROOM_CHARGE");
                    setChargeModalOpen(true);
                  }}
                  className="border-emerald-800/60 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50"
                >
                  <PlusCircle className="w-3.5 h-3.5 mr-1" />
                  Add Charge
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setPaymentAmount(numBalance > 0 ? numBalance.toFixed(2) : "");
                    setPaymentModalOpen(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                >
                  <CreditCard className="w-3.5 h-3.5 mr-1" />
                  Record Payment
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAdjustmentModalOpen(true)}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                  Adjustment
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCloseConfirmOpen(true)}
                  className="border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                >
                  <Lock className="w-3.5 h-3.5 mr-1" />
                  Close Folio
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setReopenModalOpen(true)}
                className="border-amber-800/50 bg-amber-950/30 text-amber-300 hover:bg-amber-900/50"
              >
                <Unlock className="w-3.5 h-3.5 mr-1" />
                Reopen Folio
              </Button>
            )}
          </div>
        </div>

        {/* Financial KPI Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4">
            <div className="text-xs text-zinc-400 uppercase tracking-wider font-medium flex items-center justify-between">
              <span>Total Charges</span>
              <ArrowUpRight className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-zinc-100 mt-1">
              ₹{parseFloat(folio.totalCharges).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4">
            <div className="text-xs text-zinc-400 uppercase tracking-wider font-medium flex items-center justify-between">
              <span>Total Payments / Credits</span>
              <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              ₹{parseFloat(folio.totalPayments).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div
            className={`border rounded-xl p-4 ${
              numBalance > 0
                ? "bg-amber-950/30 border-amber-800/50"
                : numBalance < 0
                ? "bg-blue-950/30 border-blue-800/50"
                : "bg-emerald-950/20 border-emerald-800/40"
            }`}
          >
            <div className="text-xs uppercase tracking-wider font-medium flex items-center justify-between text-zinc-300">
              <span>Balance Due</span>
              {numBalance === 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400" />
              )}
            </div>
            <div
              className={`text-2xl font-bold font-mono mt-1 ${
                numBalance > 0
                  ? "text-amber-300"
                  : numBalance < 0
                  ? "text-blue-300"
                  : "text-emerald-400"
              }`}
            >
              ₹{numBalance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* Folio Ledger Entries Table */}
      <Card className="bg-zinc-900/90 border-zinc-800 shadow-xl">
        <CardHeader className="pb-3 border-b border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg text-zinc-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                Immutable Financial Ledger ({folio.entries.length} Entries)
              </CardTitle>
              <CardDescription className="text-xs text-zinc-400">
                Audited transactional accounting log. Modifications require compensating adjustment entries.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {folio.entries.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              <Receipt className="w-10 h-10 mx-auto text-zinc-700 mb-2" />
              No financial entries posted yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-xs font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-950/40">
                    <th className="py-3 px-4">Date / Time</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Direction</th>
                    <th className="py-3 px-4 text-right">Amount (₹)</th>
                    {!isClosed && <th className="py-3 px-4 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50 font-sans">
                  {folio.entries.map((entry) => {
                    const isPayment = entry.entryType === "PAYMENT";
                    const isFood = entry.entryType === "FOOD_CHARGE";
                    const isRoom = entry.entryType === "ROOM_CHARGE";
                    const isAdjustment = entry.entryType === "ADJUSTMENT" || entry.entryType === "REVERSAL";
                    const isRefund = entry.entryType === "REFUND";
                    const numAmt = parseFloat(entry.amount);

                    return (
                      <tr
                        key={entry.entryId}
                        className="hover:bg-zinc-800/30 transition-colors group"
                      >
                        <td className="py-3 px-4 text-xs font-mono text-zinc-400 whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={
                              isPayment
                                ? "bg-emerald-950/40 text-emerald-400 border-emerald-800/60"
                                : isFood
                                ? "bg-amber-950/40 text-amber-400 border-amber-800/60"
                                : isRoom
                                ? "bg-blue-950/40 text-blue-400 border-blue-800/60"
                                : isRefund
                                ? "bg-purple-950/40 text-purple-400 border-purple-800/60"
                                : isAdjustment
                                ? "bg-cyan-950/40 text-cyan-400 border-cyan-800/60"
                                : "bg-zinc-800 text-zinc-300 border-zinc-700"
                            }
                          >
                            {isFood && <UtensilsCrossed className="w-3 h-3 mr-1" />}
                            {entry.entryType}
                          </Badge>
                        </td>

                        <td className="py-3 px-4 text-zinc-200">
                          <div className="font-medium text-xs md:text-sm">{entry.description}</div>
                          {entry.reversesEntryId && (
                            <div className="text-[11px] text-zinc-400 font-mono">
                              Reverses: {entry.reversesEntryId.slice(0, 8)}...
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap text-xs font-medium">
                          {entry.direction === "CREDIT" ? (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <ArrowDownLeft className="w-3 h-3" />
                              CREDIT
                            </span>
                          ) : (
                            <span className="text-zinc-300 flex items-center gap-1">
                              <ArrowUpRight className="w-3 h-3" />
                              DEBIT
                            </span>
                          )}
                        </td>

                        <td
                          className={`py-3 px-4 text-right font-mono font-semibold whitespace-nowrap text-xs md:text-sm ${
                            isPayment || numAmt < 0 ? "text-emerald-400" : "text-zinc-100"
                          }`}
                        >
                          {numAmt < 0 ? "-" : "+"}₹
                          {Math.abs(numAmt).toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>

                        {!isClosed && (
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {isPayment ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-950/30"
                                onClick={() => {
                                  setRefundPaymentEntryId(entry.entryId);
                                  setRefundAmount(Math.abs(numAmt).toFixed(2));
                                  setRefundModalOpen(true);
                                }}
                              >
                                <RotateCcw className="w-3 h-3 mr-1" />
                                Refund
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                                onClick={() => {
                                  setTargetEntryId(entry.entryId);
                                  setAdjustAmount((-numAmt).toFixed(2));
                                  setAdjustReason(`Correction for ${entry.entryType}`);
                                  setAdjustmentModalOpen(true);
                                }}
                              >
                                Adjust
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL: Add Charge */}
      <Dialog open={chargeModalOpen} onOpenChange={setChargeModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Post Folio Charge</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Post an authoritative room, service, or facility charge to this guest folio.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePostCharge} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Charge Type</label>
              <select
                value={chargeType}
                onChange={(e) => setChargeType(e.target.value as "ROOM_CHARGE" | "SERVICE_CHARGE" | "TAX")}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
              >
                <option value="ROOM_CHARGE">Room Charge</option>
                <option value="SERVICE_CHARGE">Service / Facility Charge</option>
                <option value="TAX">Tax Charge</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">
                Amount (₹) {chargeType === "ROOM_CHARGE" ? "(Leave empty to use base rate)" : ""}
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder={chargeType === "ROOM_CHARGE" ? "Auto-derived from stay rate" : "e.g. 500.00"}
                value={chargeAmount}
                onChange={(e) => setChargeAmount(e.target.value)}
                className="bg-zinc-950 border-zinc-800 font-mono"
                required={chargeType !== "ROOM_CHARGE"}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Description</label>
              <Input
                placeholder="e.g. Laundry Express Service / Late Checkout"
                value={chargeDesc}
                onChange={(e) => setChargeDesc(e.target.value)}
                className="bg-zinc-950 border-zinc-800"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setChargeModalOpen(false)}
                className="border-zinc-700 text-zinc-300"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={actionLoading} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                {actionLoading ? "Posting..." : "Confirm Charge"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Record Payment */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Record Folio Payment</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Record a payment received from the guest to credit against the outstanding folio balance.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Payment Amount (₹)</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="e.g. 2500.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="bg-zinc-950 border-zinc-800 font-mono text-emerald-400"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200"
              >
                <option value="CREDIT_CARD">Credit Card</option>
                <option value="DEBIT_CARD">Debit Card</option>
                <option value="UPI">UPI / Digital QR</option>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="ROOM_CREDIT">Room Credit</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Reference / Transaction ID</label>
              <Input
                placeholder="e.g. TXN-8849102 / UPI Ref"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                className="bg-zinc-950 border-zinc-800 font-mono"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPaymentModalOpen(false)}
                className="border-zinc-700 text-zinc-300"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={actionLoading} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                {actionLoading ? "Recording..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Post Adjustment */}
      <Dialog open={adjustmentModalOpen} onOpenChange={setAdjustmentModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Post Ledger Adjustment</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Create a compensating adjustment entry. Enter a negative amount for a credit reduction or a positive amount for an additional charge.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePostAdjustment} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">
                Adjustment Amount (₹) — (Use negative for credit deduction)
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g. -250.00"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className="bg-zinc-950 border-zinc-800 font-mono"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Documented Reason (Mandatory)</label>
              <Input
                placeholder="e.g. Manager courtesy discount / Room service spill waiver"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="bg-zinc-950 border-zinc-800"
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAdjustmentModalOpen(false)}
                className="border-zinc-700 text-zinc-300"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={actionLoading} className="bg-cyan-600 hover:bg-cyan-500 text-white">
                {actionLoading ? "Posting..." : "Post Adjustment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Issue Refund */}
      <Dialog open={refundModalOpen} onOpenChange={setRefundModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Issue Payment Refund</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Issue an audited refund referencing the original payment ledger entry.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecordRefund} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Refund Amount (₹)</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="e.g. 500.00"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="bg-zinc-950 border-zinc-800 font-mono text-purple-300"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Refund Reason (Mandatory)</label>
              <Input
                placeholder="e.g. Early checkout / deposit return"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="bg-zinc-950 border-zinc-800"
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRefundModalOpen(false)}
                className="border-zinc-700 text-zinc-300"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={actionLoading} className="bg-purple-600 hover:bg-purple-500 text-white">
                {actionLoading ? "Processing..." : "Confirm Refund"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Close Folio Confirmation */}
      <Dialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Close Hotel Folio</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Closing this folio seals it against ordinary new charges. Outstanding balance: ₹{folio.balanceDue}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCloseConfirmOpen(false)}
              className="border-zinc-700 text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCloseFolio}
              disabled={actionLoading}
              className="bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700"
            >
              {actionLoading ? "Closing..." : "Confirm Close Folio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Reopen Folio */}
      <Dialog open={reopenModalOpen} onOpenChange={setReopenModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Reopen Closed Folio</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Reopening a closed folio is an audited exception process requiring a documented reason.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReopenFolio} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-zinc-300 block mb-1">Reason for Reopening (Mandatory)</label>
              <Input
                placeholder="e.g. Late post-checkout minibar / room service charge adjustment"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                className="bg-zinc-950 border-zinc-800"
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReopenModalOpen(false)}
                className="border-zinc-700 text-zinc-300"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={actionLoading} className="bg-amber-600 hover:bg-amber-500 text-white">
                {actionLoading ? "Reopening..." : "Authorize Reopen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
