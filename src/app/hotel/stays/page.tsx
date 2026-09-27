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
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  KeyRound,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  DoorOpen,
  BedDouble,
  User,
  Users,
  LogOut,
  Eye,
  AlertCircle,
  Star,
  Sparkles,
  ArrowRight,
  Receipt,
} from "lucide-react";

interface StayItem {
  stayId: string;
  tenantId: string;
  outletId: string;
  reservationId: string;
  reservationNumber: string;
  guestId: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  vipStatus: string;
  roomId: string;
  roomNumber: string;
  floorNumber: string | null;
  roomTypeId: string;
  roomTypeName: string;
  stayNumber: string;
  checkInAt: string;
  expectedCheckOutAt: string;
  actualCheckOutAt: string | null;
  status: "ACTIVE" | "CHECKED_OUT";
  adultCount: number;
  childrenCount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function HotelStaysPage() {
  const [stays, setStays] = useState<StayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");

  // Check-out dialog state
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedStay, setSelectedStay] = useState<StayItem | null>(null);
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Detail dialog state
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const fetchStays = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = "/api/v1/hotel/stays";
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.append("status", statusFilter);
      if (searchQuery) params.append("search", searchQuery);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setStays(json.data);
      } else {
        setError(json.error?.message || "Failed to load hotel stays.");
      }
    } catch {
      setError("Network error fetching stays.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStays();
  }, [statusFilter, searchQuery]);

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStay) return;

    setCheckoutLoading(true);
    try {
      const res = await fetch(`/api/v1/hotel/stays/${selectedStay.stayId}/check-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: checkoutNotes.trim() || undefined }),
      });

      const json = await res.json();
      if (json.success) {
        setCheckoutModalOpen(false);
        setCheckoutNotes("");
        setSelectedStay(null);
        await fetchStays();
      } else {
        alert("Check-out rejected: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error processing check-out.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === "ACTIVE") {
      return (
        <Badge variant="success" className="text-xs flex items-center gap-1.5 py-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          IN-HOUSE
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground border-border">
        CHECKED OUT
      </Badge>
    );
  };

  const activeCount = stays.filter((s) => s.status === "ACTIVE").length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HotelNav />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
                <KeyRound className="h-7 w-7 text-primary" />
                Stays & Occupancy
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                {stays.length} Records
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Live in-house guest occupancy lifecycle, physical room release, and departure ledger.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStays}
              disabled={loading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by stay #, guest name, or room #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-card"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {(["ACTIVE", "ALL", "CHECKED_OUT"] as const).map((st) => (
              <Button
                key={st}
                variant={statusFilter === st ? "default" : "outline"}
                size="sm"
                className="text-xs h-9 px-3"
                onClick={() => setStatusFilter(st)}
              >
                {st === "ACTIVE" ? "In-House (Active)" : st === "CHECKED_OUT" ? "Departed" : "All Stays"}
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

        {/* Stays Ledger Card */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Front Office Stays Ledger</CardTitle>
            <CardDescription className="text-xs">
              Physical room occupants, check-in timestamps, and departure actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm">Loading stays ledger...</span>
              </div>
            ) : stays.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground space-y-2">
                <KeyRound className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-medium">No stays match the criteria</p>
                <p className="text-xs text-muted-foreground">
                  Check in a confirmed reservation from the Reservations screen to create a stay.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Stay Reference</th>
                      <th className="px-6 py-3">Guest</th>
                      <th className="px-6 py-3">Room</th>
                      <th className="px-6 py-3">Check-In Time</th>
                      <th className="px-6 py-3">Expected Departure</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stays.map((stay) => (
                      <tr key={stay.stayId} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-mono font-bold text-foreground">
                            {stay.stayNumber}
                          </span>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            Res: {stay.reservationNumber}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 font-medium text-foreground">
                            <span>{stay.guestName}</span>
                            {stay.vipStatus === "VIP" && (
                              <Badge variant="default" className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 py-0 h-4">
                                <Star className="h-2.5 w-2.5 fill-amber-400 mr-0.5" />
                                VIP
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{stay.guestPhone}</div>
                        </td>
                        <td className="px-6 py-4 text-xs">
                          <div className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                            <DoorOpen className="h-4 w-4" />
                            <span>Room {stay.roomNumber}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {stay.roomTypeName}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-foreground">
                          {new Date(stay.checkInAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-muted-foreground">
                          {new Date(stay.expectedCheckOutAt).toLocaleDateString()}
                          {stay.actualCheckOutAt && (
                            <div className="text-[10px] text-muted-foreground">
                              Out: {new Date(stay.actualCheckOutAt).toLocaleTimeString()}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(stay.status)}
                        </td>
                        <td className="px-6 py-4 text-right space-x-1.5">
                          <Link href={`/hotel/folio/${stay.stayId}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs border-emerald-800/40 text-emerald-500 hover:bg-emerald-950/20"
                            >
                              <Receipt className="h-3.5 w-3.5" />
                              Folio
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => {
                              setSelectedStay(stay);
                              setDetailModalOpen(true);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Details
                          </Button>
                          {stay.status === "ACTIVE" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs text-rose-600 border-rose-500/30 hover:bg-rose-500/10"
                              onClick={() => {
                                setSelectedStay(stay);
                                setCheckoutNotes("");
                                setCheckoutModalOpen(true);
                              }}
                            >
                              <LogOut className="h-3.5 w-3.5" />
                              Check Out
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Check-Out Confirmation Dialog */}
        <Dialog open={checkoutModalOpen} onOpenChange={setCheckoutModalOpen}>
          <DialogContent className="max-w-md">
            <form onSubmit={handleCheckoutSubmit}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-foreground">
                  <LogOut className="h-5 w-5 text-rose-500" />
                  Confirm Guest Departure
                </DialogTitle>
                <DialogDescription>
                  This action completes the Stay, releases room occupancy, and marks the room as DIRTY for housekeeping turnover.
                </DialogDescription>
              </DialogHeader>

              {selectedStay && (
                <div className="space-y-4 py-4 text-xs">
                  <div className="rounded-lg border border-border p-3.5 bg-muted/20 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Guest:</span>
                      <span className="font-semibold text-foreground">{selectedStay.guestName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Room:</span>
                      <span className="font-mono font-bold text-foreground">Room {selectedStay.roomNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stay Ref:</span>
                      <span className="font-mono text-muted-foreground">{selectedStay.stayNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Check-in:</span>
                      <span className="font-mono text-foreground">{new Date(selectedStay.checkInAt).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-foreground">Departure / Housekeeping Notes</label>
                    <Input
                      placeholder="e.g. Left keys at desk, requested taxi"
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
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  Stay {selectedStay?.stayNumber}
                </span>
                {selectedStay && getStatusBadge(selectedStay.status)}
              </DialogTitle>
              <DialogDescription>
                Live in-house stay record and historical room occupancy timestamps.
              </DialogDescription>
            </DialogHeader>

            {selectedStay && (
              <div className="space-y-4 py-2 text-xs">
                <div className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4 bg-muted/20">
                  <div>
                    <span className="text-muted-foreground">Guest Full Name</span>
                    <p className="font-semibold text-foreground text-sm">{selectedStay.guestName}</p>
                    <p className="text-muted-foreground">{selectedStay.guestPhone}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Assigned Room</span>
                    <p className="font-bold text-foreground text-sm flex items-center gap-1.5">
                      <DoorOpen className="h-4 w-4 text-emerald-500" />
                      Room {selectedStay.roomNumber}
                    </p>
                    <p className="text-muted-foreground">{selectedStay.roomTypeName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Check-In Timestamp</span>
                    <p className="font-mono font-medium text-foreground">{new Date(selectedStay.checkInAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Expected Check-Out</span>
                    <p className="font-mono font-medium text-foreground">{new Date(selectedStay.expectedCheckOutAt).toLocaleDateString()}</p>
                  </div>
                  {selectedStay.actualCheckOutAt && (
                    <div className="col-span-2 border-t border-border pt-2">
                      <span className="text-muted-foreground">Actual Check-Out Timestamp</span>
                      <p className="font-mono font-semibold text-rose-500">{new Date(selectedStay.actualCheckOutAt).toLocaleString()}</p>
                    </div>
                  )}
                  <div className="col-span-2 border-t border-border pt-2 flex justify-between text-muted-foreground font-mono text-[11px]">
                    <span>Reservation: {selectedStay.reservationNumber}</span>
                    <span>Occupants: {selectedStay.adultCount} Adult{selectedStay.adultCount > 1 ? "s" : ""}</span>
                  </div>
                  {selectedStay.notes && (
                    <div className="col-span-2 border-t border-border pt-2">
                      <span className="text-muted-foreground">Operational Notes</span>
                      <p className="text-foreground mt-0.5">{selectedStay.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
