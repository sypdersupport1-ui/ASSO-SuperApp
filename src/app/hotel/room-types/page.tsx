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
import { BedDouble, Plus, RefreshCw, Users, ShieldCheck, AlertTriangle } from "lucide-react";

interface RoomTypeItem {
  roomTypeId: string;
  code: string;
  name: string;
  description: string | null;
  baseOccupancy: number;
  maxOccupancy: number;
  baseRate: string;
  isActive: boolean;
  createdAt: string;
}

export default function HotelRoomTypesPage() {
  const { toast } = useToast();
  const [types, setTypes] = useState<RoomTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [baseOccupancy, setBaseOccupancy] = useState(2);
  const [maxOccupancy, setMaxOccupancy] = useState(3);
  const [baseRate, setBaseRate] = useState("4500");
  const [submitting, setSubmitting] = useState(false);

  const fetchRoomTypes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await hotelFetch("/api/v1/hotel/room-types");
      const json = await res.json();
      if (json.success) {
        setTypes(json.data);
      } else {
        setError(json.error?.message || "Failed to load room types.");
      }
    } catch (err) {
      setError("Network error fetching room types.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoomTypes();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) return;

    setSubmitting(true);
    try {
      const res = await hotelFetch("/api/v1/hotel/room-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          description: description.trim() || undefined,
          baseOccupancy: Number(baseOccupancy),
          maxOccupancy: Number(maxOccupancy),
          baseRate: Number(baseRate),
        }),
      });

      const json = await res.json();
      if (json.success) {
        setDialogOpen(false);
        setCode("");
        setName("");
        setDescription("");
        toast.success(`Room type ${name.trim()} (${code.trim().toUpperCase()}) created successfully.`);
        await fetchRoomTypes();
      } else {
        toast.error("Failed to create room type: " + (json.error?.message || "Unknown error"));
      }
    } catch (err) {
      toast.error("Error submitting room type");
    } finally {
      setSubmitting(false);
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
                Room Types Configuration
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                {types.length} Types
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Domain room categories, occupancy limits, and baseline rates.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRoomTypes}
              disabled={loading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="flex items-center gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add Room Type
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>Add Room Type</DialogTitle>
                    <DialogDescription>
                      Define a new room category with occupancy rules and baseline pricing.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">Code *</label>
                        <Input
                          placeholder="e.g. DLX, SUI"
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">Base Rate (₹) *</label>
                        <Input
                          type="number"
                          step="100"
                          value={baseRate}
                          onChange={(e) => setBaseRate(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Display Name *</label>
                      <Input
                        placeholder="e.g. Deluxe Garden Room"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Description</label>
                      <Input
                        placeholder="Amenities, size, bed configuration"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">Base Occupancy</label>
                        <Input
                          type="number"
                          min="1"
                          value={baseOccupancy}
                          onChange={(e) => setBaseOccupancy(Number(e.target.value))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">Max Occupancy</label>
                        <Input
                          type="number"
                          min="1"
                          value={maxOccupancy}
                          onChange={(e) => setMaxOccupancy(Number(e.target.value))}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting || !code || !name}>
                      {submitting ? "Saving..." : "Create Room Type"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Room Types Cards */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 rounded-lg bg-muted/60" />
            ))}
          </div>
        )}

        {!loading && types.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <BedDouble className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold">No room types configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create your first room type to begin assigning rooms.
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && types.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {types.map((rt) => (
              <Card key={rt.roomTypeId} className="flex flex-col justify-between hover:border-primary/40 transition-colors">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{rt.name}</CardTitle>
                      <Badge variant="outline" className="font-mono text-xs mt-1">
                        {rt.code}
                      </Badge>
                    </div>
                    <span className="text-lg font-black text-foreground">
                      ₹{Number(rt.baseRate).toLocaleString("en-IN")}
                    </span>
                  </div>
                  {rt.description && (
                    <CardDescription className="line-clamp-2 mt-2">
                      {rt.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="border-t border-border/60 pt-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-primary" />
                      <span>Capacity: {rt.baseOccupancy}–{rt.maxOccupancy} Guests</span>
                    </div>

                    <Badge variant={rt.isActive ? "success" : "outline"} className="text-[10px]">
                      {rt.isActive ? "Active" : "Archived"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
