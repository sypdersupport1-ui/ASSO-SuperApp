"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { HotelNav } from "@/components/hotel/hotel-nav";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ConciergeBell,
  CalendarDays,
  DoorOpen,
  Users,
  LogOut,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Clock,
  KeyRound,
  Sparkles,
  BedDouble,
  ExternalLink,
  ChevronRight,
  Building,
} from "lucide-react";
import type {
  FrontOfficeSummary,
  FrontOfficeArrival,
  FrontOfficeDeparture,
  FrontOfficeInHouseStay,
  FrontOfficeAttentionItem,
} from "@/lib/hotel/front-office-service";

interface RoomOption {
  roomId: string;
  roomNumber: string;
  operationalStatus: string;
  housekeepingStatus: string;
  roomTypeId: string;
}

export default function FrontOfficePage() {
  const [data, setData] = useState<FrontOfficeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("arrivals");

  // Check-in modal state
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [selectedArrival, setSelectedArrival] = useState<FrontOfficeArrival | null>(null);
  const [checkInRoomId, setCheckInRoomId] = useState("");
  const [checkInNotes, setCheckInNotes] = useState("");
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<RoomOption[]>([]);

  // Checkout modal state
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedDeparture, setSelectedDeparture] = useState<FrontOfficeDeparture | FrontOfficeInHouseStay | null>(null);
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Detail modal state
  const [selectedInHouse, setSelectedInHouse] = useState<FrontOfficeInHouseStay | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Fetch Front Office summary
  const fetchSummary = useCallback(async (searchTerm?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = searchTerm && searchTerm.trim().length > 0
        ? `/api/v1/hotel/front-office?search=${encodeURIComponent(searchTerm.trim())}`
        : "/api/v1/hotel/front-office";

      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error?.message || "Failed to load Front Office operational data.");
      }
    } catch {
      setError("Network or server connection failed while reaching Front Desk API.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch room options for check-in
  const fetchRoomOptions = async (roomTypeId?: string) => {
    try {
      const res = await fetch("/api/v1/hotel/rooms");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const rooms: RoomOption[] = json.data
          .filter((r: RoomOption) => !roomTypeId || r.roomTypeId === roomTypeId)
          .map((r: RoomOption) => ({
            roomId: r.roomId,
            roomNumber: r.roomNumber,
            operationalStatus: r.operationalStatus,
            housekeepingStatus: r.housekeepingStatus,
            roomTypeId: r.roomTypeId,
          }));
        setAvailableRooms(rooms);
      }
    } catch {
      console.error("Failed to load room options for check-in");
    }
  };

  useEffect(() => {
    fetchSummary(search);
  }, [fetchSummary, search]);

  // Realtime SSE listener for seamless operational board updates
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/v1/realtime");
      eventSource.addEventListener("stay.checked_in", () => fetchSummary(search));
      eventSource.addEventListener("stay.checked_out", () => fetchSummary(search));
      eventSource.addEventListener("room.occupied", () => fetchSummary(search));
      eventSource.addEventListener("room.released", () => fetchSummary(search));
      eventSource.addEventListener("reservation.created", () => fetchSummary(search));
    } catch {
      // Realtime fallback to manual polling/actions
    }
    return () => {
      if (eventSource) eventSource.close();
    };
  }, [fetchSummary, search]);

  // Open check-in modal
  const openCheckIn = (arrival: FrontOfficeArrival) => {
    setSelectedArrival(arrival);
    setCheckInRoomId(arrival.assignedRoomId || "");
    setCheckInNotes("");
    fetchRoomOptions(arrival.roomTypeId);
    setCheckInModalOpen(true);
  };

  // Submit check-in
  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedArrival) return;
    if (!checkInRoomId) {
      alert("Please select a physical room to allocate for this check-in.");
      return;
    }

    setCheckInLoading(true);
    try {
      const res = await fetch(`/api/v1/hotel/reservations/${selectedArrival.reservationId}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: checkInRoomId,
          notes: checkInNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setCheckInModalOpen(false);
        await fetchSummary(search);
      } else {
        alert(`Check-in failed: ${json.error?.message || "Operational rule violation."}`);
      }
    } catch {
      alert("Network failure while processing check-in.");
    } finally {
      setCheckInLoading(false);
    }
  };

  // Open checkout modal
  const openCheckout = (dep: FrontOfficeDeparture | FrontOfficeInHouseStay) => {
    setSelectedDeparture(dep);
    setCheckoutNotes("");
    setCheckoutModalOpen(true);
  };

  // Submit checkout
  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeparture) return;

    setCheckoutLoading(true);
    try {
      const res = await fetch(`/api/v1/hotel/stays/${selectedDeparture.stayId}/check-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: checkoutNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setCheckoutModalOpen(false);
        if (detailModalOpen) setDetailModalOpen(false);
        await fetchSummary(search);
      } else {
        alert(`Check-out failed: ${json.error?.message || "Operational rule violation."}`);
      }
    } catch {
      alert("Network failure while processing check-out.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HotelNav />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Workspace Title & Console Context */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary text-primary-foreground">
                <ConciergeBell className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                  Front Desk Operations
                  <Badge variant="outline" className="text-xs font-mono text-primary border-primary/30">
                    Slice 4 Workspace
                  </Badge>
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Authoritative daily operations workspace for Arrivals, Departures, In-House Guests, and Room Readiness.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search guest, room, stay #..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs h-9 bg-card"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchSummary(search)}
              disabled={loading}
              className="flex items-center gap-1.5 h-9"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive flex items-center gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Live Top KPIs Strip */}
        {data && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
            {/* Arrivals */}
            <Card
              className="cursor-pointer hover:border-primary transition-all"
              onClick={() => setActiveTab("arrivals")}
            >
              <CardHeader className="pb-1.5 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs uppercase font-semibold text-muted-foreground">
                    Today&apos;s Arrivals
                  </CardDescription>
                  <CalendarDays className="h-4 w-4 text-primary" />
                </div>
                <CardTitle className="text-2xl sm:text-3xl font-black text-foreground">
                  {data.kpis.todayArrivalsCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <p className="text-[11px] text-muted-foreground">Due for check-in today</p>
              </CardContent>
            </Card>

            {/* Departures */}
            <Card
              className="cursor-pointer hover:border-primary transition-all"
              onClick={() => setActiveTab("departures")}
            >
              <CardHeader className="pb-1.5 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs uppercase font-semibold text-muted-foreground">
                    Today&apos;s Departures
                  </CardDescription>
                  <LogOut className="h-4 w-4 text-amber-500" />
                </div>
                <CardTitle className="text-2xl sm:text-3xl font-black text-foreground">
                  {data.kpis.todayDeparturesCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <p className="text-[11px] text-muted-foreground">Scheduled checkouts</p>
              </CardContent>
            </Card>

            {/* In-House Stays */}
            <Card
              className="cursor-pointer hover:border-primary transition-all"
              onClick={() => setActiveTab("inHouse")}
            >
              <CardHeader className="pb-1.5 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs uppercase font-semibold text-muted-foreground">
                    In-House Stays
                  </CardDescription>
                  <KeyRound className="h-4 w-4 text-blue-500" />
                </div>
                <CardTitle className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">
                  {data.kpis.activeStaysCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <p className="text-[11px] text-muted-foreground">
                  {data.kpis.occupancyRatePct}% Room Occupancy
                </p>
              </CardContent>
            </Card>

            {/* Ready & Available Rooms */}
            <Card
              className="cursor-pointer hover:border-primary transition-all"
              onClick={() => setActiveTab("readiness")}
            >
              <CardHeader className="pb-1.5 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs uppercase font-semibold text-emerald-700 dark:text-emerald-400">
                    Clean &amp; Ready
                  </CardDescription>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <CardTitle className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                  {data.kpis.availableCleanRoomsCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <p className="text-[11px] text-muted-foreground">
                  of {data.kpis.totalRoomsCount} rooms ready
                </p>
              </CardContent>
            </Card>

            {/* Attention Items */}
            <Card
              className={`col-span-2 lg:col-span-1 border-border ${
                data.kpis.attentionItemsCount > 0 ? "border-amber-500/40 bg-amber-500/5" : ""
              }`}
            >
              <CardHeader className="pb-1.5 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs uppercase font-semibold text-muted-foreground">
                    Action Items
                  </CardDescription>
                  <AlertTriangle className={`h-4 w-4 ${data.kpis.attentionItemsCount > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
                </div>
                <CardTitle className="text-2xl sm:text-3xl font-black text-foreground">
                  {data.kpis.attentionItemsCount}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <p className="text-[11px] text-muted-foreground">
                  {data.kpis.attentionItemsCount === 0 ? "All queues normal" : "Requires attention"}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Operational Attention Banner */}
        {data && data.attentionItems.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300 font-bold text-sm">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                Front Desk Operational Attention Queue ({data.attentionItems.length})
              </div>
              <span className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                Computed live from room &amp; reservation states
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.attentionItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg bg-card/90 border border-border p-3 flex flex-col justify-between gap-2 shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-foreground truncate">{item.title}</span>
                      <Badge
                        variant={item.severity === "critical" ? "destructive" : "warning"}
                        className="text-[9px] uppercase font-mono px-1 py-0"
                      >
                        {item.type.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                      {item.description}
                    </p>
                  </div>
                  {item.actionHref && (
                    <Link href={item.actionHref} className="self-end">
                      <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 text-primary hover:text-primary">
                        {item.actionLabel} <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Operational Workspace Tabs */}
        {data && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full sm:w-auto h-auto p-1 bg-muted/60">
              <TabsTrigger value="arrivals" className="text-xs py-2 gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Today&apos;s Arrivals ({data.arrivals.length})
              </TabsTrigger>
              <TabsTrigger value="departures" className="text-xs py-2 gap-1.5">
                <LogOut className="h-3.5 w-3.5" />
                Departures ({data.departures.length})
              </TabsTrigger>
              <TabsTrigger value="inHouse" className="text-xs py-2 gap-1.5">
                <Users className="h-3.5 w-3.5" />
                In-House Stays ({data.inHouse.length})
              </TabsTrigger>
              <TabsTrigger value="readiness" className="text-xs py-2 gap-1.5">
                <DoorOpen className="h-3.5 w-3.5" />
                Room Readiness ({data.kpis.totalRoomsCount})
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: Today's Arrivals */}
            <TabsContent value="arrivals" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">Today&apos;s Expected Arrivals</h3>
                  <p className="text-xs text-muted-foreground">
                    Confirmed reservations scheduled to check in today or awaiting arrival.
                  </p>
                </div>
                <Link href="/hotel/reservations">
                  <Button variant="outline" size="sm" className="text-xs h-8">
                    View All Reservations <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>

              {data.arrivals.length === 0 ? (
                <Card className="p-8 text-center bg-muted/10 border-dashed">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2 opacity-60" />
                  <p className="text-sm font-semibold text-foreground">No pending arrivals for today</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    All expected guests have either checked in or no more reservations are scheduled today.
                  </p>
                </Card>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[11px] text-muted-foreground uppercase bg-muted/40 border-b border-border">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Res #</th>
                          <th className="px-4 py-3 font-semibold">Guest Name</th>
                          <th className="px-4 py-3 font-semibold">Room Type</th>
                          <th className="px-4 py-3 font-semibold">Assigned Room</th>
                          <th className="px-4 py-3 font-semibold">Arrival / Departure</th>
                          <th className="px-4 py-3 font-semibold">Guests</th>
                          <th className="px-4 py-3 font-semibold text-right">Front Desk Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.arrivals.map((arr) => {
                          const hasRoom = !!arr.assignedRoomId;
                          const roomReady =
                            arr.assignedRoomOperationalStatus === "AVAILABLE" &&
                            (arr.assignedRoomHousekeepingStatus === "CLEAN" ||
                              arr.assignedRoomHousekeepingStatus === "INSPECTED");

                          return (
                            <tr key={arr.reservationId} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3 font-mono text-xs font-bold text-foreground">
                                {arr.reservationNumber}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-foreground">{arr.guestName}</span>
                                  {arr.vipStatus && arr.vipStatus !== "STANDARD" && (
                                    <Badge variant="warning" className="text-[9px] px-1 py-0">
                                      {arr.vipStatus}
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-[11px] text-muted-foreground">{arr.guestPhone}</span>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-foreground text-xs">{arr.roomTypeName}</p>
                                <span className="text-[10px] text-muted-foreground font-mono">{arr.roomTypeCode}</span>
                              </td>
                              <td className="px-4 py-3">
                                {hasRoom ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-bold text-xs">
                                      Room {arr.assignedRoomNumber}
                                    </span>
                                    {roomReady ? (
                                      <Badge variant="success" className="text-[9px] px-1 py-0">
                                        Ready
                                      </Badge>
                                    ) : (
                                      <Badge variant="warning" className="text-[9px] px-1 py-0">
                                        {arr.assignedRoomHousekeepingStatus || "Not Ready"}
                                      </Badge>
                                    )}
                                  </div>
                                ) : (
                                  <Badge variant="destructive" className="text-[10px] font-mono">
                                    Unassigned
                                  </Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs">
                                <p className="text-foreground">
                                  {new Date(arr.arrivalDate).toLocaleDateString()}
                                </p>
                                <span className="text-[11px] text-muted-foreground">
                                  until {new Date(arr.departureDate).toLocaleDateString()}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {arr.adultCount} Adult{arr.adultCount > 1 ? "s" : ""}
                                {arr.childrenCount > 0 ? `, ${arr.childrenCount} Ch` : ""}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  size="sm"
                                  className="h-8 text-xs gap-1 font-semibold"
                                  onClick={() => openCheckIn(arr)}
                                >
                                  <KeyRound className="h-3.5 w-3.5" />
                                  Check In
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB 2: Today's Departures */}
            <TabsContent value="departures" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">Today&apos;s Expected Departures</h3>
                  <p className="text-xs text-muted-foreground">
                    Active in-house stays scheduled for checkout today.
                  </p>
                </div>
                <Link href="/hotel/stays">
                  <Button variant="outline" size="sm" className="text-xs h-8">
                    View Stays Ledger <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>

              {data.departures.length === 0 ? (
                <Card className="p-8 text-center bg-muted/10 border-dashed">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2 opacity-60" />
                  <p className="text-sm font-semibold text-foreground">No pending departures scheduled today</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    No active stays are due for checkout today.
                  </p>
                </Card>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[11px] text-muted-foreground uppercase bg-muted/40 border-b border-border">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Stay #</th>
                          <th className="px-4 py-3 font-semibold">Room</th>
                          <th className="px-4 py-3 font-semibold">Guest</th>
                          <th className="px-4 py-3 font-semibold">Check-In Time</th>
                          <th className="px-4 py-3 font-semibold">Expected Departure</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold text-right">Front Desk Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.departures.map((dep) => (
                          <tr key={dep.stayId} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs font-bold text-foreground">
                              {dep.stayNumber}
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono font-black text-sm text-foreground">
                                Room {dep.roomNumber}
                              </span>
                              <p className="text-[10px] text-muted-foreground">{dep.roomTypeName}</p>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-foreground">{dep.guestName}</span>
                                {dep.vipStatus && dep.vipStatus !== "STANDARD" && (
                                  <Badge variant="warning" className="text-[9px] px-1 py-0">
                                    {dep.vipStatus}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[11px] text-muted-foreground">{dep.guestPhone}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                              {new Date(dep.checkInAt).toLocaleDateString()} {new Date(dep.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-4 py-3 text-xs font-mono">
                              <span className={dep.isOverdue ? "text-rose-600 font-bold dark:text-rose-400" : "text-foreground"}>
                                {new Date(dep.expectedCheckOutAt).toLocaleDateString()} {new Date(dep.expectedCheckOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {dep.isOverdue && (
                                <Badge variant="destructive" className="ml-1.5 text-[9px] py-0 px-1">
                                  Overdue
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="info" className="font-bold text-[10px]">
                                IN-HOUSE
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-8 text-xs gap-1 font-semibold"
                                onClick={() => openCheckout(dep)}
                              >
                                <LogOut className="h-3.5 w-3.5" />
                                Check Out
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB 3: In-House Guests / Stays */}
            <TabsContent value="inHouse" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">In-House Active Stays ({data.inHouse.length})</h3>
                  <p className="text-xs text-muted-foreground">
                    All guests currently registered and occupying hotel rooms.
                  </p>
                </div>
                <Link href="/hotel/stays">
                  <Button variant="outline" size="sm" className="text-xs h-8">
                    View Full Stays History <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>

              {data.inHouse.length === 0 ? (
                <Card className="p-8 text-center bg-muted/10 border-dashed">
                  <Users className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-semibold text-foreground">No active in-house guests</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {search ? "No stays match your search filter." : "The property currently has 0 occupied rooms."}
                  </p>
                </Card>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-[11px] text-muted-foreground uppercase bg-muted/40 border-b border-border">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Room</th>
                          <th className="px-4 py-3 font-semibold">Guest</th>
                          <th className="px-4 py-3 font-semibold">Stay Number</th>
                          <th className="px-4 py-3 font-semibold">Checked In</th>
                          <th className="px-4 py-3 font-semibold">Expected Departure</th>
                          <th className="px-4 py-3 font-semibold">Party</th>
                          <th className="px-4 py-3 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.inHouse.map((stay) => (
                          <tr key={stay.stayId} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-mono font-bold text-foreground">
                              <div className="flex items-center gap-1.5">
                                <DoorOpen className="h-4 w-4 text-primary" />
                                <span>Room {stay.roomNumber}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground font-sans font-normal">
                                {stay.roomTypeName}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-foreground">{stay.guestName}</span>
                                {stay.vipStatus && stay.vipStatus !== "STANDARD" && (
                                  <Badge variant="warning" className="text-[9px] px-1 py-0">
                                    {stay.vipStatus}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[11px] text-muted-foreground">{stay.guestPhone}</span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                              {stay.stayNumber}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                              {new Date(stay.checkInAt).toLocaleDateString()} {new Date(stay.checkInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-4 py-3 text-xs font-mono text-foreground">
                              {new Date(stay.expectedCheckOutAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {stay.adultCount} Adult{stay.adultCount > 1 ? "s" : ""}
                              {stay.childrenCount > 0 ? `, ${stay.childrenCount} Ch` : ""}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={() => {
                                    setSelectedInHouse(stay);
                                    setDetailModalOpen(true);
                                  }}
                                >
                                  Details
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                                  onClick={() => openCheckout(stay)}
                                >
                                  Check Out
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB 4: Room Readiness & Availability */}
            <TabsContent value="readiness" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">Room Readiness &amp; Inventory State</h3>
                  <p className="text-xs text-muted-foreground">
                    Live operational availability segregated from housekeeping cleanliness state.
                  </p>
                </div>
                <Link href="/hotel/rooms">
                  <Button variant="outline" size="sm" className="text-xs h-8">
                    View Full Room Rack <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Ready */}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase font-bold text-emerald-800 dark:text-emerald-300">
                      Clean &amp; Ready
                    </span>
                    <Sparkles className="h-4 w-4 text-emerald-500" />
                  </div>
                  <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                    {data.roomReadiness.cleanAvailable}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Available for immediate check-in</p>
                </div>

                {/* Dirty Available */}
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase font-bold text-amber-800 dark:text-amber-300">
                      Vacant Dirty
                    </span>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </div>
                  <p className="text-3xl font-black text-amber-600 dark:text-amber-400">
                    {data.roomReadiness.dirtyAvailable}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Needs housekeeping turnover</p>
                </div>

                {/* Occupied */}
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase font-bold text-blue-800 dark:text-blue-300">
                      Occupied
                    </span>
                    <BedDouble className="h-4 w-4 text-blue-500" />
                  </div>
                  <p className="text-3xl font-black text-blue-600 dark:text-blue-400">
                    {data.roomReadiness.occupied}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Active in-house guests</p>
                </div>

                {/* Out of Service */}
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase font-bold text-rose-800 dark:text-rose-300">
                      Out of Service
                    </span>
                    <ShieldAlert className="h-4 w-4 text-rose-500" />
                  </div>
                  <p className="text-3xl font-black text-rose-600 dark:text-rose-400">
                    {data.roomReadiness.outOfService}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Maintenance or inactive</p>
                </div>
              </div>

              {/* Invariant Note Card */}
              <Card className="bg-muted/10 border-border">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-md bg-primary/10 text-primary mt-0.5">
                      <ConciergeBell className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground">
                        Authoritative Front Office Invariants
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Occupancy is authoritatively determined by an <code className="text-primary font-mono">ACTIVE</code> Hotel Stay record. Room release at checkout transitions the room to <code className="text-primary font-mono">AVAILABLE</code> but flags housekeeping status as <code className="text-primary font-mono">DIRTY</code>, ensuring guests are only checked into clean rooms.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Check-In Modal (Authoritative Slice 3 check-in workflow) */}
        <Dialog open={checkInModalOpen} onOpenChange={setCheckInModalOpen}>
          <DialogContent className="max-w-md">
            <form onSubmit={handleCheckInSubmit}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  Check-In Guest Arrival
                </DialogTitle>
                <DialogDescription>
                  Allocate a clean physical room and spawn an active Hotel Stay record.
                </DialogDescription>
              </DialogHeader>

              {selectedArrival && (
                <div className="space-y-4 py-4 text-xs">
                  <div className="rounded-lg border border-border p-3.5 bg-muted/20 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Guest:</span>
                      <span className="font-semibold text-foreground">{selectedArrival.guestName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reservation:</span>
                      <span className="font-mono font-bold text-foreground">{selectedArrival.reservationNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Category:</span>
                      <span className="text-foreground">{selectedArrival.roomTypeName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dates:</span>
                      <span className="font-mono text-muted-foreground">
                        {new Date(selectedArrival.arrivalDate).toLocaleDateString()} → {new Date(selectedArrival.departureDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">
                      Allocate Physical Room <span className="text-destructive">*</span>
                    </label>
                    <select
                      className="w-full rounded-md border border-input bg-card px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      value={checkInRoomId}
                      onChange={(e) => setCheckInRoomId(e.target.value)}
                      required
                    >
                      <option value="">Select clean physical room...</option>
                      {availableRooms.map((room) => {
                        const isAvailable = room.operationalStatus === "AVAILABLE";
                        const isClean = room.housekeepingStatus === "CLEAN" || room.housekeepingStatus === "INSPECTED";
                        const isIdeal = isAvailable && isClean;
                        return (
                          <option
                            key={room.roomId}
                            value={room.roomId}
                            disabled={!isAvailable}
                          >
                            Room {room.roomNumber} ({room.operationalStatus} • {room.housekeepingStatus}) {isIdeal ? "✓ Ready" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">Front Desk Notes</label>
                    <Input
                      placeholder="e.g. Verified ID, issued 2 key cards"
                      value={checkInNotes}
                      onChange={(e) => setCheckInNotes(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCheckInModalOpen(false)}
                  disabled={checkInLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={checkInLoading || !checkInRoomId}
                  className="gap-1.5"
                >
                  {checkInLoading ? "Processing..." : "Confirm & Check In"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Check-Out Modal (Authoritative Slice 3 checkout workflow) */}
        <Dialog open={checkoutModalOpen} onOpenChange={setCheckoutModalOpen}>
          <DialogContent className="max-w-md">
            <form onSubmit={handleCheckoutSubmit}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-foreground">
                  <LogOut className="h-5 w-5 text-rose-500" />
                  Confirm Guest Check-Out
                </DialogTitle>
                <DialogDescription>
                  This action completes the Stay, releases room occupancy to AVAILABLE, and sets housekeeping status to DIRTY.
                </DialogDescription>
              </DialogHeader>

              {selectedDeparture && (
                <div className="space-y-4 py-4 text-xs">
                  <div className="rounded-lg border border-border p-3.5 bg-muted/20 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Guest:</span>
                      <span className="font-semibold text-foreground">{selectedDeparture.guestName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Room:</span>
                      <span className="font-mono font-bold text-foreground">Room {selectedDeparture.roomNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stay Reference:</span>
                      <span className="font-mono text-muted-foreground">{selectedDeparture.stayNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Check-in:</span>
                      <span className="font-mono text-foreground">{new Date(selectedDeparture.checkInAt).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">Departure / Turnover Notes</label>
                    <Input
                      placeholder="e.g. Left keys at desk, requested airport cab"
                      value={checkoutNotes}
                      onChange={(e) => setCheckoutNotes(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCheckoutModalOpen(false)}
                  disabled={checkoutLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={checkoutLoading}
                  className="gap-1.5"
                >
                  {checkoutLoading ? "Processing..." : "Complete Check-Out"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Stay Detail Dialog */}
        <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  In-House Stay Details
                </span>
                <Badge variant="info" className="font-bold text-[10px]">ACTIVE</Badge>
              </DialogTitle>
              <DialogDescription>
                Live stay record and occupant context.
              </DialogDescription>
            </DialogHeader>

            {selectedInHouse && (
              <div className="space-y-4 py-2 text-xs">
                <div className="grid grid-cols-2 gap-3.5 rounded-lg border border-border p-4 bg-muted/20">
                  <div>
                    <span className="text-muted-foreground">Guest</span>
                    <p className="font-semibold text-foreground text-sm">{selectedInHouse.guestName}</p>
                    <p className="text-muted-foreground">{selectedInHouse.guestPhone}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Room</span>
                    <p className="font-bold text-foreground text-sm flex items-center gap-1.5">
                      <DoorOpen className="h-4 w-4 text-emerald-500" />
                      Room {selectedInHouse.roomNumber}
                    </p>
                    <p className="text-muted-foreground">{selectedInHouse.roomTypeName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Stay Reference</span>
                    <p className="font-mono text-foreground font-semibold">{selectedInHouse.stayNumber}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Reservation</span>
                    <p className="font-mono text-foreground">{selectedInHouse.reservationNumber}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Check-In Time</span>
                    <p className="font-mono text-foreground">{new Date(selectedInHouse.checkInAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Expected Checkout</span>
                    <p className="font-mono text-foreground">{new Date(selectedInHouse.expectedCheckOutAt).toLocaleString()}</p>
                  </div>
                </div>

                {selectedInHouse.notes && (
                  <div className="rounded-lg border border-border p-3 bg-muted/10">
                    <span className="text-muted-foreground font-semibold">Stay Notes</span>
                    <p className="text-foreground mt-0.5">{selectedInHouse.notes}</p>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setDetailModalOpen(false)}
              >
                Close
              </Button>
              {selectedInHouse && (
                <Button
                  variant="destructive"
                  onClick={() => openCheckout(selectedInHouse)}
                  className="gap-1.5"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Check Out Guest
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
