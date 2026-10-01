"use client";

import React, { useState, useEffect } from "react";
import { RestaurantNav } from "@/components/restaurant/restaurant-nav";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Percent,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Calculator,
  ArrowRight,
} from "lucide-react";

export default function RestaurantSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [savingTax, setSavingTax] = useState(false);
  const [savingFee, setSavingFee] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // GST State (percentage: 5 = 5%)
  const [taxPercent, setTaxPercent] = useState<string>("5.00");
  const [taxEnabled, setTaxEnabled] = useState<boolean>(true);
  const [taxName, setTaxName] = useState<string>("GST");

  // Platform Fee State
  const [feeType, setFeeType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [feePercent, setFeePercent] = useState<string>("2.00");
  const [fixedAmount, setFixedAmount] = useState<string>("0.00");
  const [feeEnabled, setFeeEnabled] = useState<boolean>(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(true); // default true for workspace admin demo

  // Simulator
  const [simSubtotal, setSimSubtotal] = useState<number>(500);

  const fetchConfigs = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [taxRes, feeRes] = await Promise.all([
        fetch("/api/v1/restaurant/admin/tax-config"),
        fetch("/api/v1/restaurant/admin/platform-fee-config"),
      ]);

      const taxJson = await taxRes.json();
      if (taxJson.success && taxJson.data) {
        setTaxPercent((taxJson.data.taxRate * 100).toFixed(2));
        setTaxEnabled(taxJson.data.isEnabled);
        setTaxName(taxJson.data.taxName || "GST");
      }

      const feeJson = await feeRes.json();
      if (feeJson.success && feeJson.data) {
        setFeeType(feeJson.data.feeType);
        setFeePercent((feeJson.data.feeRate * 100).toFixed(2));
        setFixedAmount(feeJson.data.fixedAmount?.toFixed(2) || "0.00");
        setFeeEnabled(feeJson.data.isEnabled);
      }
    } catch {
      setErrorMsg("Failed to load financial configurations from server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleSaveTax = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTax(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const rateNum = parseFloat(taxPercent) / 100;
      if (isNaN(rateNum) || rateNum < 0 || rateNum > 1.0) {
        throw new Error("GST percentage must be between 0% and 100%.");
      }

      const res = await fetch("/api/v1/restaurant/admin/tax-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxRate: rateNum,
          taxName,
          isEnabled: taxEnabled,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg("Outlet GST tax configuration saved successfully!");
      } else {
        setErrorMsg(json.error?.message || "Failed to update tax configuration.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred.");
    } finally {
      setSavingTax(false);
    }
  };

  const handleSaveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingFee(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const feeRateNum = parseFloat(feePercent) / 100;
      const fixedAmountNum = parseFloat(fixedAmount);

      const res = await fetch("/api/v1/restaurant/admin/platform-fee-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeType,
          feeRate: feeRateNum,
          fixedAmount: fixedAmountNum,
          isEnabled: feeEnabled,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg("ASSO platform fee configuration updated successfully!");
      } else {
        setErrorMsg(json.error?.message || "Failed to update platform fee.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred.");
    } finally {
      setSavingFee(false);
    }
  };

  // Simulator math
  const rateFactor = taxEnabled ? (parseFloat(taxPercent) || 0) / 100 : 0;
  const simTax = Math.round((simSubtotal * rateFactor + Number.EPSILON) * 100) / 100;

  let simFee = 0;
  if (feeEnabled) {
    if (feeType === "PERCENTAGE") {
      const fFactor = (parseFloat(feePercent) || 0) / 100;
      simFee = Math.round((simSubtotal * fFactor + Number.EPSILON) * 100) / 100;
    } else {
      simFee = parseFloat(fixedAmount) || 0;
    }
  }
  const simTotal = Math.round((simSubtotal + simTax + simFee + Number.EPSILON) * 100) / 100;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <RestaurantNav />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Financial Settings & Tax Policies
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure server-authoritative GST rates and platform fee rules. All orders freeze immutable price snapshots at transaction commit.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchConfigs}
            disabled={loading}
            className="self-start sm:self-auto gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Alerts */}
        {successMsg && (
          <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Configuration Updated</AlertTitle>
            <AlertDescription>{successMsg}</AlertDescription>
          </Alert>
        )}
        {errorMsg && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Action Blocked</AlertTitle>
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Section 1: Business GST Tax Configuration */}
          <Card className="border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-amber-500" />
                  Restaurant GST Policy
                </CardTitle>
                <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/5 text-xs">
                  Business Admin
                </Badge>
              </div>
              <CardDescription>
                Sets the authoritative Goods and Services Tax applied to dining orders in this outlet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveTax} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Tax Name / Label
                  </label>
                  <Input
                    value={taxName}
                    onChange={(e) => setTaxName(e.target.value)}
                    placeholder="e.g. GST"
                    className="font-medium"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    GST Rate Percentage (%)
                  </label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={taxPercent}
                      onChange={(e) => setTaxPercent(e.target.value)}
                      className="pr-8 font-mono text-base"
                      required
                    />
                    <Percent className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    {["0", "5", "12", "18", "28"].map((pct) => (
                      <button
                        type="button"
                        key={pct}
                        onClick={() => setTaxPercent(pct)}
                        className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                          taxPercent === pct
                            ? "bg-amber-500/20 border-amber-500 text-amber-600 dark:text-amber-400 font-bold"
                            : "border-border hover:bg-muted text-muted-foreground"
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div>
                    <p className="text-sm font-medium">Apply GST to Orders</p>
                    <p className="text-xs text-muted-foreground">If disabled, 0% tax is calculated.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={taxEnabled}
                    onChange={(e) => setTaxEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-amber-600 focus:ring-amber-500"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={savingTax || loading}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium"
                >
                  {savingTax ? "Saving Changes..." : "Save GST Configuration"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Section 2: Platform Fee Configuration */}
          <Card className="border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-indigo-500" />
                  ASSO Platform Fee
                </CardTitle>
                <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/5 text-xs">
                  Super Admin
                </Badge>
              </div>
              <CardDescription>
                Configures the ASSO platform convenience fee. Ordinary staff and managers cannot alter this rate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveFee} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Fee Charge Model
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={feeType === "PERCENTAGE" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFeeType("PERCENTAGE")}
                      className={feeType === "PERCENTAGE" ? "bg-indigo-600 text-white" : ""}
                    >
                      Percentage (%)
                    </Button>
                    <Button
                      type="button"
                      variant={feeType === "FIXED" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFeeType("FIXED")}
                      className={feeType === "FIXED" ? "bg-indigo-600 text-white" : ""}
                    >
                      Flat Fixed (₹)
                    </Button>
                  </div>
                </div>

                {feeType === "PERCENTAGE" ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Platform Fee Percentage (%)
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={feePercent}
                        onChange={(e) => setFeePercent(e.target.value)}
                        className="pr-8 font-mono text-base"
                        required
                      />
                      <Percent className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Fixed Fee Amount (₹)
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={fixedAmount}
                      onChange={(e) => setFixedAmount(e.target.value)}
                      className="font-mono text-base"
                      required
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div>
                    <p className="text-sm font-medium">Enable Platform Fee</p>
                    <p className="text-xs text-muted-foreground">If disabled, ₹0 fee is applied.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={feeEnabled}
                    onChange={(e) => setFeeEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={savingFee || loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                >
                  {savingFee ? "Saving Fee..." : "Save Platform Fee"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Section 3: Live Real-Time Calculation Simulator */}
          <Card className="border-border shadow-sm bg-card/60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-emerald-500" />
                  Live Order Simulator
                </CardTitle>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/5 text-xs">
                  Realtime Math
                </Badge>
              </div>
              <CardDescription>
                Simulates how server-side authority calculates order totals without binary floating-point errors.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Test Item Subtotal (₹)
                </label>
                <Input
                  type="number"
                  min="0"
                  step="10"
                  value={simSubtotal}
                  onChange={(e) => setSimSubtotal(parseFloat(e.target.value) || 0)}
                  className="font-mono text-base"
                />
              </div>

              <div className="p-4 rounded-lg bg-muted/40 border border-border space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Food Items Subtotal:</span>
                  <span className="font-mono font-medium text-foreground">₹{simSubtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    GST ({taxEnabled ? `${taxPercent}%` : "Disabled"}):
                  </span>
                  <span className="font-mono font-medium text-amber-500">+₹{simTax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    ASSO Platform Fee ({feeEnabled ? (feeType === "PERCENTAGE" ? `${feePercent}%` : "Fixed") : "Disabled"}):
                  </span>
                  <span className="font-mono font-medium text-indigo-400">+₹{simFee.toFixed(2)}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between font-bold text-base">
                  <span>Final Payable Total:</span>
                  <span className="font-mono text-emerald-500">₹{simTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground/80 space-y-1 pt-1">
                <p className="flex items-center gap-1 font-semibold text-foreground">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  Immutability Invariant:
                </p>
                <p>
                  Calculated GST and Platform Fee rates are permanently snapshotted into PostgreSQL order columns at transaction commit. Subsequent rate updates will never alter historical receipts.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
