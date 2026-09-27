"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { HotelNav } from "@/components/hotel/hotel-nav";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CalendarDays,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  UserX,
  Eye,
  AlertCircle,
  DoorOpen,
  BedDouble,
  User,
  Users,
  Check,
  AlertTriangle,
  KeyRound,
} from "lucide-react";

interface ReservationItem {
  reservationId: string;
  reservationNumber: string;
  tenantId: string;
  outletId: string;
  guestId: string;
  guestName: string;
  guestPhone: string;
  roomTypeId: string;
  roomTypeName: string;
  assignedRoomId: string | null;
  assignedRoomNumber: string | null;
  arrivalDate: string;
  departureDate: string;
  adultCount: number;
  childrenCount: number;
  status: "PENDING" | "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  specialRequests: string | null;
  totalAmount: string | null;
  createdAt: string;
}

interface RoomTypeOption {
  roomTypeId: string;
  name: string;
  code: string;
  baseRate: string;
}

interface GuestOption {
  guestId: string;
  fullName: string;
  phone: string;
  vipStatus: string;
}

interface RoomOption {
  roomId: string;
  roomNumber: string;
  roomTypeId: string;
  operationalStatus: string;
}

export default function HotelReservationsPage() {
  const [reservations, setReservations] = useState<ReservationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Options for booking
  const [roomTypes, setRoomTypes] = useState<RoomTypeOption[]>([]);
  const [guests, setGuests] = useState<GuestOption[]>([]);
  const [availableRooms, setAvailableRooms] = useState<RoomOption[]>([]);
  const [outletId, setOutletId] = useState<string>("");

  // Create Reservation Modal State
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formGuestId, setFormGuestId] = useState("");
  const [formRoomTypeId, setFormRoomTypeId] = useState("");
  const [formArrivalDate, setFormArrivalDate] = useState("");
  const [formDepartureDate, setFormDepartureDate] = useState("");
  const [formAdultCount, setFormAdultCount] = useState(1);
  const [formChildrenCount, setFormChildrenCount] = useState(0);
  const [formAssignedRoomId, setFormAssignedRoomId] = useState("");
  const [formSpecialRequests, setFormSpecialRequests] = useState("");
  const [formTotalAmount, setFormTotalAmount] = useState("");
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null);

  // Detail & Action Drawer/Modal State
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedRes, setSelectedRes] = useState<ReservationItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [assignRoomId, setAssignRoomId] = useState("");

  // Check-In Modal State
  const [checkInDialogOpen, setCheckInDialogOpen] = useState(false);
  const [checkInRes, setCheckInRes] = useState<ReservationItem | null>(null);
  const [checkInRoomId, setCheckInRoomId] = useState("");
  const [checkInNotes, setCheckInNotes] = useState("");
  const [checkInLoading, setCheckInLoading] = useState(false);

  // Initialize dates to tomorrow / 3 days ahead
  useEffect(() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const checkout = new Date(tomorrow);
    checkout.setDate(checkout.getDate() + 2);

    setFormArrivalDate(tomorrow.toISOString().split("T")[0]);
    setFormDepartureDate(checkout.toISOString().split("T")[0]);
  }, []);

  const loadReferenceData = async () => {
    try {
      // Properties
      const pRes = await fetch("/api/v1/hotel/properties");
      const pJson = await pRes.json();
      if (pJson.success && pJson.data.length > 0) {
        const propId = pJson.data[0].outletId;
        setOutletId(propId);

        // Room Types
        const rtRes = await fetch(`/api/v1/hotel/room-types?outletId=${propId}`);
        const rtJson = await rtRes.json();
        if (rtJson.success) {
          setRoomTypes(rtJson.data);
          if (rtJson.data.length > 0) {
            setFormRoomTypeId(rtJson.data[0].roomTypeId);
            setFormTotalAmount(rtJson.data[0].baseRate || "4500");
          }
        }

        // Rooms
        const rRes = await fetch(`/api/v1/hotel/rooms?outletId=${propId}`);
        const rJson = await rRes.json();
        if (rJson.success) {
          setAvailableRooms(rJson.data);
        }
      }

      // Guests
      const gRes = await fetch("/api/v1/hotel/guests");
      const gJson = await gRes.json();
      if (gJson.success) {
        setGuests(gJson.data);
        if (gJson.data.length > 0) {
          setFormGuestId(gJson.data[0].guestId);
        }
      }
    } catch {
      // Silent error during auxiliary options loading
    }
  };

  const fetchReservations = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = "/api/v1/hotel/reservations";
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.append("status", statusFilter);
      if (searchQuery) params.append("search", searchQuery);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setReservations(json.data);
      } else {
        setError(json.error?.message || "Failed to load reservations.");
      }
    } catch {
      setError("Network error fetching reservations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReferenceData();
  }, []);

  useEffect(() => {
    fetchReservations();
  }, [statusFilter, searchQuery]);

  // Check availability when room type or dates change
  const checkLiveAvailability = async () => {
    if (!outletId || !formRoomTypeId || !formArrivalDate || !formDepartureDate) return;
    try {
      const url = `/api/v1/hotel/reservations/availability?outletId=${outletId}&roomTypeId=${formRoomTypeId}&arrivalDate=${formArrivalDate}&departureDate=${formDepartureDate}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        const { availableRoomsCount, totalRooms, isAvailable } = json.data;
        if (isAvailable) {
          setAvailabilityMessage(`✓ Available: ${availableRoomsCount} of ${totalRooms} rooms free`);
        } else {
          setAvailabilityMessage(`⚠️ No rooms available for this date range (0/${totalRooms} free)`);
        }
      }
    } catch {
      setAvailabilityMessage(null);
    }
  };

  useEffect(() => {
    if (createDialogOpen) {
      checkLiveAvailability();
    }
  }, [createDialogOpen, formRoomTypeId, formArrivalDate, formDepartureDate]);

  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formGuestId || !formRoomTypeId || !formArrivalDate || !formDepartureDate) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/hotel/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outletId,
          guestId: formGuestId,
          roomTypeId: formRoomTypeId,
          arrivalDate: formArrivalDate,
          departureDate: formDepartureDate,
          adultCount: Number(formAdultCount),
          childrenCount: Number(formChildrenCount),
          assignedRoomId: formAssignedRoomId || undefined,
          specialRequests: formSpecialRequests.trim() || undefined,
          totalAmount: formTotalAmount ? Number(formTotalAmount) : undefined,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setCreateDialogOpen(false);
        setFormAssignedRoomId("");
        setFormSpecialRequests("");
        await fetchReservations();
      } else {
        alert("Booking failed: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error submitting reservation.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusTransition = async (newStatus: "CONFIRMED" | "CANCELLED" | "NO_SHOW") => {
    if (!selectedRes) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/hotel/reservations/${selectedRes.reservationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        setSelectedRes({ ...selectedRes, status: newStatus });
        await fetchReservations();
      } else {
        alert("State transition rejected: " + (json.error?.message || "Invalid state transition"));
      }
    } catch {
      alert("Error transitioning reservation state.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignRoom = async () => {
    if (!selectedRes || !assignRoomId) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/hotel/reservations/${selectedRes.reservationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedRoomId: assignRoomId }),
      });
      const json = await res.json();
      if (json.success) {
        const found = availableRooms.find((r) => r.roomId === assignRoomId);
        setSelectedRes({
          ...selectedRes,
          assignedRoomId: assignRoomId,
          assignedRoomNumber: found?.roomNumber || "Assigned",
        });
        await fetchReservations();
      } else {
        alert("Room assignment rejected: " + (json.error?.message || "Conflict or invalid room"));
      }
    } catch {
      alert("Error assigning room.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkInRes || !checkInRoomId) return;

    setCheckInLoading(true);
    try {
      const res = await fetch(`/api/v1/hotel/reservations/${checkInRes.reservationId}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: checkInRoomId,
          notes: checkInNotes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setCheckInDialogOpen(false);
        setCheckInRes(null);
        setCheckInNotes("");
        setDetailDialogOpen(false);
        await fetchReservations();
      } else {
        alert("Check-in failed: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error submitting check-in.");
    } finally {
      setCheckInLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "CHECKED_IN":
        return (
          <Badge variant="default" className="text-xs flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white">
            <KeyRound className="h-3 w-3" /> CHECKED IN
          </Badge>
        );
      case "COMPLETED":
        return (
          <Badge variant="outline" className="text-xs flex items-center gap-1 text-emerald-500 border-emerald-500/30">
            <CheckCircle2 className="h-3 w-3" /> COMPLETED
          </Badge>
        );
      case "CONFIRMED":
        return (
          <Badge variant="success" className="text-xs flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> CONFIRMED
          </Badge>
        );
      case "PENDING":
        return (
          <Badge variant="outline" className="text-xs flex items-center gap-1 text-amber-500 border-amber-500/30">
            <Clock className="h-3 w-3" /> PENDING
          </Badge>
        );
      case "CANCELLED":
        return (
          <Badge variant="destructive" className="text-xs flex items-center gap-1">
            <XCircle className="h-3 w-3" /> CANCELLED
          </Badge>
        );
      case "NO_SHOW":
        return (
          <Badge variant="outline" className="text-xs flex items-center gap-1 text-red-500 border-red-500/30">
            <UserX className="h-3 w-3" /> NO SHOW
          </Badge>
        );
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HotelNav />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
                <CalendarDays className="h-7 w-7 text-primary" />
                Hotel Reservations
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                {reservations.length} Bookings
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Planned booking lifecycle with room-type allocation & server-side conflict prevention.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchReservations}
              disabled={loading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="flex items-center gap-1.5">
                  <Plus className="h-4 w-4" />
                  New Reservation
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleCreateReservation}>
                  <DialogHeader>
                    <DialogTitle>Create Planned Reservation</DialogTitle>
                    <DialogDescription>
                      Assigns guest context, room type capacity, and date range invariants.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    {/* Guest Selection */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Hotel Guest Profile *</label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={formGuestId}
                        onChange={(e) => setFormGuestId(e.target.value)}
                        required
                      >
                        {guests.map((g) => (
                          <option key={g.guestId} value={g.guestId}>
                            {g.fullName} ({g.phone}) {g.vipStatus === "VIP" ? "★ VIP" : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Room Type */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Room Type Category *</label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={formRoomTypeId}
                        onChange={(e) => {
                          setFormRoomTypeId(e.target.value);
                          const rt = roomTypes.find((r) => r.roomTypeId === e.target.value);
                          if (rt) setFormTotalAmount(rt.baseRate || "4500");
                        }}
                        required
                      >
                        {roomTypes.map((rt) => (
                          <option key={rt.roomTypeId} value={rt.roomTypeId}>
                            {rt.name} ({rt.code}) — ₹{rt.baseRate}/night
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">Arrival Date *</label>
                        <Input
                          type="date"
                          value={formArrivalDate}
                          onChange={(e) => setFormArrivalDate(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">Departure Date *</label>
                        <Input
                          type="date"
                          value={formDepartureDate}
                          onChange={(e) => setFormDepartureDate(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    {/* Live Availability Notice */}
                    {availabilityMessage && (
                      <div className="text-xs font-medium px-3 py-2 rounded-md bg-muted/50 border border-border">
                        {availabilityMessage}
                      </div>
                    )}

                    {/* Guest Counts */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">Adults *</label>
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          value={formAdultCount}
                          onChange={(e) => setFormAdultCount(Number(e.target.value))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">Children</label>
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          value={formChildrenCount}
                          onChange={(e) => setFormChildrenCount(Number(e.target.value))}
                        />
                      </div>
                    </div>

                    {/* Optional Specific Room Assignment */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">
                        Specific Room Allocation (Optional)
                      </label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={formAssignedRoomId}
                        onChange={(e) => setFormAssignedRoomId(e.target.value)}
                      >
                        <option value="">-- Unassigned (Allocate at Check-In) --</option>
                        {availableRooms
                          .filter((r) => !formRoomTypeId || r.roomTypeId === formRoomTypeId)
                          .map((r) => (
                            <option key={r.roomId} value={r.roomId}>
                              Room {r.roomNumber} ({r.operationalStatus})
                            </option>
                          ))}
                      </select>
                      <p className="text-[11px] text-muted-foreground">
                        Specific assignment validates conflict absence across arrival/departure dates.
                      </p>
                    </div>

                    {/* Estimated Amount */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Estimated Total Rate (₹)</label>
                      <Input
                        type="number"
                        value={formTotalAmount}
                        onChange={(e) => setFormTotalAmount(e.target.value)}
                      />
                    </div>

                    {/* Special Requests */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Special Requests</label>
                      <Input
                        placeholder="Quiet floor, late check-in, extra bed"
                        value={formSpecialRequests}
                        onChange={(e) => setFormSpecialRequests(e.target.value)}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateDialogOpen(false)}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={submitting || !formGuestId || !formRoomTypeId || !formArrivalDate || !formDepartureDate}
                    >
                      {submitting ? "Booking..." : "Confirm & Create"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search & Status Filter Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reservations by number or guest name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-card"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {(["ALL", "CONFIRMED", "CHECKED_IN", "PENDING", "COMPLETED", "CANCELLED", "NO_SHOW"] as const).map((st) => (
              <Button
                key={st}
                variant={statusFilter === st ? "default" : "outline"}
                size="sm"
                className="text-xs h-9 px-3"
                onClick={() => setStatusFilter(st)}
              >
                {st === "CHECKED_IN" ? "Checked In" : st}
              </Button>
            ))}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Data Loading Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Reservations Table */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Booking Ledger</CardTitle>
            <CardDescription className="text-xs">
              Operational list of planned reservations, date spans, and allocated resources.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm">Loading hotel reservations...</span>
              </div>
            ) : reservations.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground space-y-2">
                <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-medium">No reservations match the criteria</p>
                <p className="text-xs text-muted-foreground">
                  Click 'New Reservation' to schedule a guest booking.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Reservation</th>
                      <th className="px-6 py-3">Guest</th>
                      <th className="px-6 py-3">Room Type / Room</th>
                      <th className="px-6 py-3">Dates</th>
                      <th className="px-6 py-3">Guests</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {reservations.map((res) => (
                      <tr key={res.reservationId} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-mono font-bold text-foreground">
                            {res.reservationNumber}
                          </span>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {res.createdAt ? new Date(res.createdAt).toLocaleDateString() : ""}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">{res.guestName}</div>
                          <div className="text-xs text-muted-foreground">{res.guestPhone}</div>
                        </td>
                        <td className="px-6 py-4 text-xs">
                          <div className="flex items-center gap-1.5 font-medium text-foreground">
                            <BedDouble className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{res.roomTypeName}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <DoorOpen className="h-3 w-3" />
                            {res.assignedRoomNumber ? (
                              <span className="font-semibold text-emerald-500">
                                Room {res.assignedRoomNumber}
                              </span>
                            ) : (
                              <span className="italic text-amber-500">Unassigned</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs">
                          <div className="font-mono font-medium text-foreground">{res.arrivalDate}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            to {res.departureDate}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground">
                          {res.adultCount} Adult{res.adultCount > 1 ? "s" : ""}
                          {res.childrenCount > 0 ? `, ${res.childrenCount} Child` : ""}
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(res.status)}
                        </td>
                        <td className="px-6 py-4 text-right space-x-1.5">
                          {res.status === "CONFIRMED" && (
                            <Button
                              size="sm"
                              className="h-8 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => {
                                setCheckInRes(res);
                                setCheckInRoomId(res.assignedRoomId || "");
                                setCheckInNotes("");
                                setCheckInDialogOpen(true);
                              }}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              Check In
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => {
                              setSelectedRes(res);
                              setAssignRoomId(res.assignedRoomId || "");
                              setDetailDialogOpen(true);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Manage
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reservation Manage & State Machine Actions Dialog */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  Reservation {selectedRes?.reservationNumber}
                </span>
                {selectedRes && getStatusBadge(selectedRes.status)}
              </DialogTitle>
              <DialogDescription>
                Server-side state machine operations and room assignment.
              </DialogDescription>
            </DialogHeader>

            {selectedRes && (
              <div className="space-y-6 py-2">
                {/* Summary Info */}
                <div className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4 bg-muted/20 text-xs">
                  <div>
                    <span className="text-muted-foreground">Guest</span>
                    <p className="font-semibold text-foreground text-sm">{selectedRes.guestName}</p>
                    <p className="text-muted-foreground">{selectedRes.guestPhone}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Room Type</span>
                    <p className="font-semibold text-foreground text-sm">{selectedRes.roomTypeName}</p>
                    <p className="text-muted-foreground">
                      Assigned Room: {selectedRes.assignedRoomNumber ? `Room ${selectedRes.assignedRoomNumber}` : "Not Assigned"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Arrival Date</span>
                    <p className="font-mono font-semibold text-foreground text-sm">{selectedRes.arrivalDate}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Departure Date</span>
                    <p className="font-mono font-semibold text-foreground text-sm">{selectedRes.departureDate}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Occupants</span>
                    <p className="text-foreground">
                      {selectedRes.adultCount} Adult{selectedRes.adultCount > 1 ? "s" : ""}
                      {selectedRes.childrenCount > 0 ? `, ${selectedRes.childrenCount} Child` : ""}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Rate</span>
                    <p className="text-foreground font-semibold">
                      {selectedRes.totalAmount ? `₹${selectedRes.totalAmount}` : "Standard Rate"}
                    </p>
                  </div>
                  {selectedRes.specialRequests && (
                    <div className="col-span-2 pt-2 border-t border-border">
                      <span className="text-muted-foreground">Special Requests</span>
                      <p className="text-foreground mt-0.5">{selectedRes.specialRequests}</p>
                    </div>
                  )}
                </div>

                {/* Specific Room Assignment Action */}
                {(selectedRes.status === "PENDING" || selectedRes.status === "CONFIRMED") && (
                  <div className="rounded-lg border border-border p-4 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <DoorOpen className="h-4 w-4 text-primary" />
                      Assign Physical Room
                    </h4>
                    <div className="flex items-center gap-3">
                      <select
                        className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={assignRoomId}
                        onChange={(e) => setAssignRoomId(e.target.value)}
                      >
                        <option value="">-- Select Room --</option>
                        {availableRooms
                          .filter((r) => r.roomTypeId === selectedRes.roomTypeId)
                          .map((r) => (
                            <option key={r.roomId} value={r.roomId}>
                              Room {r.roomNumber} ({r.operationalStatus})
                            </option>
                          ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={handleAssignRoom}
                        disabled={actionLoading || !assignRoomId || assignRoomId === selectedRes.assignedRoomId}
                      >
                        Assign Room
                      </Button>
                    </div>
                  </div>
                )}

                {/* Lifecycle State Actions */}
                <div className="rounded-lg border border-border p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    State Machine Lifecycle Actions
                  </h4>

                  {selectedRes.status === "PENDING" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleStatusTransition("CONFIRMED")}
                        disabled={actionLoading}
                      >
                        <Check className="h-4 w-4" />
                        Confirm Reservation
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleStatusTransition("CANCELLED")}
                        disabled={actionLoading}
                      >
                        <XCircle className="h-4 w-4" />
                        Cancel Reservation
                      </Button>
                    </div>
                  )}

                  {selectedRes.status === "CONFIRMED" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                        onClick={() => {
                          setCheckInRes(selectedRes);
                          setCheckInRoomId(selectedRes.assignedRoomId || "");
                          setCheckInNotes("");
                          setCheckInDialogOpen(true);
                        }}
                        disabled={actionLoading}
                      >
                        <KeyRound className="h-4 w-4" />
                        Check In Guest
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleStatusTransition("CANCELLED")}
                        disabled={actionLoading}
                      >
                        <XCircle className="h-4 w-4" />
                        Cancel Reservation
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-red-500 border-red-500/30 hover:bg-red-500/10"
                        onClick={() => handleStatusTransition("NO_SHOW")}
                        disabled={actionLoading}
                      >
                        <UserX className="h-4 w-4" />
                        Mark No-Show
                      </Button>
                    </div>
                  )}

                  {selectedRes.status === "CHECKED_IN" && (
                    <div className="flex items-center justify-between p-3 rounded-md bg-blue-500/10 border border-blue-500/30 text-xs">
                      <div className="flex items-center gap-2 text-blue-400">
                        <KeyRound className="h-4 w-4 shrink-0" />
                        <span>Guest is currently in-house. Manage occupancy or check-out in Stays Ledger.</span>
                      </div>
                      <Link href="/hotel/stays">
                        <Button size="sm" variant="outline" className="h-7 text-xs whitespace-nowrap">
                          Open Stays Ledger
                        </Button>
                      </Link>
                    </div>
                  )}

                  {selectedRes.status === "COMPLETED" && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 rounded-md bg-muted/40 border border-border">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>
                        This reservation has concluded and is <strong>COMPLETED</strong>.
                      </span>
                    </div>
                  )}

                  {(selectedRes.status === "CANCELLED" || selectedRes.status === "NO_SHOW") && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 rounded-md bg-muted/40 border border-border">
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                      <span>
                        This reservation is in a terminal state (<strong>{selectedRes.status}</strong>) and cannot transition further.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Check-In Dialog */}
        <Dialog open={checkInDialogOpen} onOpenChange={setCheckInDialogOpen}>
          <DialogContent className="max-w-md">
            <form onSubmit={handleCheckInSubmit}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-emerald-500" />
                  Check In Guest
                </DialogTitle>
                <DialogDescription>
                  Initiates an active Stay, assigns the physical room, and marks the room as OCCUPIED.
                </DialogDescription>
              </DialogHeader>

              {checkInRes && (
                <div className="space-y-4 py-4 text-xs">
                  <div className="rounded-lg border border-border p-3.5 bg-muted/20 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Guest:</span>
                      <span className="font-semibold text-foreground">{checkInRes.guestName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Room Type:</span>
                      <span className="font-medium text-foreground">{checkInRes.roomTypeName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stay Dates:</span>
                      <span className="font-mono text-foreground">{checkInRes.arrivalDate} → {checkInRes.departureDate}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">Select Physical Room *</label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={checkInRoomId}
                      onChange={(e) => setCheckInRoomId(e.target.value)}
                      required
                    >
                      <option value="">-- Choose available room --</option>
                      {availableRooms
                        .filter(
                          (r) =>
                            r.roomTypeId === checkInRes.roomTypeId &&
                            (r.operationalStatus === "AVAILABLE" || r.roomId === checkInRes.assignedRoomId)
                        )
                        .map((r) => (
                          <option key={r.roomId} value={r.roomId}>
                            Room {r.roomNumber} ({r.operationalStatus})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">Check-in Notes</label>
                    <Input
                      placeholder="e.g. VIP welcome kit provided, keycard issued"
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
                  onClick={() => setCheckInDialogOpen(false)}
                  disabled={checkInLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={checkInLoading || !checkInRoomId}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  {checkInLoading ? "Checking In..." : "Confirm Check-In"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
