"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  UtensilsCrossed,
  Grid3X3,
  Users,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  QrCode,
  ArrowRight,
  TrendingUp,
  Percent,
  Layers,
  Armchair,
  ChevronRight,
  X,
  Play,
  Check,
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

interface TableSummaryData {
  totalTables: number;
  availableTables: number;
  occupiedTables: number;
  reservedTables: number;
  cleaningTables: number;
  outOfServiceTables: number;
  totalCapacity: number;
  activeSessionsCount: number;
  occupancyRatePct: number;
  sectionBreakdown: Array<{
    section: string;
    total: number;
    available: number;
    occupied: number;
  }>;
}

interface TableItem {
  tableId: string;
  tableNumber: string;
  displayLabel: string;
  capacity: number;
  section: string;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING" | "OUT_OF_SERVICE";
  isActive: boolean;
  activeSession?: {
    sessionId: string;
    sessionNumber: string;
    guestCount: number;
    customerName?: string | null;
    customerPhone?: string | null;
    openedAt: string;
    notes?: string | null;
  } | null;
  hasActiveQr: boolean;
  qrTokenId?: string | null;
  qrOpaqueToken?: string | null;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  AVAILABLE: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800/50",
    badge: "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border-emerald-300",
  },
  OCCUPIED: {
    bg: "bg-indigo-50 dark:bg-indigo-950/30",
    text: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-200 dark:border-indigo-800/50",
    badge: "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 border-indigo-300",
  },
  RESERVED: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800/50",
    badge: "bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border-amber-300",
  },
  CLEANING: {
    bg: "bg-rose-50 dark:bg-rose-950/30",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-200 dark:border-rose-800/50",
    badge: "bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 border-rose-300",
  },
  OUT_OF_SERVICE: {
    bg: "bg-slate-100 dark:bg-slate-900/50",
    text: "text-slate-600 dark:text-slate-400",
    border: "border-slate-300 dark:border-slate-800",
    badge: "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-400",
  },
};

export default function RestaurantDashboardPage() {
  const [summary, setSummary] = useState<TableSummaryData | null>(null);
  const [tables, setTables] = useState<TableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [selectedSection, setSelectedSection] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  // Dialog States
  const [openSessionModalTable, setOpenSessionModalTable] = useState<TableItem | null>(null);
  const [guestCount, setGuestCount] = useState<number>(2);
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [sessionNotes, setSessionNotes] = useState<string>("");
  const [submittingSession, setSubmittingSession] = useState(false);

  const [closeSessionModalTable, setCloseSessionModalTable] = useState<TableItem | null>(null);
  const [nextTableStatus, setNextTableStatus] = useState<"CLEANING" | "AVAILABLE">("CLEANING");
  const [closingSession, setClosingSession] = useState(false);

  const [qrModalTable, setQrModalTable] = useState<TableItem | null>(null);
  const [qrData, setQrData] = useState<{ qrSvgDataUri: string; qrUrl: string; opaqueToken: string } | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  // Fetch Dashboard & Tables Data
  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [sumRes, tabRes] = await Promise.all([
        fetch("/api/v1/restaurant/tables/summary"),
        fetch("/api/v1/restaurant/tables"),
      ]);

      const sumJson = await sumRes.json();
      const tabJson = await tabRes.json();

      if (sumJson.success && tabJson.success) {
        setSummary(sumJson.data);
        setTables(tabJson.data);
      } else {
        setError(sumJson.error?.message || tabJson.error?.message || "Failed to load restaurant data.");
      }
    } catch (err: any) {
      setError("Network or server connection failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime SSE Listener
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/v1/realtime");
      eventSource.addEventListener("restaurant:table_updated", () => {
        fetchData();
      });
      eventSource.addEventListener("restaurant:table_created", () => {
        fetchData();
      });
    } catch {
      // Graceful fallback to manual refresh
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [fetchData]);

  // Quick Status Transition Handler
  const handleQuickStatusChange = async (tableId: string, status: string, reason?: string) => {
    try {
      const res = await fetch(`/api/v1/restaurant/tables/${tableId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason }),
      });
      const json = await res.json();
      if (json.success) {
        fetchData();
      } else {
        alert("Status change failed: " + (json.error?.message || "Unknown error"));
      }
    } catch (err) {
      alert("Error contacting server");
    }
  };

  // Open Dining Session Handler
  const handleOpenSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openSessionModalTable) return;
    setSubmittingSession(true);
    try {
      const res = await fetch("/api/v1/restaurant/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: openSessionModalTable.tableId,
          guestCount,
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          notes: sessionNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setOpenSessionModalTable(null);
        setCustomerName("");
        setCustomerPhone("");
        setSessionNotes("");
        fetchData();
      } else {
        alert("Failed to open session: " + (json.error?.message || "Unknown error"));
      }
    } catch (err) {
      alert("Error submitting session to server");
    } finally {
      setSubmittingSession(false);
    }
  };

  // Close Dining Session Handler
  const handleCloseSession = async () => {
    if (!closeSessionModalTable || !closeSessionModalTable.activeSession) return;
    setClosingSession(true);
    try {
      const res = await fetch(
        `/api/v1/restaurant/sessions/${closeSessionModalTable.activeSession.sessionId}/close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nextTableStatus }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setCloseSessionModalTable(null);
        fetchData();
      } else {
        alert("Failed to close session: " + (json.error?.message || "Unknown error"));
      }
    } catch (err) {
      alert("Error closing session on server");
    } finally {
      setClosingSession(false);
    }
  };

  // Fetch QR Code for modal
  const openQrModal = async (table: TableItem) => {
    setQrModalTable(table);
    setLoadingQr(true);
    setQrData(null);
    try {
      const res = await fetch(`/api/v1/restaurant/tables/${table.tableId}/qr`);
      const json = await res.json();
      if (json.success) {
        setQrData({
          qrSvgDataUri: json.data.qrSvgDataUri,
          qrUrl: json.data.qrUrl,
          opaqueToken: json.data.opaqueToken,
        });
      }
    } catch {
      // Failed loading QR
    } finally {
      setLoadingQr(false);
    }
  };

  // Sections list for filtering
  const sections = Array.from(new Set(tables.map((t) => t.section))).filter(Boolean);

  // Filtered Tables
  const filteredTables = tables.filter((t) => {
    if (selectedSection !== "ALL" && t.section !== selectedSection) return false;
    if (selectedStatus !== "ALL" && t.status !== selectedStatus) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-display">
              Restaurant Operations
            </h1>
            <Badge className="bg-amber-600/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs">
              Live Floor Console
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Realtime dining room monitoring, table seating, controlled turnover transitions, and guest QR context.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Link href="/restaurant/tables">
            <Button className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center gap-2">
              <Grid3X3 className="h-4 w-4" />
              Manage All Tables
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Operations Alert</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 6 Key Operational Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Metric 1: Total Tables */}
        <Card className="border-border shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-medium">Total Tables</CardDescription>
            <CardTitle className="text-2xl font-bold font-display text-foreground">
              {summary?.totalTables ?? "--"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Armchair className="h-3 w-3" /> {summary?.totalCapacity ?? 0} seats total
            </span>
          </CardContent>
        </Card>

        {/* Metric 2: Available */}
        <Card className="border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/10 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              Available
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-display text-emerald-800 dark:text-emerald-300">
              {summary?.availableTables ?? "--"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
              <CheckCircle2 className="h-3 w-3" /> Ready for seating
            </span>
          </CardContent>
        </Card>

        {/* Metric 3: Occupied */}
        <Card className="border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/10 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-medium text-indigo-700 dark:text-indigo-400">
              Occupied
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-display text-indigo-800 dark:text-indigo-300">
              {summary?.occupiedTables ?? "--"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <span className="text-[11px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1 font-medium">
              <Users className="h-3 w-3" /> {summary?.activeSessionsCount ?? 0} active sessions
            </span>
          </CardContent>
        </Card>

        {/* Metric 4: Reserved */}
        <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/10 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-medium text-amber-700 dark:text-amber-400">
              Reserved
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-display text-amber-800 dark:text-amber-300">
              {summary?.reservedTables ?? "--"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Upcoming arrivals
            </span>
          </CardContent>
        </Card>

        {/* Metric 5: Cleaning */}
        <Card className="border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/10 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-medium text-rose-700 dark:text-rose-400">
              Cleaning
            </CardDescription>
            <CardTitle className="text-2xl font-bold font-display text-rose-800 dark:text-rose-300">
              {summary?.cleaningTables ?? "--"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <span className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1 font-medium">
              <Sparkles className="h-3 w-3" /> Bussing required
            </span>
          </CardContent>
        </Card>

        {/* Metric 6: Out of Service */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-medium">Out of Service</CardDescription>
            <CardTitle className="text-2xl font-bold font-display text-muted-foreground">
              {summary?.outOfServiceTables ?? "--"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Maintenance / hold
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Operational Floor Plan / Table Live Grid */}
      <div className="space-y-4">
        {/* Filtering & Section Tabs */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
            <button
              onClick={() => setSelectedSection("ALL")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedSection === "ALL"
                  ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              All Sections ({tables.length})
            </button>
            {sections.map((sec) => (
              <button
                key={sec}
                onClick={() => setSelectedSection(sec)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  selectedSection === sec
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {sec} ({tables.filter((t) => t.section === sec).length})
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Filter Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-card border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="OCCUPIED">Occupied</option>
              <option value="RESERVED">Reserved</option>
              <option value="CLEANING">Cleaning</option>
              <option value="OUT_OF_SERVICE">Out of Service</option>
            </select>
          </div>
        </div>

        {/* Live Table Cards Grid */}
        {filteredTables.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-xl bg-card">
            <Armchair className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
            <h3 className="text-base font-semibold text-foreground">No tables match current filters</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Try adjusting your section or status filters, or create new tables in Table Management.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredTables.map((table) => {
              const colors = STATUS_COLORS[table.status] || STATUS_COLORS.AVAILABLE;
              const hasSession = !!table.activeSession;

              return (
                <div
                  key={table.tableId}
                  className={`rounded-xl border p-4 transition-all duration-200 hover:shadow-md flex flex-col justify-between ${colors.border} ${colors.bg}`}
                >
                  {/* Top: Table Number & Status */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold font-display text-foreground">
                            {table.tableNumber}
                          </span>
                          <Badge variant="outline" className={`text-[10px] font-semibold uppercase ${colors.badge}`}>
                            {table.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{table.displayLabel}</p>
                      </div>

                      <button
                        onClick={() => openQrModal(table)}
                        className="p-1.5 rounded-lg bg-card/80 hover:bg-card border border-border shadow-xs text-muted-foreground hover:text-foreground transition-colors"
                        title="View & Print Table QR Code"
                      >
                        <QrCode className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-mono">
                        <Users className="h-3 w-3" /> {table.capacity} Seats
                      </span>
                      <span>•</span>
                      <span>{table.section}</span>
                    </div>

                    {/* Active Session Info if Occupied */}
                    {hasSession && (
                      <div className="mt-3 p-2.5 rounded-lg bg-card/90 border border-indigo-200/80 dark:border-indigo-900/60 shadow-xs space-y-1">
                        <div className="flex items-center justify-between text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                          <span>Party of {table.activeSession!.guestCount}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {table.activeSession!.sessionNumber}
                          </span>
                        </div>
                        {table.activeSession!.customerName && (
                          <p className="text-xs text-foreground font-medium truncate">
                            {table.activeSession!.customerName}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          Seated at {new Date(table.activeSession!.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Quick Action Footer */}
                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                    {table.status === "AVAILABLE" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => {
                            setOpenSessionModalTable(table);
                            setGuestCount(table.capacity > 2 ? 2 : table.capacity);
                          }}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-8"
                        >
                          Seat Walk-in
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleQuickStatusChange(table.tableId, "RESERVED")}
                          className="text-xs h-8 px-2.5"
                          title="Hold for Reservation"
                        >
                          Reserve
                        </Button>
                      </>
                    )}

                    {table.status === "OCCUPIED" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setCloseSessionModalTable(table);
                          setNextTableStatus("CLEANING");
                        }}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold h-8"
                      >
                        Vacate & Clear
                      </Button>
                    )}

                    {table.status === "RESERVED" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => {
                            setOpenSessionModalTable(table);
                            setGuestCount(table.capacity);
                          }}
                          className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold h-8"
                        >
                          Seat Guests
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleQuickStatusChange(table.tableId, "AVAILABLE", "Reservation released")}
                          className="text-xs h-8 px-2.5"
                          title="Cancel Reservation"
                        >
                          Release
                        </Button>
                      </>
                    )}

                    {table.status === "CLEANING" && (
                      <Button
                        size="sm"
                        onClick={() => handleQuickStatusChange(table.tableId, "AVAILABLE", "Table cleaned and reset")}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-8 flex items-center justify-center gap-1.5"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Mark Ready
                      </Button>
                    )}

                    {table.status === "OUT_OF_SERVICE" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleQuickStatusChange(table.tableId, "AVAILABLE", "Service restored")}
                        className="w-full text-xs h-8"
                      >
                        Restore Service
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Open Dining Session */}
      <Dialog
        open={!!openSessionModalTable}
        onOpenChange={(open) => !open && setOpenSessionModalTable(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5 text-amber-600" />
              Seat Party — Table {openSessionModalTable?.tableNumber}
            </DialogTitle>
            <DialogDescription>
              Open an active dining session for this physical table. This will transition the table status to OCCUPIED.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleOpenSession} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Guest Count *</label>
              <Input
                type="number"
                min={1}
                max={openSessionModalTable?.capacity ? openSessionModalTable.capacity * 2 : 20}
                value={guestCount}
                onChange={(e) => setGuestCount(parseInt(e.target.value, 10) || 1)}
                required
              />
              <span className="text-[11px] text-muted-foreground">
                Table capacity is {openSessionModalTable?.capacity || 4} guests.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Customer Name (Optional)</label>
              <Input
                placeholder="e.g. Rahul Sharma"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Customer Phone (Optional)</label>
              <Input
                placeholder="e.g. +91 98765 43210"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Special Notes / Dietary Requirements</label>
              <Input
                placeholder="e.g. Anniversary dinner, high chair needed"
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenSessionModalTable(null)}
                disabled={submittingSession}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                disabled={submittingSession}
              >
                {submittingSession ? "Seating..." : "Confirm & Seat Party"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Close Dining Session */}
      <Dialog
        open={!!closeSessionModalTable}
        onOpenChange={(open) => !open && setCloseSessionModalTable(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Dining Session — Table {closeSessionModalTable?.tableNumber}</DialogTitle>
            <DialogDescription>
              Mark dining session {closeSessionModalTable?.activeSession?.sessionNumber} as completed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="p-3 rounded-lg bg-muted text-xs space-y-1">
              <p className="font-semibold text-foreground">
                Party: {closeSessionModalTable?.activeSession?.customerName || "Walk-in Party"} (
                {closeSessionModalTable?.activeSession?.guestCount} guests)
              </p>
              <p className="text-muted-foreground">
                Seated:{" "}
                {closeSessionModalTable?.activeSession?.openedAt
                  ? new Date(closeSessionModalTable.activeSession.openedAt).toLocaleTimeString()
                  : ""}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">Next Table State</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNextTableStatus("CLEANING")}
                  className={`p-3 rounded-lg border text-left text-xs transition-colors ${
                    nextTableStatus === "CLEANING"
                      ? "border-rose-500 bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200 font-semibold ring-1 ring-rose-500"
                      : "border-border hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <p className="font-medium text-foreground">Needs Cleaning (Recommended)</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Table needs bussing & sanitizing</p>
                </button>

                <button
                  type="button"
                  onClick={() => setNextTableStatus("AVAILABLE")}
                  className={`p-3 rounded-lg border text-left text-xs transition-colors ${
                    nextTableStatus === "AVAILABLE"
                      ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200 font-semibold ring-1 ring-emerald-500"
                      : "border-border hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <p className="font-medium text-foreground">Directly Available</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Already clean, ready for next party</p>
                </button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCloseSessionModalTable(null)}
              disabled={closingSession}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCloseSession}
              disabled={closingSession}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              {closingSession ? "Closing..." : "Close Session & Update Table"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: View Table QR Code */}
      <Dialog
        open={!!qrModalTable}
        onOpenChange={(open) => !open && setQrModalTable(null)}
      >
        <DialogContent className="sm:max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>Table {qrModalTable?.tableNumber} QR Code</DialogTitle>
            <DialogDescription>
              {qrModalTable?.displayLabel} • {qrModalTable?.section}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 flex flex-col items-center justify-center space-y-3">
            {loadingQr ? (
              <div className="h-52 w-52 rounded-xl border border-dashed flex items-center justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : qrData ? (
              <>
                <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-200 inline-block">
                  <img
                    src={qrData.qrSvgDataUri}
                    alt={`QR Code for Table ${qrModalTable?.tableNumber}`}
                    className="h-48 w-48"
                  />
                </div>
                <div className="space-y-1 w-full text-left bg-muted p-2.5 rounded-lg text-xs">
                  <p className="font-semibold text-foreground">Context Resolution:</p>
                  <p className="text-muted-foreground font-mono truncate text-[11px]">
                    {qrData.qrUrl}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">QR code could not be loaded.</p>
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            <Link
              href={qrData?.qrUrl || "#"}
              target="_blank"
              className="text-xs text-amber-600 hover:underline flex items-center gap-1"
            >
              Test Customer Experience <ArrowRight className="h-3 w-3" />
            </Link>
            <Button variant="outline" size="sm" onClick={() => setQrModalTable(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
