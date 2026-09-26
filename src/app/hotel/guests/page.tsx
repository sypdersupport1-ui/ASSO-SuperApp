"use client";

import React, { useState, useEffect } from "react";
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
  Users,
  Plus,
  RefreshCw,
  Search,
  Phone,
  Mail,
  ShieldCheck,
  CalendarDays,
  FileText,
  AlertCircle,
  Eye,
  Star,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";

interface GuestSummary {
  guestId: string;
  customerId: string;
  fullName: string;
  phone: string;
  email: string | null;
  idProofType: string | null;
  idProofNumberMasked: string | null;
  nationality: string | null;
  vipStatus: string;
  notes: string | null;
  createdAt: string;
}

interface GuestReservation {
  reservationId: string;
  reservationNumber: string;
  arrivalDate: string;
  departureDate: string;
  status: string;
  adultCount: number;
  childrenCount: number;
}

interface GuestDetail extends GuestSummary {
  reservations: GuestReservation[];
}

export default function HotelGuestsPage() {
  const [guests, setGuests] = useState<GuestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Create Guest Modal State
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formFullName, setFormFullName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formIdProofType, setFormIdProofType] = useState("AADHAAR");
  const [formIdProofNumber, setFormIdProofNumber] = useState("");
  const [formNationality, setFormNationality] = useState("INDIAN");
  const [formVipStatus, setFormVipStatus] = useState("STANDARD");
  const [formNotes, setFormNotes] = useState("");

  // View Guest Detail Modal State
  const [selectedGuest, setSelectedGuest] = useState<GuestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const fetchGuests = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = searchQuery
        ? `/api/v1/hotel/guests?search=${encodeURIComponent(searchQuery)}`
        : "/api/v1/hotel/guests";
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setGuests(json.data);
      } else {
        setError(json.error?.message || "Failed to load hotel guests.");
      }
    } catch {
      setError("Network error fetching hotel guests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGuests();
  }, [searchQuery]);

  const handleCreateGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFullName || !formPhone) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/hotel/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: formFullName.trim(),
          phone: formPhone.trim(),
          email: formEmail.trim() || undefined,
          idProofType: formIdProofType,
          idProofNumberMasked: formIdProofNumber.trim() || undefined,
          nationality: formNationality.trim() || "INDIAN",
          vipStatus: formVipStatus,
          notes: formNotes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setCreateDialogOpen(false);
        setFormFullName("");
        setFormPhone("");
        setFormEmail("");
        setFormIdProofNumber("");
        setFormNotes("");
        await fetchGuests();
      } else {
        alert("Failed to create guest: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error submitting guest creation.");
    } finally {
      setSubmitting(false);
    }
  };

  const openGuestDetail = async (guestId: string) => {
    setDetailDialogOpen(true);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/v1/hotel/guests/${guestId}`);
      const json = await res.json();
      if (json.success) {
        setSelectedGuest(json.data);
      } else {
        alert("Failed to load guest detail: " + json.error?.message);
        setDetailDialogOpen(false);
      }
    } catch {
      alert("Network error fetching guest details.");
      setDetailDialogOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "CONFIRMED":
        return <Badge variant="success" className="text-[10px] flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> CONFIRMED</Badge>;
      case "PENDING":
        return <Badge variant="outline" className="text-[10px] flex items-center gap-1 text-amber-500 border-amber-500/30"><Clock className="h-3 w-3" /> PENDING</Badge>;
      case "CANCELLED":
        return <Badge variant="destructive" className="text-[10px] flex items-center gap-1"><XCircle className="h-3 w-3" /> CANCELLED</Badge>;
      case "NO_SHOW":
        return <Badge variant="outline" className="text-[10px] flex items-center gap-1 text-red-500 border-red-500/30">NO SHOW</Badge>;
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
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
                <Users className="h-7 w-7 text-primary" />
                Hotel Guests
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                {guests.length} Profiles
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Shared customer identities linked to hotel-specific operational profiles & preferences.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchGuests}
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
                  New Guest Profile
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <form onSubmit={handleCreateGuest}>
                  <DialogHeader>
                    <DialogTitle>Register Hotel Guest</DialogTitle>
                    <DialogDescription>
                      Creates or links a shared customer record with a hotel operational profile.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Full Name *</label>
                      <Input
                        placeholder="e.g. Anita Sharma"
                        value={formFullName}
                        onChange={(e) => setFormFullName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">Phone *</label>
                        <Input
                          placeholder="+919876543210"
                          value={formPhone}
                          onChange={(e) => setFormPhone(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">Email</label>
                        <Input
                          type="email"
                          placeholder="anita@example.com"
                          value={formEmail}
                          onChange={(e) => setFormEmail(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">ID Proof Type</label>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          value={formIdProofType}
                          onChange={(e) => setFormIdProofType(e.target.value)}
                        >
                          <option value="AADHAAR">Aadhaar</option>
                          <option value="PASSPORT">Passport</option>
                          <option value="DRIVING_LICENSE">Driving License</option>
                          <option value="VOTER_ID">Voter ID</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">Masked ID Number</label>
                        <Input
                          placeholder="XXXX-XXXX-1234"
                          value={formIdProofNumber}
                          onChange={(e) => setFormIdProofNumber(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">Nationality</label>
                        <Input
                          placeholder="INDIAN"
                          value={formNationality}
                          onChange={(e) => setFormNationality(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">VIP Tier</label>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          value={formVipStatus}
                          onChange={(e) => setFormVipStatus(e.target.value)}
                        >
                          <option value="STANDARD">Standard</option>
                          <option value="VIP">VIP</option>
                          <option value="VVIP">VVIP</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Operational Notes</label>
                      <Input
                        placeholder="Room preferences, corporate affiliation, dietary notes"
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
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
                    <Button type="submit" disabled={submitting || !formFullName || !formPhone}>
                      {submitting ? "Saving..." : "Create Guest Profile"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search guests by name, phone, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-card"
            />
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

        {/* Guests Table */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Registered Guests</CardTitle>
            <CardDescription className="text-xs">
              Tenant-scoped hotel guest directory with shared customer entity binding.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm">Loading guest profiles...</span>
              </div>
            ) : guests.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground space-y-2">
                <Users className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-medium">No hotel guests found</p>
                <p className="text-xs text-muted-foreground">
                  {searchQuery ? "Try a different search query" : "Click 'New Guest Profile' to register the first guest."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Guest</th>
                      <th className="px-6 py-3">Contact</th>
                      <th className="px-6 py-3">ID Proof</th>
                      <th className="px-6 py-3">Nationality</th>
                      <th className="px-6 py-3">Tier</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {guests.map((g) => (
                      <tr key={g.guestId} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">{g.fullName}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            ID: {g.guestId.slice(0, 8)}...
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs space-y-0.5">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{g.phone}</span>
                          </div>
                          {g.email && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              <span>{g.email}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs">
                          {g.idProofType ? (
                            <div className="space-y-0.5">
                              <Badge variant="outline" className="text-[10px] uppercase font-mono">
                                {g.idProofType}
                              </Badge>
                              {g.idProofNumberMasked && (
                                <div className="text-[11px] font-mono text-muted-foreground">
                                  {g.idProofNumberMasked}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground">
                          {g.nationality || "INDIAN"}
                        </td>
                        <td className="px-6 py-4">
                          {g.vipStatus === "VIP" || g.vipStatus === "VVIP" ? (
                            <Badge variant="default" className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 w-fit">
                              <Star className="h-3 w-3 fill-amber-400" />
                              {g.vipStatus}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              STANDARD
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => openGuestDetail(g.guestId)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Details
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

        {/* Guest Detail Dialog */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Guest Profile Details</span>
                {selectedGuest?.vipStatus && (
                  <Badge variant={selectedGuest.vipStatus === "VIP" ? "default" : "outline"} className="text-xs">
                    {selectedGuest.vipStatus}
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription>
                Unified Customer identity & historical hotel reservations.
              </DialogDescription>
            </DialogHeader>

            {detailLoading ? (
              <div className="py-12 flex justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : selectedGuest ? (
              <div className="space-y-6 py-2">
                {/* Profile Grid */}
                <div className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4 bg-muted/20">
                  <div>
                    <span className="text-xs text-muted-foreground">Full Name</span>
                    <p className="font-semibold text-foreground text-sm">{selectedGuest.fullName}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Phone Number</span>
                    <p className="font-semibold text-foreground text-sm">{selectedGuest.phone}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Email Address</span>
                    <p className="text-foreground text-sm">{selectedGuest.email || "Not specified"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Nationality</span>
                    <p className="text-foreground text-sm">{selectedGuest.nationality || "INDIAN"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">ID Proof</span>
                    <p className="text-foreground text-sm font-mono">
                      {selectedGuest.idProofType} ({selectedGuest.idProofNumberMasked || "Masked"})
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Shared Customer ID</span>
                    <p className="text-xs font-mono text-muted-foreground truncate">{selectedGuest.customerId}</p>
                  </div>
                  {selectedGuest.notes && (
                    <div className="col-span-2 pt-2 border-t border-border">
                      <span className="text-xs text-muted-foreground">Preferences / Notes</span>
                      <p className="text-xs text-foreground mt-0.5">{selectedGuest.notes}</p>
                    </div>
                  )}
                </div>

                {/* Reservations List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-1.5">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      Reservations History
                    </h3>
                    <Badge variant="outline" className="text-xs font-mono">
                      {selectedGuest.reservations?.length || 0} Bookings
                    </Badge>
                  </div>

                  {!selectedGuest.reservations || selectedGuest.reservations.length === 0 ? (
                    <div className="rounded-md border border-border border-dashed p-6 text-center text-muted-foreground text-xs">
                      No reservations recorded for this guest profile yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedGuest.reservations.map((res) => (
                        <div
                          key={res.reservationId}
                          className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-foreground">
                                {res.reservationNumber}
                              </span>
                              {getStatusBadge(res.status)}
                            </div>
                            <div className="text-muted-foreground text-[11px] flex items-center gap-3">
                              <span>
                                {res.arrivalDate} → {res.departureDate}
                              </span>
                              <span>•</span>
                              <span>
                                {res.adultCount} Adult{res.adultCount > 1 ? "s" : ""}{" "}
                                {res.childrenCount > 0 ? `, ${res.childrenCount} Child` : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
