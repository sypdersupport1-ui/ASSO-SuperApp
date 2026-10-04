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
  Filter,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Wrench,
  BedDouble,
  SlidersHorizontal,
  User,
  LogOut,
  QrCode,
  RotateCcw,
  Ban,
  Copy,
  ExternalLink,
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
      if (json.success) {
        setQrData((prev) => prev ? { ...prev, tokenStatus: "REVOKED" } : null);
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

      if (roomsJson.success && typesJson.success) {
        setRooms(roomsJson.data);
        setRoomTypes(typesJson.data);
        if (typesJson.data.length > 0 && !newRoomTypeId) {
          setNewRoomTypeId(typesJson.data[0].roomTypeId);
        }
      } else {
        setError(roomsJson.error?.message || typesJson.error?.message || "Failed to load hotel rooms.");
      }
    } catch (err) {
      setError("Network error fetching rooms.");
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
          roomNumber: newRoomNumber.trim(),
          floorNumber: newFloor.trim(),
          roomTypeId: newRoomTypeId,
          operationalStatus: "AVAILABLE",
          housekeepingStatus: "CLEAN",
        }),
      });

      const json = await res.json();
      if (json.success) {
        setCreateDialogOpen(false);
        setNewRoomNumber("");
        toast.success(`Room ${newRoomNumber.trim()} created successfully.`);
        await fetchRoomsAndTypes();
      } else {
        toast.error("Failed to create room: " + (json.error?.message || "Unknown error"));
      }
    } catch (err) {
      toast.error("Error submitting room creation");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedRoom) return;
    setUpdating(true);
    try {
      const res = await hotelFetch(`/api/v1/hotel/rooms/${selectedRoom.roomId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationalStatus: updateOpStatus,
          housekeepingStatus: updateHkStatus,
        }),
      });

      const json = await res.json();
      if (json.success) {
        toast.success(`Room ${selectedRoom.roomNumber} status updated.`);
        setSelectedRoom(null);
        await fetchRoomsAndTypes();
      } else {
        toast.error("State transition error: " + (json.error?.message || "Unknown error"));
      }
    } catch (err) {
      toast.error("Failed to update room status");
    } finally {
      setUpdating(false);
    }
  };

  const openStatusModal = (room: RoomItem) => {
    setSelectedRoom(room);
    setUpdateOpStatus(room.operationalStatus);
    setUpdateHkStatus(room.housekeepingStatus);
  };

  // Filtered rooms
  const filteredRooms = rooms.filter((r) => {
    const matchesSearch =
      r.roomNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.roomTypeName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFloor = floorFilter === "ALL" || r.floorNumber === floorFilter;
    const matchesOp = opFilter === "ALL" || r.operationalStatus === opFilter;
    const matchesHk = hkFilter === "ALL" || r.housekeepingStatus === hkFilter;
    return matchesSearch && matchesFloor && matchesOp && matchesHk;
  });

  // Unique floors
  const floors = Array.from(new Set(rooms.map((r) => r.floorNumber).filter(Boolean))).sort();

  const getOpBadge = (status: HotelOperationalStatus) => {
    switch (status) {
      case "AVAILABLE":
        return <Badge variant="success" className="text-[10px]">Available</Badge>;
      case "OCCUPIED":
        return <Badge variant="default" className="text-[10px] bg-blue-600 hover:bg-blue-700">Occupied</Badge>;
      case "RESERVED":
        return <Badge variant="warning" className="text-[10px]">Reserved</Badge>;
      case "OUT_OF_SERVICE":
      case "OUT_OF_ORDER":
        return <Badge variant="destructive" className="text-[10px]">{status.replace(/_/g, " ")}</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  const getHkBadge = (status: HotelHousekeepingStatus) => {
    switch (status) {
      case "CLEAN":
        return <Badge variant="success" className="text-[10px] bg-emerald-600">Clean</Badge>;
      case "DIRTY":
        return <Badge variant="warning" className="text-[10px]">Dirty</Badge>;
      case "CLEANING":
        return <Badge variant="info" className="text-[10px]">Cleaning</Badge>;
      case "INSPECTED":
        return <Badge className="text-[10px] bg-purple-600 hover:bg-purple-700">Inspected</Badge>;
      case "MAINTENANCE":
        return <Badge variant="destructive" className="text-[10px]">Maint.</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
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
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                Room Rack & Operations
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                {rooms.length} Rooms
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Visual operational rack with explicit state machine transition controls.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRoomsAndTypes}
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
                  Add Room
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
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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

        {/* Filter & Search Bar */}
        <Card className="bg-card">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search room number or type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>

              {/* Floor Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Floor:</span>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Op:</span>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">HK:</span>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
              <div key={i} className="h-32 rounded-lg bg-muted/50" />
            ))}
          </div>
        )}

        {!loading && filteredRooms.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <DoorOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold">No rooms match current search criteria</p>
              <p className="text-xs text-muted-foreground mt-1">Try resetting filters or adding new rooms.</p>
            </CardContent>
          </Card>
        )}

        {!loading && filteredRooms.length > 0 && (
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
                      ? "bg-card hover:border-primary/50"
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

                  <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground/80 font-mono">
                    <span className="truncate max-w-[120px]">ctx: {room.contextId.slice(0, 8)}...</span>
                    <button
                      type="button"
                      onClick={(e) => openQrModal(room, e)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary font-sans font-semibold text-[11px] transition"
                    >
                      <QrCode className="h-3 w-3" />
                      <span>QR Code</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
