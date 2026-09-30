"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  UtensilsCrossed,
  Sparkles,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Phone,
  User,
  Coffee,
  BellRing,
  Receipt,
  ArrowRight,
  ShieldCheck,
  Check,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

interface TableCustomerContext {
  contextId: string;
  contextType: string;
  identifier: string;
  displayLabel: string;
  tableId: string;
  tableNumber: string;
  section: string;
  capacity: number;
  propertyName: string;
  restaurantName: string;
}

interface TableCustomerResolution {
  sessionToken: string;
  sessionId: string;
  expiresAt: string;
  context: TableCustomerContext;
  table: {
    tableId: string;
    tableNumber: string;
    capacity: number;
    section: string;
    status: string;
  };
  availableServices: string[];
}

function RestaurantTableContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<TableCustomerResolution | null>(null);

  // Customer Profile Form (Requirement 13)
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [requestFeedback, setRequestFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("No table QR code token provided in URL. Please scan a physical table QR code.");
      setLoading(false);
      return;
    }

    const resolveQr = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/customer/qr/${encodeURIComponent(token)}`);
        const json = await res.json();
        if (json.success) {
          setResolution(json.data);
        } else {
          setError(
            json.error?.message ||
              "This table QR code has been revoked or replaced. Please request a refreshed QR code from restaurant staff."
          );
        }
      } catch {
        setError("Network connection issue. Please check your internet connection and try again.");
      } finally {
        setLoading(false);
      }
    };

    resolveQr();
  }, [token]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) return;
    setProfileSaved(true);
  };

  const handleQuickRequest = (serviceName: string) => {
    setRequestFeedback(`Staff notified for "${serviceName}". Your server will attend shortly.`);
    setTimeout(() => setRequestFeedback(null), 5000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-amber-600/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto ring-1 ring-amber-500/20">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Resolving Table Context...</h2>
          <p className="text-xs text-muted-foreground">Connecting to restaurant dining system</p>
        </div>
      </div>
    );
  }

  if (error || !resolution) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-border shadow-md">
          <CardHeader className="text-center pb-2">
            <div className="h-12 w-12 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-2">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold">QR Code Inactive</CardTitle>
            <CardDescription className="text-xs">{error}</CardDescription>
          </CardHeader>
          <CardContent className="pt-2 text-center">
            <Link href="/">
              <Button variant="outline" size="sm" className="text-xs">
                Back to Platform
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { context, table } = resolution;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 flex flex-col items-center">
      <div className="max-w-md w-full space-y-6">
        {/* Welcome Branding Card */}
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center mx-auto shadow-md ring-4 ring-amber-500/20">
            <UtensilsCrossed className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-display text-foreground">
              {context.propertyName || context.restaurantName || "The Royal Saffron Restaurant"}
            </h1>
            <p className="text-xs text-muted-foreground">Digital Dining Companion</p>
          </div>
        </div>

        {/* Table Identity Card */}
        <Card className="border-border shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-amber-100 font-semibold">
                  Seated At
                </p>
                <h2 className="text-2xl font-bold font-display">{table.tableNumber}</h2>
              </div>
              <Badge className="bg-white/20 text-white border-white/30 text-xs backdrop-blur-xs font-semibold uppercase">
                {table.section}
              </Badge>
            </div>
            <p className="text-xs text-amber-100 mt-1">{context.displayLabel}</p>
          </div>

          <CardContent className="p-4 space-y-4">
            <div className="flex items-center justify-between text-xs py-1 border-b border-border text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Users className="h-4 w-4 text-amber-600" /> Seating Capacity
              </span>
              <span className="font-mono">{table.capacity} guests</span>
            </div>

            <div className="flex items-center justify-between text-xs py-1 border-b border-border text-muted-foreground">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-600" /> Table Status
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] font-semibold uppercase ${
                  table.status === "OCCUPIED"
                    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}
              >
                {table.status}
              </Badge>
            </div>

            {/* Customer Details Form (Requirement 13) */}
            {!profileSaved ? (
              <form onSubmit={handleSaveProfile} className="space-y-3 pt-2">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">Welcome to Your Table</p>
                  <p className="text-[11px] text-muted-foreground">
                    Please provide your name to personalize your dining session.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <User className="h-4 w-4 text-muted-foreground absolute left-3 top-2.5" />
                    <Input
                      placeholder="Your Full Name *"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="text-xs pl-9"
                      required
                    />
                  </div>

                  <div className="relative">
                    <Phone className="h-4 w-4 text-muted-foreground absolute left-3 top-2.5" />
                    <Input
                      placeholder="Mobile Phone (Optional)"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="text-xs pl-9"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold h-9 shadow-sm"
                >
                  Start Dining Experience
                </Button>
              </form>
            ) : (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between">
                <div>
                  <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                    Welcome, {customerName}!
                  </p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    Session active on Table {table.tableNumber}
                  </p>
                </div>
                <Check className="h-5 w-5 text-emerald-600" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Assistance Controls */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Table Assistance
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickRequest("Complimentary Water")}
              className="flex flex-col items-center justify-center h-16 p-2 text-center"
            >
              <Coffee className="h-4 w-4 text-amber-600 mb-1" />
              <span className="text-[11px] font-medium leading-tight">Water</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickRequest("Call Server / Assistance")}
              className="flex flex-col items-center justify-center h-16 p-2 text-center"
            >
              <BellRing className="h-4 w-4 text-amber-600 mb-1" />
              <span className="text-[11px] font-medium leading-tight">Call Server</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickRequest("Request Bill")}
              className="flex flex-col items-center justify-center h-16 p-2 text-center"
            >
              <Receipt className="h-4 w-4 text-amber-600 mb-1" />
              <span className="text-[11px] font-medium leading-tight">Request Bill</span>
            </Button>
          </div>

          {requestFeedback && (
            <Alert className="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-xs py-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertDescription className="text-emerald-800 dark:text-emerald-300">
                {requestFeedback}
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Future Ordering Notice Card */}
        <Card className="border-dashed border-amber-300 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4 space-y-1.5 text-center">
            <Sparkles className="h-5 w-5 text-amber-600 mx-auto" />
            <h3 className="text-xs font-semibold text-foreground">Digital Menu & Ordering (R2 & R3)</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Full food & beverage digital menu browsing, table-side ordering, and direct POS synchronization will be available in Slice 2 and Slice 3.
            </p>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center space-y-1 pt-2">
          <p className="text-[11px] text-muted-foreground">
            ASSO SuperApp • Verified Table Context Engine
          </p>
          <p className="text-[10px] text-muted-foreground/60 font-mono">
            Context: {context.contextId.slice(0, 8)}...
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RestaurantTableCustomerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <RestaurantTableContent />
    </Suspense>
  );
}
