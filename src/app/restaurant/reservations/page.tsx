"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  Users,
  Phone,
  Mail,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserCheck,
  ChevronRight,
  ArrowRight,
  Armchair,
  Grid3X3,
  Bell,
  Sparkles,
  Flame,
  Filter,
  Receipt,
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

interface ReservationItem {
  reservationId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  durationMinutes: number;
  status: "PENDING" | "CONFIRMED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  assignedTableId?: string | null;
  tableNumber?: string | null;
  tableDisplayLabel?: string | null;
  sectionId?: string | null;
  sectionName?: string | null;
  notes?: string | null;
  source: string;
  seatedSessionId?: string | null;
}

interface WaitlistItem {
  waitlistId: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  preferredSectionId?: string | null;
  preferredSectionName?: string | null;
  queuePosition: number;
  estimatedWaitMinutes: number;
  status: "WAITING" | "CALLED" | "SEATED" | "CANCELLED" | "EXPIRED";
  assignedTableId?: string | null;
  tableNumber?: string | null;
  seatedSessionId?: string | null;
  notes?: string | null;
  calledAt?: string | null;
  seatedAt?: string | null;
  createdAt: string;
}

interface TableOption {
  tableId: string;
  tableNumber: string;
  displayLabel?: string;
  capacity: number;
  section?: string;
  isAvailable: boolean;
  conflictReason?: string;
}

export default function RestaurantReservationsPage() {
  const [activeTab, setActiveTab] = useState<"RESERVATIONS" | "WAITLIST">("RESERVATIONS");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [newResModalOpen, setNewResModalOpen] = useState(false);
  const [newWaitModalOpen, setNewWaitModalOpen] = useState(false);
  const [assignTableModalRes, setAssignTableModalRes] = useState<ReservationItem | null>(null);
  const [seatPartyModalRes, setSeatPartyModalRes] = useState<ReservationItem | null>(null);
  const [seatWaitlistModalItem, setSeatWaitlistModalItem] = useState<WaitlistItem | null>(null);

  // Availability state for modals
  const [availableTables, setAvailableTables] = useState<TableOption[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string>("");

  // New Reservation Form State
  const [newResName, setNewResName] = useState("");
  const [newResPhone, setNewResPhone] = useState("");
  const [newResEmail, setNewResEmail] = useState("");
  const [newResPartySize, setNewResPartySize] = useState(2);
  const [newResDate, setNewResDate] = useState(new Date().toISOString().split("T")[0]);
  const [newResTime, setNewResTime] = useState("19:00");
  const [newResNotes, setNewResNotes] = useState("");
  const [newResTableId, setNewResTableId] = useState("");
  const [submittingRes, setSubmittingRes] = useState(false);

  // New Waitlist Form State
  const [newWaitName, setNewWaitName] = useState("");
  const [newWaitPhone, setNewWaitPhone] = useState("");
  const [newWaitPartySize, setNewWaitPartySize] = useState(2);
  const [newWaitEstMinutes, setNewWaitEstMinutes] = useState(15);
  const [newWaitNotes, setNewWaitNotes] = useState("");
  const [submittingWait, setSubmittingWait] = useState(false);

  // Fetch Reservations
  const fetchReservations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/v1/restaurant/reservations?date=${selectedDate}`;
      if (statusFilter !== "ALL") {
        url += `&status=${statusFilter}`;
      }
      if (searchQuery) {
        url += `&search=${encodeURIComponent(searchQuery)}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setReservations(json.data || []);
      } else {
        setError(json.error?.message || "Failed to load reservations.");
      }
    } catch {
      setError("Network error while loading reservations.");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, statusFilter, searchQuery]);

  // Fetch Waitlist
  const fetchWaitlist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/v1/restaurant/waitlist`;
      if (searchQuery) {
        url += `?search=${encodeURIComponent(searchQuery)}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setWaitlist(json.data || []);
      } else {
        setError(json.error?.message || "Failed to load waitlist.");
      }
    } catch {
      setError("Network error while loading waitlist.");
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (activeTab === "RESERVATIONS") {
      fetchReservations();
    } else {
      fetchWaitlist();
    }
  }, [activeTab, fetchReservations, fetchWaitlist]);

  // Query Availability for Table Selection
  const loadTableAvailability = async (date: string, time: string, partySize: number, excludeResId?: string) => {
    setLoadingAvailability(true);
    try {
      let url = `/api/v1/restaurant/reservations/availability?date=${date}&time=${time}&partySize=${partySize}`;
      if (excludeResId) url += `&excludeReservationId=${excludeResId}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data?.tables) {
        setAvailableTables(json.data.tables);
      }
    } catch {
      setAvailableTables([]);
    } finally {
      setLoadingAvailability(false);
    }
  };

  // Create Reservation Submit
  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingRes(true);
    try {
      const res = await fetch("/api/v1/restaurant/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: newResName,
          customerPhone: newResPhone,
          customerEmail: newResEmail || undefined,
          partySize: Number(newResPartySize),
          reservationDate: newResDate,
          reservationTime: newResTime,
          assignedTableId: newResTableId || undefined,
          notes: newResNotes || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setNewResModalOpen(false);
        setNewResName("");
        setNewResPhone("");
        setNewResEmail("");
        setNewResNotes("");
        setNewResTableId("");
        fetchReservations();
      } else {
        alert("Reservation failed: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error submitting reservation");
    } finally {
      setSubmittingRes(false);
    }
  };

  // Add to Waitlist Submit
  const handleAddToWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingWait(true);
    try {
      const res = await fetch("/api/v1/restaurant/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: newWaitName,
          customerPhone: newWaitPhone,
          partySize: Number(newWaitPartySize),
          estimatedWaitMinutes: Number(newWaitEstMinutes),
          notes: newWaitNotes || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setNewWaitModalOpen(false);
        setNewWaitName("");
        setNewWaitPhone("");
        setNewWaitNotes("");
        fetchWaitlist();
      } else {
        alert("Waitlist entry failed: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error adding to waitlist");
    } finally {
      setSubmittingWait(false);
    }
  };

  // Update Reservation Status Action
  const handleReservationStatus = async (resId: string, status: string, reason?: string) => {
    try {
      const res = await fetch(`/api/v1/restaurant/reservations/${resId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason }),
      });
      const json = await res.json();
      if (json.success) {
        fetchReservations();
      } else {
        alert("Status update failed: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error updating status");
    }
  };

  // Assign Table Submit
  const handleAssignTable = async () => {
    if (!assignTableModalRes) return;
    try {
      const res = await fetch(`/api/v1/restaurant/reservations/${assignTableModalRes.reservationId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: selectedTableId || null }),
      });
      const json = await res.json();
      if (json.success) {
        setAssignTableModalRes(null);
        setSelectedTableId("");
        fetchReservations();
      } else {
        alert("Table assignment failed: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error assigning table");
    }
  };

  // Seat Reservation Submit
  const handleSeatReservation = async (res: ReservationItem, tableIdOverride?: string) => {
    try {
      const resApi = await fetch(`/api/v1/restaurant/reservations/${res.reservationId}/seat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: tableIdOverride || res.assignedTableId }),
      });
      const json = await resApi.json();
      if (json.success) {
        setSeatPartyModalRes(null);
        fetchReservations();
        alert(`Party seated! Active dining session ${json.data?.session?.sessionNumber} opened on Table ${json.data?.table?.tableNumber}.`);
      } else {
        alert("Seating failed: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error executing seating transaction");
    }
  };

  // Waitlist Status Update Action
  const handleWaitlistStatus = async (waitlistId: string, status: string) => {
    try {
      const res = await fetch(`/api/v1/restaurant/waitlist/${waitlistId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        fetchWaitlist();
      } else {
        alert("Waitlist update failed: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error updating waitlist entry");
    }
  };

  // Seat Waitlist Party Submit
  const handleSeatWaitlistParty = async () => {
    if (!seatWaitlistModalItem || !selectedTableId) return;
    try {
      const res = await fetch(`/api/v1/restaurant/waitlist/${seatWaitlistModalItem.waitlistId}/seat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: selectedTableId }),
      });
      const json = await res.json();
      if (json.success) {
        setSeatWaitlistModalItem(null);
        setSelectedTableId("");
        fetchWaitlist();
        alert(`Party seated! Active dining session opened on Table ${json.data?.table?.tableNumber}.`);
      } else {
        alert("Seating failed: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error seating waitlist party");
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-display">
              Reservations & Waitlist
            </h1>
            <Badge className="bg-emerald-600 text-white border-0 text-xs">
              Live Dining Operations
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Server-authoritative restaurant table bookings, walk-in waitlist queue, and atomic party seating.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <Link href="/restaurant/tables">
            <Button variant="outline" size="sm" className="flex items-center gap-1.5 text-xs">
              <Grid3X3 className="h-3.5 w-3.5 text-indigo-500" />
              Floor Map
            </Button>
          </Link>

          <Link href="/restaurant/billing">
            <Button variant="outline" size="sm" className="flex items-center gap-1.5 text-xs">
              <Receipt className="h-3.5 w-3.5 text-emerald-500" />
              Billing (POS)
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={activeTab === "RESERVATIONS" ? fetchReservations : fetchWaitlist}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {activeTab === "RESERVATIONS" ? (
            <Button
              onClick={() => {
                setNewResModalOpen(true);
                loadTableAvailability(newResDate, newResTime, newResPartySize);
              }}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              New Reservation
            </Button>
          ) : (
            <Button
              onClick={() => setNewWaitModalOpen(true)}
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Add to Waitlist
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Operational Alert</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Tabs & Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Main Tab Switcher */}
        <div className="inline-flex items-center bg-muted/60 p-1 rounded-lg border border-border w-fit">
          <Button
            type="button"
            variant={activeTab === "RESERVATIONS" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("RESERVATIONS")}
            className={`h-8 text-xs font-semibold ${
              activeTab === "RESERVATIONS"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
            Table Reservations ({reservations.length})
          </Button>

          <Button
            type="button"
            variant={activeTab === "WAITLIST" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("WAITLIST")}
            className={`h-8 text-xs font-semibold ${
              activeTab === "WAITLIST"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Flame className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
            Walk-in Waitlist ({waitlist.filter((w) => ["WAITING", "CALLED"].includes(w.status)).length})
          </Button>
        </div>

        {/* Date / Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "RESERVATIONS" && (
            <>
              <div className="flex items-center gap-1.5 bg-card px-2.5 py-1 rounded-md border border-border">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs text-foreground focus:outline-none"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-card border border-border rounded-md px-2.5 py-1 text-xs text-foreground focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="SEATED">Seated</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="NO_SHOW">No-Show</option>
              </select>
            </>
          )}

          <div className="relative">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search guest or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs w-48 sm:w-60"
            />
          </div>
        </div>
      </div>

      {/* Content Panes */}
      {activeTab === "RESERVATIONS" ? (
        <div className="space-y-4">
          {reservations.length === 0 ? (
            <Card className="border-border">
              <CardContent className="py-12 text-center text-muted-foreground">
                <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-base font-medium text-foreground">No reservations found for {selectedDate}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Adjust your search filters or click &quot;New Reservation&quot; to book a table.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reservations.map((res) => (
                <Card
                  key={res.reservationId}
                  className={`border-border transition-all ${
                    res.status === "SEATED"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : res.status === "CONFIRMED"
                      ? "border-blue-500/30 bg-blue-500/5"
                      : "opacity-80"
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                          {res.customerName}
                          <Badge variant="outline" className="text-[10px] font-normal">
                            Party of {res.partySize}
                          </Badge>
                        </CardTitle>
                        <CardDescription className="text-xs flex items-center gap-2 mt-1">
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {res.reservationTime} ({res.durationMinutes}m)
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {res.customerPhone}
                          </span>
                        </CardDescription>
                      </div>

                      <Badge
                        className={`text-[10px] font-semibold uppercase tracking-wider ${
                          res.status === "SEATED"
                            ? "bg-emerald-600 text-white"
                            : res.status === "CONFIRMED"
                            ? "bg-blue-600 text-white"
                            : res.status === "CANCELLED"
                            ? "bg-red-600/80 text-white"
                            : res.status === "NO_SHOW"
                            ? "bg-zinc-600 text-white"
                            : "bg-amber-600 text-white"
                        }`}
                      >
                        {res.status}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-0 text-xs">
                    {/* Assigned Table Details */}
                    <div className="flex items-center justify-between p-2 rounded-md bg-muted/40 border border-border/60">
                      <div className="flex items-center gap-2">
                        <Armchair className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Assigned Table:</span>
                        {res.tableNumber ? (
                          <span className="font-semibold text-foreground">
                            Table {res.tableNumber} {res.sectionName ? `(${res.sectionName})` : ""}
                          </span>
                        ) : (
                          <span className="text-amber-500 font-medium italic">Unassigned</span>
                        )}
                      </div>

                      {["CONFIRMED", "PENDING"].includes(res.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAssignTableModalRes(res);
                            setSelectedTableId(res.assignedTableId || "");
                            loadTableAvailability(res.reservationDate, res.reservationTime, res.partySize, res.reservationId);
                          }}
                          className="h-6 text-[10px] px-2 text-indigo-400 hover:text-indigo-300"
                        >
                          {res.tableNumber ? "Change" : "Assign"}
                        </Button>
                      )}
                    </div>

                    {res.notes && (
                      <p className="text-[11px] text-muted-foreground bg-muted/20 p-1.5 rounded border border-border/40 italic">
                        &quot;{res.notes}&quot;
                      </p>
                    )}

                    {/* Operational Action Controls */}
                    {["CONFIRMED", "PENDING"].includes(res.status) && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/60">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (res.assignedTableId) {
                              handleSeatReservation(res);
                            } else {
                              setSeatPartyModalRes(res);
                              setSelectedTableId("");
                              loadTableAvailability(res.reservationDate, res.reservationTime, res.partySize);
                            }
                          }}
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
                        >
                          <UserCheck className="h-3 w-3 mr-1" />
                          Seat Party
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReservationStatus(res.reservationId, "NO_SHOW")}
                          className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        >
                          No-Show
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Cancel reservation for ${res.customerName}?`)) {
                              handleReservationStatus(res.reservationId, "CANCELLED");
                            }
                          }}
                          className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          Cancel
                        </Button>
                      </div>
                    )}

                    {res.status === "SEATED" && (
                      <div className="flex items-center justify-between pt-1 border-t border-border/60">
                        <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Seated & Active Session Open
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReservationStatus(res.reservationId, "COMPLETED")}
                          className="h-6 text-[10px] px-2"
                        >
                          Complete
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Waitlist Live Queue */
        <div className="space-y-4">
          {waitlist.length === 0 ? (
            <Card className="border-border">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Flame className="h-10 w-10 mx-auto text-amber-500/40 mb-3" />
                <p className="text-base font-medium text-foreground">Waitlist is currently empty</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Walk-in guests can be added to the live queue by clicking &quot;Add to Waitlist&quot;.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {waitlist.map((item) => (
                <div
                  key={item.waitlistId}
                  className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 rounded-lg border border-border transition-all ${
                    item.status === "CALLED"
                      ? "bg-amber-500/10 border-amber-500/40"
                      : item.status === "WAITING"
                      ? "bg-card border-border"
                      : "bg-muted/20 border-border/50 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    {/* Position Badge */}
                    <div
                      className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm ${
                        item.status === "CALLED"
                          ? "bg-amber-600 text-white animate-pulse"
                          : item.status === "WAITING"
                          ? "bg-muted text-foreground border border-border"
                          : "bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      {item.queuePosition > 0 ? `#${item.queuePosition}` : "-"}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{item.customerName}</span>
                        <Badge variant="outline" className="text-[10px] font-normal">
                          Party of {item.partySize}
                        </Badge>
                        <Badge
                          className={`text-[9px] font-semibold uppercase ${
                            item.status === "CALLED"
                              ? "bg-amber-500 text-black"
                              : item.status === "WAITING"
                              ? "bg-blue-600 text-white"
                              : item.status === "SEATED"
                              ? "bg-emerald-600 text-white"
                              : "bg-zinc-600 text-white"
                          }`}
                        >
                          {item.status}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="h-3 w-3" />
                          {item.customerPhone}
                        </span>
                        <span>•</span>
                        <span>Est. Wait: ~{item.estimatedWaitMinutes} mins</span>
                        {item.preferredSectionName && (
                          <>
                            <span>•</span>
                            <span className="text-indigo-400 font-medium">Pref: {item.preferredSectionName}</span>
                          </>
                        )}
                        {item.notes && <span className="italic text-muted-foreground/80">&quot;{item.notes}&quot;</span>}
                      </div>
                    </div>
                  </div>

                  {/* Waitlist Operational Actions */}
                  {["WAITING", "CALLED"].includes(item.status) && (
                    <div className="flex items-center gap-2 mt-3 sm:mt-0 w-full sm:w-auto justify-end">
                      {item.status === "WAITING" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleWaitlistStatus(item.waitlistId, "CALLED")}
                          className="h-7 text-xs border-amber-500/40 text-amber-400 hover:text-amber-300"
                        >
                          <Bell className="h-3 w-3 mr-1" />
                          Call Guest
                        </Button>
                      )}

                      <Button
                        size="sm"
                        onClick={() => {
                          setSeatWaitlistModalItem(item);
                          setSelectedTableId("");
                          loadTableAvailability(new Date().toISOString().split("T")[0], "19:00", item.partySize);
                        }}
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <UserCheck className="h-3 w-3 mr-1" />
                        Seat at Table
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Remove ${item.customerName} from waitlist?`)) {
                            handleWaitlistStatus(item.waitlistId, "CANCELLED");
                          }
                        }}
                        className="h-7 text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </Button>
                    </div>
                  )}

                  {item.status === "SEATED" && item.tableNumber && (
                    <span className="text-xs text-emerald-400 font-medium mt-2 sm:mt-0">
                      Seated at Table {item.tableNumber}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: New Reservation */}
      <Dialog open={newResModalOpen} onOpenChange={setNewResModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Table Reservation</DialogTitle>
            <DialogDescription>
              Book an advance dining reservation with authoritative table conflict verification.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateReservation} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Guest Name *</label>
                <Input
                  required
                  placeholder="e.g. David Vance"
                  value={newResName}
                  onChange={(e) => setNewResName(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Phone Number *</label>
                <Input
                  required
                  placeholder="+1-555-0199"
                  value={newResPhone}
                  onChange={(e) => setNewResPhone(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Email (Optional)</label>
              <Input
                type="email"
                placeholder="guest@example.com"
                value={newResEmail}
                onChange={(e) => setNewResEmail(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Party Size *</label>
                <Input
                  type="number"
                  min={1}
                  required
                  value={newResPartySize}
                  onChange={(e) => {
                    const sz = Number(e.target.value);
                    setNewResPartySize(sz);
                    loadTableAvailability(newResDate, newResTime, sz);
                  }}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Date *</label>
                <Input
                  type="date"
                  required
                  value={newResDate}
                  onChange={(e) => {
                    setNewResDate(e.target.value);
                    loadTableAvailability(e.target.value, newResTime, newResPartySize);
                  }}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Time *</label>
                <Input
                  type="time"
                  required
                  value={newResTime}
                  onChange={(e) => {
                    setNewResTime(e.target.value);
                    loadTableAvailability(newResDate, e.target.value, newResPartySize);
                  }}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            {/* Table Selection */}
            <div>
              <label className="text-xs font-medium text-foreground">
                Assign Table (Optional)
              </label>
              <select
                value={newResTableId}
                onChange={(e) => setNewResTableId(e.target.value)}
                className="w-full mt-1 bg-card border border-border rounded-md p-2 text-xs text-foreground focus:outline-none"
              >
                <option value="">Leave Unassigned (Assign Later)</option>
                {availableTables.map((t) => (
                  <option
                    key={t.tableId}
                    value={t.tableId}
                    disabled={!t.isAvailable}
                  >
                    Table {t.tableNumber} (Cap: {t.capacity}) {t.section ? `- ${t.section}` : ""} {!t.isAvailable ? `[Unavailable: ${t.conflictReason}]` : "[Available]"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Special Requests / Notes</label>
              <Input
                placeholder="Window seat, dietary notes, birthday..."
                value={newResNotes}
                onChange={(e) => setNewResNotes(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setNewResModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submittingRes} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {submittingRes ? "Saving..." : "Confirm Reservation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Add to Waitlist */}
      <Dialog open={newWaitModalOpen} onOpenChange={setNewWaitModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Party to Walk-in Waitlist</DialogTitle>
            <DialogDescription>
              Queue an arriving walk-in dining party in the server-managed waitlist.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddToWaitlist} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Customer Name *</label>
                <Input
                  required
                  placeholder="e.g. Sarah Connor"
                  value={newWaitName}
                  onChange={(e) => setNewWaitName(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Phone Number *</label>
                <Input
                  required
                  placeholder="+1-555-0144"
                  value={newWaitPhone}
                  onChange={(e) => setNewWaitPhone(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Party Size *</label>
                <Input
                  type="number"
                  min={1}
                  required
                  value={newWaitPartySize}
                  onChange={(e) => setNewWaitPartySize(Number(e.target.value))}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Est. Wait (Minutes)</label>
                <Input
                  type="number"
                  min={5}
                  value={newWaitEstMinutes}
                  onChange={(e) => setNewWaitEstMinutes(Number(e.target.value))}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground">Notes</label>
              <Input
                placeholder="High chair needed, patio preferred..."
                value={newWaitNotes}
                onChange={(e) => setNewWaitNotes(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setNewWaitModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submittingWait} className="bg-amber-600 hover:bg-amber-700 text-white">
                {submittingWait ? "Adding..." : "Add to Queue"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Assign / Reassign Table */}
      <Dialog open={!!assignTableModalRes} onOpenChange={(open) => !open && setAssignTableModalRes(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Table to Reservation</DialogTitle>
            <DialogDescription>
              Assign or change table for {assignTableModalRes?.customerName} (Party of {assignTableModalRes?.partySize}) on {assignTableModalRes?.reservationDate} at {assignTableModalRes?.reservationTime}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {loadingAvailability ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Checking table availability...</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setSelectedTableId("")}
                  className={`w-full text-left p-2.5 rounded-md border text-xs transition-all ${
                    selectedTableId === "" ? "border-amber-500 bg-amber-500/10" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <span className="font-semibold text-foreground">Unassigned</span>
                  <span className="text-muted-foreground block text-[11px]">Remove current table assignment</span>
                </button>

                {availableTables.map((t) => (
                  <button
                    key={t.tableId}
                    type="button"
                    disabled={!t.isAvailable}
                    onClick={() => setSelectedTableId(t.tableId)}
                    className={`w-full text-left p-2.5 rounded-md border text-xs transition-all ${
                      selectedTableId === t.tableId
                        ? "border-emerald-500 bg-emerald-500/10"
                        : t.isAvailable
                        ? "border-border hover:bg-muted/40"
                        : "border-border/40 opacity-40 cursor-not-allowed bg-muted/20"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        Table {t.tableNumber} {t.section ? `• ${t.section}` : ""}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        Cap: {t.capacity}
                      </Badge>
                    </div>
                    {!t.isAvailable && (
                      <span className="text-red-400 block text-[10px] mt-1">{t.conflictReason}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAssignTableModalRes(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAssignTable} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              Confirm Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Seat Waitlist Party */}
      <Dialog open={!!seatWaitlistModalItem} onOpenChange={(open) => !open && setSeatWaitlistModalItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Seat Waitlist Party</DialogTitle>
            <DialogDescription>
              Select an available table to seat {seatWaitlistModalItem?.customerName} (Party of {seatWaitlistModalItem?.partySize}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {loadingAvailability ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Loading tables...</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {availableTables
                  .filter((t) => t.isAvailable)
                  .map((t) => (
                    <button
                      key={t.tableId}
                      type="button"
                      onClick={() => setSelectedTableId(t.tableId)}
                      className={`w-full text-left p-2.5 rounded-md border text-xs transition-all ${
                        selectedTableId === t.tableId
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          Table {t.tableNumber} {t.section ? `• ${t.section}` : ""}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          Cap: {t.capacity}
                        </Badge>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSeatWaitlistModalItem(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!selectedTableId}
              onClick={handleSeatWaitlistParty}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Seat Party Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
