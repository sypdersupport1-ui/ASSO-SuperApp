"use client";

import React, { useState, useEffect } from "react";
import { HotelNav } from "@/components/hotel/hotel-nav";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { hotelFetch } from "@/lib/hotel/client-auth";
import { useToast } from "@/components/ui/toast";
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
  DoorOpen,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Wrench,
  BedDouble,
  User,
  LogOut,
  QrCode,
  RotateCcw,
  Ban,
  Copy,
  ExternalLink,
  LayoutGrid,
  Grid3X3,
  CalendarDays,
  ShieldCheck,
} from "lucide-react";
import {
  HOTEL_OPERATIONAL_STATUSES,
  HOTEL_HOUSEKEEPING_STATUSES,
  type HotelOperationalStatus,
  type HotelHousekeepingStatus,
} from "@/db/schema/hotel";

interface RoomItem {
  roomId: string;
  contextId: string;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeCode: string;
  baseRate: string;
  roomNumber: string;
  floorNumber: string | null;
  operationalStatus: HotelOperationalStatus;
  housekeepingStatus: HotelHousekeepingStatus;
  isOccupied: boolean;
  isActive: boolean;
  currentOccupant?: string | null;
  currentStayNumber?: string | null;
  currentStayId?: string | null;
  expectedCheckOutAt?: string | null;
}

interface RoomTypeItem {
  roomTypeId: string;
  code: string;
  name: string;
  baseRate: string;
}

export default function HotelRoomsPage() {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Display Density Control (HUI-2)
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [floorFilter, setFloorFilter] = useState<string>("ALL");
  const [opFilter, setOpFilter] = useState<string>("ALL");
  const [hkFilter, setHkFilter] = useState<string>("ALL");

  // Create Room Dialog State
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState("");
  const [newFloor, setNewFloor] = useState("1");
  const [newRoomTypeId, setNewRoomTypeId] = useState("");
  const [creating, setCreating] = useState(false);

  // Status Update Dialog State
  const [selectedRoom, setSelectedRoom] = useState<RoomItem | null>(null);
  const [updateOpStatus, setUpdateOpStatus] = useState<HotelOperationalStatus>("AVAILABLE");
  const [updateHkStatus, setUpdateHkStatus] = useState<HotelHousekeepingStatus>("CLEAN");
  const [updating, setUpdating] = useState(false);

  // QR Code Management State
  const [qrRoom, setQrRoom] = useState<RoomItem | null>(null);
  const [qrData, setQrData] = useState<{
    tokenId: string;
    opaqueToken: string;
    tokenStatus: string;
    qrUrl: string;
    qrSvgDataUri: string;
    createdAt: string;
  } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrActionLoading, setQrActionLoading] = useState(false);

  // Load density from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedDensity = localStorage.getItem("asso_hotel_rack_density");
      if (savedDensity === "comfortable" || savedDensity === "compact") {
        setDensity(savedDensity);
      }
    }
  }, []);

  const handleDensityChange = (newDensity: "comfortable" | "compact") => {
    setDensity(newDensity);
    if (typeof window !== "undefined") {
      localStorage.setItem("asso_hotel_rack_density", newDensity);
    }
  };

  const openQrModal = async (room: RoomItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setQrRoom(room);
    setQrData(null);
    setQrLoading(true);
    try {
      const res = await hotelFetch(`/api/v1/hotel/rooms/${room.roomId}/qr?outletId=${room.roomTypeId ? "00000000-0000-0000-0000-000000000001" : ""}`);
      const json = await res.json();
      if (json.success && json.data) {
        setQrData(json.data);
      }
    } catch {
      // Ignore
    } finally {
      setQrLoading(false);
    }
  };

  const handleRotateQr = async () => {
    if (!qrRoom) return;
    if (!confirm(`Rotate QR code for Room ${qrRoom.roomNumber}? Previous QR token and guest sessions will be invalidated.`)) return;
    setQrActionLoading(true);
    try {
      const res = await hotelFetch(`/api/v1/hotel/rooms/${qrRoom.roomId}/qr/rotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "STAFF_REQUESTED_ROTATION" }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setQrData(json.data);
        toast.success(`QR code for Room ${qrRoom.roomNumber} rotated successfully.`);
      } else {
        toast.error(json.error?.message || "Failed to rotate QR code.");
      }
    } catch {
      toast.error("Error rotating QR code.");
    } finally {
      setQrActionLoading(false);
    }
  };

  const handleRevokeQr = async () => {
    if (!qrRoom) return;
    const reason = prompt(`Enter revocation reason for Room ${qrRoom.roomNumber} QR code:`, "MAINTENANCE_OR_SUSPECTED_TAMPERING");
    if (!reason) return;
    setQrActionLoading(true);
    try {
      const res = await hotelFetch(`/api/v1/hotel/rooms/${qrRoom.roomId}/qr/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setQrData(json.data);
        toast.success(`QR code for Room ${qrRoom.roomNumber} revoked.`);
      } else {
        toast.error(json.error?.message || "Failed to revoke QR code.");
      }
    } catch {
      toast.error("Error revoking QR code.");
    } finally {
      setQrActionLoading(false);
    }
  };

  const fetchRoomsAndTypes = async () => {
    setLoading(true);
    setError(null);
    try {
      const [roomsRes, typesRes] = await Promise.all([
        hotelFetch("/api/v1/hotel/rooms"),
        hotelFetch("/api/v1/hotel/room-types"),
      ]);

      const roomsJson = await roomsRes.json();
      const typesJson = await typesRes.json();

      if (roomsJson.success) {
        setRooms(roomsJson.data);
      } else {
        setError(roomsJson.error?.message || "Failed to load hotel rooms.");
      }

      if (typesJson.success) {
        setRoomTypes(typesJson.data);
        if (typesJson.data.length > 0 && !newRoomTypeId) {
          setNewRoomTypeId(typesJson.data[0].roomTypeId);
        }
      }
    } catch {
      setError("Network or server connection failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoomsAndTypes();
  }, []);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomNumber || !newRoomTypeId) return;

    setCreating(true);
    try {
      const res = await hotelFetch("/api/v1/hotel/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomNumber: newRoomNumber,
          floorNumber: newFloor || "1",
          roomTypeId: newRoomTypeId,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setCreateDialogOpen(false);
        setNewRoomNumber("");
        toast.success(`Room ${newRoomNumber} created successfully.`);
        await fetchRoomsAndTypes();
      } else {
        toast.error("Failed to create room: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      toast.error("Error creating room.");
    } finally {
      setCreating(false);
    }
  };

  const openStatusModal = (room: RoomItem) => {
    setSelectedRoom(room);
    setUpdateOpStatus(room.operationalStatus);
    setUpdateHkStatus(room.housekeepingStatus);
  };

  const handleUpdateStatus = async () => {
    if (!selectedRoom) return;

    setUpdating(true);
    try {
      const res = await hotelFetch(`/api/v1/hotel/rooms/${selectedRoom.roomId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationalStatus: updateOpStatus,
          housekeepingStatus: updateHkStatus,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSelectedRoom(null);
        toast.success(`Room ${selectedRoom.roomNumber} status updated.`);
        await fetchRoomsAndTypes();
      } else {
        toast.error("Status update rejected: " + (json.error?.message || "State transition violation"));
      }
    } catch {
      toast.error("Network error while updating room status.");
    } finally {
      setUpdating(false);
    }
  };

  // Filter Logic
  const floors = Array.from(new Set(rooms.map((r) => r.floorNumber).filter(Boolean))).sort();

  const filteredRooms = rooms.filter((r) => {
    const matchesSearch =
      r.roomNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.roomTypeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.currentOccupant && r.currentOccupant.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesFloor = floorFilter === "ALL" || r.floorNumber === floorFilter;
    const matchesOp = opFilter === "ALL" || r.operationalStatus === opFilter;
    const matchesHk = hkFilter === "ALL" || r.housekeepingStatus === hkFilter;

    return matchesSearch && matchesFloor && matchesOp && matchesHk;
  });

  const getOpBadge = (status: HotelOperationalStatus, compact = false) => {
    switch (status) {
      case "AVAILABLE":
        return <Badge variant="success" className={`${compact ? "text-[9px] px-1 py-0" : "text-[10px]"}`}>Available</Badge>;
      case "OCCUPIED":
        return <Badge variant="info" className={`${compact ? "text-[9px] px-1 py-0 font-bold" : "text-[10px]"}`}>Occupied</Badge>;
      case "RESERVED":
        return <Badge variant="warning" className={`${compact ? "text-[9px] px-1 py-0" : "text-[10px]"}`}>Reserved</Badge>;
      case "OUT_OF_SERVICE":
      case "OUT_OF_ORDER":
        return <Badge variant="destructive" className={`${compact ? "text-[9px] px-1 py-0" : "text-[10px]"}`}>{compact ? "OOO" : status.replace(/_/g, " ")}</Badge>;
      default:
        return <Badge variant="outline" className={`${compact ? "text-[9px] px-1 py-0" : "text-[10px]"}`}>{status}</Badge>;
    }
  };

  const getHkBadge = (status: HotelHousekeepingStatus, compact = false) => {
    switch (status) {
      case "CLEAN":
        return <Badge variant="success" className={`bg-emerald-600 ${compact ? "text-[9px] px-1 py-0" : "text-[10px]"}`}>Clean</Badge>;
      case "DIRTY":
        return <Badge variant="warning" className={`${compact ? "text-[9px] px-1 py-0" : "text-[10px]"}`}>Dirty</Badge>;
      case "CLEANING":
        return <Badge variant="info" className={`${compact ? "text-[9px] px-1 py-0" : "text-[10px]"}`}>Cleaning</Badge>;
      case "INSPECTED":
        return <Badge className={`bg-purple-600 hover:bg-purple-700 ${compact ? "text-[9px] px-1 py-0" : "text-[10px]"}`}>Inspected</Badge>;
      case "MAINTENANCE":
        return <Badge variant="destructive" className={`${compact ? "text-[9px] px-1 py-0" : "text-[10px]"}`}>{compact ? "Maint" : "Maintenance"}</Badge>;
      default:
        return <Badge variant="outline" className={`${compact ? "text-[9px] px-1 py-0" : "text-[10px]"}`}>{status}</Badge>;
    }
  };

  // Quick stats
  const totalClean = rooms.filter((r) => r.housekeepingStatus === "CLEAN" || r.housekeepingStatus === "INSPECTED").length;
  const totalDirty = rooms.filter((r) => r.housekeepingStatus === "DIRTY").length;
  const totalOccupied = rooms.filter((r) => r.isOccupied || r.operationalStatus === "OCCUPIED").length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HotelNav />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <DoorOpen className="h-6 w-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                Room Rack &amp; Operational Matrix
              </h1>
              <Badge variant="outline" className="font-mono text-xs text-primary border-primary/30">
                {rooms.length} Rooms
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Visual operational room rack with dual-state segregation (Operational Status + Housekeeping Cleanliness).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Display Density Switcher (HUI-2) */}
            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => handleDensityChange("comfortable")}
                aria-label="Comfortable Grid View"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  density === "comfortable"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Comfortable</span>
              </button>
              <button
                type="button"
                onClick={() => handleDensityChange("compact")}
                aria-label="Compact Grid View"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  density === "compact"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Compact</span>
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchRoomsAndTypes}
              disabled={loading}
              className="flex items-center gap-1.5 h-9"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="flex items-center gap-1.5 h-9">
                  <Plus className="h-4 w-4" />
                  <span>Add Room</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreateRoom}>
                  <DialogHeader>
                    <DialogTitle>Add Hotel Room</DialogTitle>
                    <DialogDescription>
                      Creates a physical hotel room entity mapped 1:1 to an ASSO business context.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Room Number *</label>
                      <Input
                        placeholder="e.g. 101, 202, PH-01"
                        value={newRoomNumber}
                        onChange={(e) => setNewRoomNumber(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Floor Number</label>
                      <Input
                        placeholder="e.g. 1, 2, 3"
                        value={newFloor}
                        onChange={(e) => setNewFloor(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Room Type *</label>
                      <select
                        className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        value={newRoomTypeId}
                        onChange={(e) => setNewRoomTypeId(e.target.value)}
                        required
                      >
                        {roomTypes.map((rt) => (
                          <option key={rt.roomTypeId} value={rt.roomTypeId}>
                            {rt.name} ({rt.code}) — ₹{Number(rt.baseRate).toLocaleString("en-IN")}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={creating || !newRoomNumber}>
                      {creating ? "Creating..." : "Create Room"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Quick Room Rack Health Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-lg border border-border bg-card flex items-center justify-between">
            <span className="text-muted-foreground">Total Inventory:</span>
            <span className="font-bold text-foreground font-mono">{rooms.length} Rooms</span>
          </div>
          <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between">
            <span className="text-emerald-700 dark:text-emerald-300">Clean &amp; Ready:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">{totalClean}</span>
          </div>
          <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 flex items-center justify-between">
            <span className="text-amber-700 dark:text-amber-300">Dirty / Turnover:</span>
            <span className="font-bold text-amber-600 dark:text-amber-400 font-mono">{totalDirty}</span>
          </div>
          <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/5 flex items-center justify-between">
            <span className="text-blue-700 dark:text-blue-300">Occupied:</span>
            <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">{totalOccupied}</span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <Card className="bg-card border-border">
          <CardContent className="p-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search room #, guest, or type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-xs h-9"
                />
              </div>

              {/* Floor Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Floor:</span>
                <select
                  className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  value={floorFilter}
                  onChange={(e) => setFloorFilter(e.target.value)}
                >
                  <option value="ALL">All Floors</option>
                  {floors.map((fl) => (
                    <option key={fl} value={fl!}>Floor {fl}</option>
                  ))}
                </select>
              </div>

              {/* Operational Status Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Status:</span>
                <select
                  className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  value={opFilter}
                  onChange={(e) => setOpFilter(e.target.value)}
                >
                  <option value="ALL">All Operational</option>
                  {HOTEL_OPERATIONAL_STATUSES.map((st) => (
                    <option key={st} value={st}>{st.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>

              {/* Housekeeping Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">HK:</span>
                <select
                  className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  value={hkFilter}
                  onChange={(e) => setHkFilter(e.target.value)}
                >
                  <option value="ALL">All Housekeeping</option>
                  {HOTEL_HOUSEKEEPING_STATUSES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Room Rack Grid */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 animate-pulse">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
              <div key={i} className="h-32 rounded-xl bg-muted/50" />
            ))}
          </div>
        )}

        {!loading && filteredRooms.length === 0 && (
          <Card className="text-center py-12 border-dashed">
            <CardContent>
              <DoorOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-60" />
              <p className="text-sm font-semibold">No rooms match current criteria</p>
              <p className="text-xs text-muted-foreground mt-1">Try resetting filters or adding new rooms.</p>
            </CardContent>
          </Card>
        )}

        {!loading && filteredRooms.length > 0 && (
          <>
            {/* 1. COMFORTABLE DENSITY VIEW */}
            {density === "comfortable" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredRooms.map((room) => {
                  const isClean = room.housekeepingStatus === "CLEAN" || room.housekeepingStatus === "INSPECTED";
                  const isAvailable = room.operationalStatus === "AVAILABLE";

                  return (
                    <div
                      key={room.roomId}
                      onClick={() => openStatusModal(room)}
                      className={`group relative rounded-xl border p-4 transition-all duration-200 cursor-pointer hover:shadow-md ${
                        room.operationalStatus === "OCCUPIED"
                          ? "bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40"
                          : isAvailable && isClean
                          ? "bg-card border-border hover:border-primary/50"
                          : isAvailable && !isClean
                          ? "bg-amber-50/30 dark:bg-amber-950/15 border-amber-300/40 dark:border-amber-800/30"
                          : "bg-muted/30 border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-2xl font-black text-foreground tracking-tight">
                            {room.roomNumber}
                          </span>
                          <p className="text-xs font-medium text-muted-foreground">
                            {room.floorNumber ? `Floor ${room.floorNumber}` : "Ground Floor"}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          {getOpBadge(room.operationalStatus)}
                          {getHkBadge(room.housekeepingStatus)}
                        </div>
                      </div>

                      {room.currentOccupant ? (
                        <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold truncate max-w-[130px]">
                            <User className="h-3 w-3 shrink-0" />
                            <span className="truncate">{room.currentOccupant}</span>
                          </div>
                          {room.expectedCheckOutAt && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              Out: {new Date(room.expectedCheckOutAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground truncate max-w-[130px]">
                            {room.roomTypeName}
                          </span>
                          <span className="font-semibold text-muted-foreground">
                            ₹{Number(room.baseRate).toLocaleString("en-IN")}
                          </span>
                        </div>
                      )}

                      <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                        <span className="truncate max-w-[110px]">ctx: {room.contextId.slice(0, 8)}...</span>
                        <button
                          type="button"
                          onClick={(e) => openQrModal(room, e)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary font-sans font-semibold text-[11px] transition"
                        >
                          <QrCode className="h-3 w-3" />
                          <span>QR</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 2. COMPACT DENSITY VIEW (High-density matrix for busy front desk) */}
            {density === "compact" && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
                {filteredRooms.map((room) => {
                  const isClean = room.housekeepingStatus === "CLEAN" || room.housekeepingStatus === "INSPECTED";
                  const isAvailable = room.operationalStatus === "AVAILABLE";

                  return (
                    <div
                      key={room.roomId}
                      onClick={() => openStatusModal(room)}
                      className={`group relative rounded-lg border p-2.5 transition-all duration-150 cursor-pointer hover:shadow-sm ${
                        room.operationalStatus === "OCCUPIED"
                          ? "bg-blue-50/50 dark:bg-blue-950/25 border-blue-300 dark:border-blue-900/60"
                          : isAvailable && isClean
                          ? "bg-card border-border hover:border-primary/50"
                          : isAvailable && !isClean
                          ? "bg-amber-50/40 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/40"
                          : "bg-muted/40 border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-base font-black text-foreground tracking-tight">
                          {room.roomNumber}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          F{room.floorNumber || "1"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 my-1.5">
                        {getOpBadge(room.operationalStatus, true)}
                        {getHkBadge(room.housekeepingStatus, true)}
                      </div>

                      <div className="text-[11px] truncate">
                        {room.currentOccupant ? (
                          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold truncate">
                            <User className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{room.currentOccupant}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground truncate">{room.roomTypeCode}</span>
                        )}
                      </div>

                      <div className="mt-1.5 pt-1 border-t border-border/40 flex items-center justify-between text-[9px] text-muted-foreground">
                        <span className="font-mono">₹{Number(room.baseRate).toLocaleString("en-IN")}</span>
                        <button
                          type="button"
                          onClick={(e) => openQrModal(room, e)}
                          title="Manage QR Code"
                          className="text-primary hover:text-primary/80"
                        >
                          <QrCode className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Status Transition Dialog */}
        {selectedRoom && (
          <Dialog open={!!selectedRoom} onOpenChange={(open) => !open && setSelectedRoom(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DoorOpen className="h-5 w-5 text-primary" />
                  Room {selectedRoom.roomNumber} Status Controls
                </DialogTitle>
                <DialogDescription>
                  {selectedRoom.roomTypeName} • {selectedRoom.floorNumber ? `Floor ${selectedRoom.floorNumber}` : "Main"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-4">
                {selectedRoom.currentOccupant && selectedRoom.currentStayId && (
                  <div className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 font-semibold">
                        <User className="h-4 w-4" />
                        <span>In-House Guest: {selectedRoom.currentOccupant}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono text-blue-500 border-blue-500/30">
                        {selectedRoom.currentStayNumber}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Expected departure: {selectedRoom.expectedCheckOutAt ? new Date(selectedRoom.expectedCheckOutAt).toLocaleDateString() : "Unscheduled"}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs text-rose-600 border-rose-500/30 hover:bg-rose-500/10 gap-1.5"
                      onClick={async () => {
                        if (!confirm(`Check out ${selectedRoom.currentOccupant} from Room ${selectedRoom.roomNumber}?`)) return;
                        setUpdating(true);
                        try {
                          const res = await hotelFetch(`/api/v1/hotel/stays/${selectedRoom.currentStayId}/check-out`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ notes: "Checked out from Room Rack" }),
                          });
                          const json = await res.json();
                          if (json.success) {
                            toast.success(`Guest ${selectedRoom.currentOccupant || ""} checked out.`);
                            setSelectedRoom(null);
                            await fetchRoomsAndTypes();
                          } else {
                            toast.error("Check-out failed: " + (json.error?.message || "Unknown error"));
                          }
                        } catch {
                          toast.error("Error processing check-out.");
                        } finally {
                          setUpdating(false);
                        }
                      }}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Check Out Guest Now
                    </Button>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Operational State Transition</span>
                    <span className="text-muted-foreground font-normal">Current: {selectedRoom.operationalStatus}</span>
                  </label>
                  <select
                    className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    value={updateOpStatus}
                    onChange={(e) => setUpdateOpStatus(e.target.value as HotelOperationalStatus)}
                  >
                    {HOTEL_OPERATIONAL_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st.replace(/_/g, " ")} {st === selectedRoom.operationalStatus ? "(Current)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>Housekeeping State Transition</span>
                    <span className="text-muted-foreground font-normal">Current: {selectedRoom.housekeepingStatus}</span>
                  </label>
                  <select
                    className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    value={updateHkStatus}
                    onChange={(e) => setUpdateHkStatus(e.target.value as HotelHousekeepingStatus)}
                  >
                    {HOTEL_HOUSEKEEPING_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st} {st === selectedRoom.housekeepingStatus ? "(Current)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">Business State Rules:</p>
                  <p>• Only CLEAN/INSPECTED rooms can be occupied.</p>
                  <p>• State transitions are strictly validated and recorded in immutable audit events.</p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedRoom(null)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateStatus} disabled={updating}>
                  {updating ? "Saving..." : "Apply Transition"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* QR Code Administration Dialog */}
        {qrRoom && (
          <Dialog open={!!qrRoom} onOpenChange={(open) => !open && setQrRoom(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary" />
                  Room {qrRoom.roomNumber} QR Administration
                </DialogTitle>
                <DialogDescription>
                  Digital guest entry token for Room {qrRoom.roomNumber} ({qrRoom.roomTypeName})
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-3">
                {qrLoading && (
                  <div className="py-10 text-center space-y-2">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-xs text-muted-foreground">Loading room QR code...</p>
                  </div>
                )}

                {!qrLoading && qrData && (
                  <div className="space-y-4">
                    {/* Visual QR Card */}
                    <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 border rounded-2xl shadow-inner">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrData.qrSvgDataUri}
                        alt={`QR code for Room ${qrRoom.roomNumber}`}
                        className="w-48 h-48 rounded-lg shadow-sm"
                      />
                      <div className="mt-2 text-center">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Room {qrRoom.roomNumber} Guest Entry
                        </span>
                        <div className="flex items-center justify-center gap-1.5 mt-1">
                          <Badge
                            variant={qrData.tokenStatus === "ACTIVE" ? "default" : "destructive"}
                            className="text-[10px]"
                          >
                            {qrData.tokenStatus}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {qrData.opaqueToken.slice(0, 10)}...
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Guest Landing URL Link */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">Customer Landing URL</label>
                      <div className="flex items-center gap-2">
                        <Input
                          readOnly
                          value={qrData.qrUrl}
                          className="text-xs font-mono bg-muted/50 h-8"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5 text-xs gap-1"
                          onClick={() => {
                            navigator.clipboard.writeText(qrData.qrUrl);
                            toast.success("Copied guest link to clipboard!");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5 text-xs gap-1"
                          onClick={() => window.open(qrData.qrUrl, "_blank")}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Administrative Actions */}
                    <div className="pt-2 border-t flex flex-col gap-2">
                      <div className="text-xs font-semibold text-muted-foreground">Lifecycle Operations</div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={qrActionLoading}
                          onClick={handleRotateQr}
                          className="text-xs gap-1.5"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Rotate Token</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={qrActionLoading || qrData.tokenStatus === "REVOKED"}
                          onClick={handleRevokeQr}
                          className="text-xs gap-1.5 text-rose-600 border-rose-500/30 hover:bg-rose-500/10"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          <span>Revoke QR</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setQrRoom(null)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </main>
    </div>
  );
}
