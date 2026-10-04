"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  MonitorPlay,
  Flame,
  Coffee,
  IceCream,
  Wine,
  UtensilsCrossed,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Play,
  Check,
  RotateCcw,
  Sparkles,
  RefreshCw,
  Plus,
  Sliders,
  Filter,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  Radio,
  X,
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

interface KitchenStation {
  stationId: string;
  outletId?: string;
  code: string;
  name: string;
  description?: string | null;
  displayOrder: number;
  isActive: boolean;
}

interface KdsItem {
  taskId: string;
  orderItemId: string;
  itemName: string;
  quantity: number;
  stationRouting: string;
  taskStatus: "PENDING" | "PREPARING" | "READY" | "DONE" | "CANCELLED";
  priority: "NORMAL" | "PRIORITY" | "URGENT";
  startedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  specialNotes: string | null;
  elapsedPrepSeconds: number;
}

interface KdsTicketCard {
  orderId: string;
  orderNumber: string;
  destination: string;
  diningContext: string;
  priority: "NORMAL" | "PRIORITY" | "URGENT";
  orderStatus: string;
  ticketCreatedAt: string;
  elapsedSeconds: number;
  items: KdsItem[];
}

export default function KitchenKdsPage() {
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>("ALL");
  const [tickets, setTickets] = useState<KdsTicketCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Recall Dialog State
  const [recallDialogOpen, setRecallDialogOpen] = useState(false);
  const [selectedTaskForRecall, setSelectedTaskForRecall] = useState<KdsItem | null>(null);
  const [recallTargetStatus, setRecallTargetStatus] = useState<"READY" | "PREPARING" | "PENDING">("READY");
  const [recallReason, setRecallReason] = useState("");
  const [submittingRecall, setSubmittingRecall] = useState(false);

  // Manage Stations Dialog State
  const [manageStationsOpen, setManageStationsOpen] = useState(false);
  const [newStationCode, setNewStationCode] = useState("");
  const [newStationName, setNewStationName] = useState("");
  const [creatingStation, setCreatingStation] = useState(false);

  // Fetch Stations
  const fetchStations = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/restaurant/kds/stations");
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setStations(json.data);
        }
      }
    } catch {
      // Fallback silently if station route is initializing
    }
  }, []);

  // Fetch Tickets
  const fetchTickets = useCallback(async () => {
    try {
      const url = selectedStation && selectedStation !== "ALL"
        ? `/api/v1/restaurant/kds/tickets?stationRouting=${encodeURIComponent(selectedStation)}`
        : "/api/v1/restaurant/kds/tickets";
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load KDS tickets (HTTP ${res.status})`);
      }
      const json = await res.json();
      setTickets(json.data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load KDS tickets.");
    } finally {
      setLoading(false);
    }
  }, [selectedStation]);

  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Polling Auto-Refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchTickets();
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchTickets]);

  // Advance Task Status Action
  const handleUpdateStatus = async (taskId: string, currentStatus: string) => {
    let nextStatus = "PREPARING";
    if (currentStatus === "PENDING") nextStatus = "PREPARING";
    else if (currentStatus === "PREPARING") nextStatus = "READY";
    else if (currentStatus === "READY") nextStatus = "DONE";
    else return;

    try {
      const res = await fetch(`/api/v1/restaurant/kds/tasks/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || `Failed to update status to ${nextStatus}`);
      }
      fetchTickets();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Toggle Priority Action
  const handleTogglePriority = async (taskId: string, currentPriority: string) => {
    let nextPriority = "PRIORITY";
    if (currentPriority === "NORMAL") nextPriority = "PRIORITY";
    else if (currentPriority === "PRIORITY") nextPriority = "URGENT";
    else nextPriority = "NORMAL";

    try {
      const res = await fetch(`/api/v1/restaurant/kds/tasks/${taskId}/priority`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: nextPriority, reason: "Operator expedited" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update priority");
      }
      fetchTickets();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Bump Whole Ticket for Current Station
  const handleBumpTicket = async (ticket: KdsTicketCard) => {
    const stationRouting = selectedStation !== "ALL" ? selectedStation : ticket.items[0]?.stationRouting || "KITCHEN";
    // Find matching items to advance
    const pendingItems = ticket.items.filter(i => i.taskStatus === "PENDING");
    const preparingItems = ticket.items.filter(i => i.taskStatus === "PREPARING");
    const readyItems = ticket.items.filter(i => i.taskStatus === "READY");

    let fromStatus: "PENDING" | "PREPARING" | "READY" = "PENDING";
    let toStatus: "PREPARING" | "READY" | "DONE" = "PREPARING";

    if (readyItems.length > 0) {
      fromStatus = "READY";
      toStatus = "DONE";
    } else if (preparingItems.length > 0) {
      fromStatus = "PREPARING";
      toStatus = "READY";
    } else if (pendingItems.length > 0) {
      fromStatus = "PENDING";
      toStatus = "PREPARING";
    } else {
      return;
    }

    try {
      const res = await fetch("/api/v1/restaurant/kds/bump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outletId: stations[0]?.outletId || "00000000-0000-0000-0000-000000000000",
          orderId: ticket.orderId,
          stationRouting,
          fromStatus,
          toStatus,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to bump ticket");
      }
      fetchTickets();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Submit Audited Recall
  const handleSubmitRecall = async () => {
    if (!selectedTaskForRecall) return;
    if (!recallReason.trim()) {
      setError("An audit reason is required to recall a KDS task.");
      return;
    }

    setSubmittingRecall(true);
    try {
      const res = await fetch(`/api/v1/restaurant/kds/tasks/${selectedTaskForRecall.taskId}/recall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetStatus: recallTargetStatus,
          reason: recallReason.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Recall operation failed");
      }
      setRecallDialogOpen(false);
      setSelectedTaskForRecall(null);
      setRecallReason("");
      setSuccessMessage("Task successfully recalled and reopened.");
      fetchTickets();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingRecall(false);
    }
  };

  // Create Kitchen Station
  const handleCreateStation = async () => {
    if (!newStationCode.trim() || !newStationName.trim()) {
      setError("Station code and name are required.");
      return;
    }

    setCreatingStation(true);
    try {
      const res = await fetch("/api/v1/restaurant/kds/stations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newStationCode.trim().toUpperCase(),
          name: newStationName.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create station");
      }
      setNewStationCode("");
      setNewStationName("");
      fetchStations();
      setSuccessMessage("Kitchen station created successfully.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingStation(false);
    }
  };

  const formatElapsed = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs < 10 ? "0" : ""}${secs}s`;
  };

  const getStationIcon = (code: string) => {
    const c = code.toUpperCase();
    if (c.includes("HOT") || c.includes("GRILL") || c.includes("KITCHEN")) return Flame;
    if (c.includes("TANDOOR")) return UtensilsCrossed;
    if (c.includes("BEVERAGE") || c.includes("BAR")) return Wine;
    if (c.includes("DESSERT")) return IceCream;
    return MonitorPlay;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* ─── KDS TOP BAR ─────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <MonitorPlay className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  Kitchen Display System (KDS)
                </h1>
                <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0 border-amber-500/40 text-amber-400 bg-amber-500/10">
                  Slice 3.7
                </Badge>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Multi-Station Fulfillment, Ticket Expediting & Audited Recalls
              </p>
            </div>
          </div>

          {/* Quick Actions & Live Indicator */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Feed
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-xs h-8 ${autoRefresh ? "border-amber-500/40 text-amber-400" : "border-slate-700 text-slate-400"}`}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${autoRefresh ? "animate-spin" : ""}`} />
              {autoRefresh ? "Auto (4s)" : "Paused"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setManageStationsOpen(true)}
              className="text-xs h-8 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
            >
              <Sliders className="h-3.5 w-3.5 mr-1.5" />
              Stations
            </Button>

            <Link href="/restaurant">
              <Button variant="ghost" size="sm" className="text-xs h-8 text-slate-400 hover:text-white">
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ─── STATION SELECTOR TABS ────────────────────────────────────────── */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 sticky top-[61px] z-20 overflow-x-auto">
        <div className="max-w-7xl mx-auto flex items-center gap-2 min-w-max">
          <Button
            variant={selectedStation === "ALL" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedStation("ALL")}
            className={`text-xs font-semibold h-8 rounded-md transition-all ${
              selectedStation === "ALL"
                ? "bg-amber-600 hover:bg-amber-500 text-white shadow-sm"
                : "border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800"
            }`}
          >
            All Stations
            <Badge className="ml-2 text-[10px] px-1.5 py-0 bg-slate-800 text-slate-200">
              {tickets.reduce((acc, t) => acc + t.items.length, 0)}
            </Badge>
          </Button>

          {stations.map((st) => {
            const Icon = getStationIcon(st.code);
            const isSelected = selectedStation === st.code;
            const stationItemCount = tickets.reduce(
              (acc, t) => acc + t.items.filter((i) => i.stationRouting === st.code).length,
              0
            );

            return (
              <Button
                key={st.stationId}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedStation(st.code)}
                className={`text-xs font-semibold h-8 rounded-md transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-amber-600 hover:bg-amber-500 text-white shadow-sm"
                    : "border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {st.name}
                {stationItemCount > 0 && (
                  <Badge className="ml-1 text-[10px] px-1.5 py-0 bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {stationItemCount}
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {/* ─── ALERTS ──────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto w-full px-4 pt-4">
        {error && (
          <Alert variant="destructive" className="mb-4 bg-red-950/80 border-red-800 text-red-200">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Operation Notice</AlertTitle>
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert className="mb-4 bg-emerald-950/80 border-emerald-800 text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription className="text-xs">{successMessage}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* ─── MAIN TICKET GRID ────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-amber-500" />
            <p className="text-sm font-medium">Hydrating active kitchen station orders...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[350px] border border-dashed border-slate-800 rounded-xl p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-slate-500 mb-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
            <h3 className="text-base font-semibold text-white">All Clear! No Active Tickets</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              There are no pending or preparing orders for this station. New orders placed at tables or room service will appear here in real time.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {tickets.map((ticket) => {
              const isUrgent = ticket.priority === "URGENT";
              const isPriority = ticket.priority === "PRIORITY";
              const isElapsedHigh = ticket.elapsedSeconds > 600; // >10 min

              return (
                <Card
                  key={ticket.orderId}
                  className={`flex flex-col bg-slate-900/90 border transition-all shadow-md ${
                    isUrgent
                      ? "border-red-500/80 ring-2 ring-red-500/30"
                      : isPriority
                      ? "border-amber-500/60 ring-1 ring-amber-500/20"
                      : "border-slate-800"
                  }`}
                >
                  {/* Ticket Header */}
                  <CardHeader className="p-3 pb-2 border-b border-slate-800/80 bg-slate-950/40">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-sm text-white">
                            #{ticket.orderNumber.slice(-6)}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold px-1.5 py-0 uppercase ${
                              isUrgent
                                ? "bg-red-500/20 text-red-300 border-red-500/50 animate-pulse"
                                : isPriority
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}
                          >
                            {ticket.priority}
                          </Badge>
                        </div>
                        <p className="text-xs font-semibold text-amber-400 mt-0.5 truncate">
                          {ticket.destination}
                        </p>
                      </div>

                      {/* Timer */}
                      <div className="flex flex-col items-end">
                        <div
                          className={`flex items-center gap-1 px-2 py-0.5 rounded font-mono text-xs font-bold ${
                            isElapsedHigh
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          <Clock className="h-3 w-3" />
                          {formatElapsed(ticket.elapsedSeconds)}
                        </div>
                        <span className="text-[10px] text-slate-500 mt-0.5 uppercase">
                          {ticket.diningContext.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  </CardHeader>

                  {/* Item Rows */}
                  <CardContent className="p-3 flex-1 flex flex-col justify-between gap-2">
                    <div className="space-y-2">
                      {ticket.items.map((item) => {
                        const isReady = item.taskStatus === "READY";
                        const isPrep = item.taskStatus === "PREPARING";
                        const isDone = item.taskStatus === "DONE";

                        return (
                          <div
                            key={item.taskId}
                            className={`p-2 rounded-lg border transition-colors flex items-center justify-between gap-2 ${
                              isReady
                                ? "bg-emerald-950/30 border-emerald-800/60"
                                : isPrep
                                ? "bg-blue-950/30 border-blue-800/60"
                                : isDone
                                ? "bg-slate-950/40 border-slate-800/50 opacity-60"
                                : "bg-slate-950/60 border-slate-800/80"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-amber-400 text-xs font-mono">
                                  {item.quantity}x
                                </span>
                                <span className="text-xs font-semibold text-slate-100 truncate">
                                  {item.itemName}
                                </span>
                              </div>

                              {item.specialNotes && (
                                <p className="text-[11px] text-amber-300/90 italic mt-0.5 truncate">
                                  Note: {item.specialNotes}
                                </p>
                              )}

                              <div className="flex items-center gap-2 mt-1">
                                <Badge
                                  className={`text-[9px] px-1 py-0 uppercase ${
                                    isReady
                                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                      : isPrep
                                      ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                                      : isDone
                                      ? "bg-slate-800 text-slate-400"
                                      : "bg-slate-800 text-slate-300"
                                  }`}
                                >
                                  {item.taskStatus}
                                </Badge>
                                <span className="text-[9px] text-slate-400 font-mono">
                                  {item.stationRouting}
                                </span>
                              </div>
                            </div>

                            {/* Item Actions */}
                            <div className="flex items-center gap-1">
                              {item.taskStatus !== "DONE" && (
                                <Button
                                  size="sm"
                                  onClick={() => handleUpdateStatus(item.taskId, item.taskStatus)}
                                  className={`h-7 px-2 text-xs font-bold ${
                                    item.taskStatus === "PENDING"
                                      ? "bg-blue-600 hover:bg-blue-500 text-white"
                                      : item.taskStatus === "PREPARING"
                                      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                                      : "bg-purple-600 hover:bg-purple-500 text-white"
                                  }`}
                                >
                                  {item.taskStatus === "PENDING" && <Play className="h-3 w-3 mr-1" />}
                                  {item.taskStatus === "PREPARING" && <Check className="h-3 w-3 mr-1" />}
                                  {item.taskStatus === "READY" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                                  {item.taskStatus === "PENDING"
                                    ? "Start"
                                    : item.taskStatus === "PREPARING"
                                    ? "Ready"
                                    : "Done"}
                                </Button>
                              )}

                              {item.taskStatus === "DONE" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedTaskForRecall(item);
                                    setRecallTargetStatus("READY");
                                    setRecallDialogOpen(true);
                                  }}
                                  className="h-7 px-1.5 text-xs text-slate-400 hover:text-white"
                                  title="Audited Recall"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Ticket Footer Actions */}
                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-1.5 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTogglePriority(ticket.items[0].taskId, ticket.priority)}
                        className="text-[11px] h-7 px-2 border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                      >
                        <Sparkles className="h-3 w-3 mr-1 text-amber-400" />
                        Expedite
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => handleBumpTicket(ticket)}
                        className="text-[11px] h-7 px-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                      >
                        Bump Ticket
                        <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* ─── AUDITED RECALL DIALOG ────────────────────────────────────────── */}
      <Dialog open={recallDialogOpen} onOpenChange={setRecallDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <RotateCcw className="h-5 w-5" />
              Audited Task Recall & Reopen
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Reopening a completed or ready task moves it back in the production queue and records an immutable audit history event.
            </DialogDescription>
          </DialogHeader>

          {selectedTaskForRecall && (
            <div className="space-y-3 py-2">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                <p className="font-semibold text-white">{selectedTaskForRecall.itemName} ({selectedTaskForRecall.quantity}x)</p>
                <p className="text-slate-400 font-mono mt-0.5">Current Status: {selectedTaskForRecall.taskStatus}</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Reopen Target Status:
                </label>
                <select
                  value={recallTargetStatus}
                  onChange={(e) => setRecallTargetStatus(e.target.value as any)}
                  className="w-full h-9 rounded-md bg-slate-950 border border-slate-800 px-3 text-xs text-white"
                >
                  <option value="READY">READY (Awaiting delivery)</option>
                  <option value="PREPARING">PREPARING (Back in production)</option>
                  <option value="PENDING">PENDING (Reset to queue)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Audit Reason (Mandatory):
                </label>
                <Input
                  value={recallReason}
                  onChange={(e) => setRecallReason(e.target.value)}
                  placeholder="e.g. Guest requested modification, accidental bump"
                  className="bg-slate-950 border-slate-800 text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRecallDialogOpen(false)} className="text-slate-400">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitRecall}
              disabled={submittingRecall || !recallReason.trim()}
              className="bg-amber-600 hover:bg-amber-500 text-white font-semibold"
            >
              {submittingRecall ? "Reopening..." : "Confirm Audited Recall"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MANAGE STATIONS DIALOG ───────────────────────────────────────── */}
      <Dialog open={manageStationsOpen} onOpenChange={setManageStationsOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Sliders className="h-5 w-5 text-amber-400" />
              Kitchen Fulfillment Stations
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Configure and organize operational fulfillment stations for this outlet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Existing Stations List */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {stations.map((st) => (
                <div
                  key={st.stationId}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{st.name}</span>
                      <Badge variant="outline" className="font-mono text-[9px] uppercase px-1 py-0 border-slate-700">
                        {st.code}
                      </Badge>
                    </div>
                    {st.description && <p className="text-[11px] text-slate-400 mt-0.5">{st.description}</p>}
                  </div>
                  <Badge className={st.isActive ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-500"}>
                    {st.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              ))}
            </div>

            {/* Create Station Form */}
            <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 space-y-2">
              <h4 className="text-xs font-semibold text-amber-400">Add New Kitchen Station</h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Station Code (e.g. BAR)</label>
                  <Input
                    value={newStationCode}
                    onChange={(e) => setNewStationCode(e.target.value)}
                    placeholder="GRILL"
                    className="h-8 bg-slate-950 border-slate-800 text-xs uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Display Name</label>
                  <Input
                    value={newStationName}
                    onChange={(e) => setNewStationName(e.target.value)}
                    placeholder="Grill & Roaster"
                    className="h-8 bg-slate-950 border-slate-800 text-xs"
                  />
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleCreateStation}
                disabled={creatingStation || !newStationCode || !newStationName}
                className="w-full h-8 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs mt-2"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {creatingStation ? "Creating..." : "Create Station"}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setManageStationsOpen(false)} className="text-slate-400">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
