"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { HotelNav } from "@/components/hotel/hotel-nav";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  BedDouble,
  DoorOpen,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Wrench,
  Percent,
  Plus,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Building,
  KeyRound,
} from "lucide-react";

interface DashboardData {
  totalRooms: number;
  availableRooms: number;
  occupiedRooms: number;
  reservedRooms: number;
  outOfServiceRooms: number;
  occupancyRatePct: number;
  activeStaysCount: number;
  todayCheckInsCount: number;
  todayCheckOutsCount: number;
  housekeepingBreakdown: {
    clean: number;
    dirty: number;
    inspected: number;
    cleaning: number;
    maintenance: number;
  };
  roomTypeBreakdown: Array<{
    roomTypeId: string;
    name: string;
    code: string;
    total: number;
    available: number;
    baseRate: string;
  }>;
}

export default function HotelDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/hotel/dashboard");
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error?.message || "Failed to load hotel dashboard metrics.");
      }
    } catch (err) {
      setError("Network or server connection failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/v1/hotel/seed", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        await fetchDashboard();
      } else {
        alert("Seed failed: " + json.error?.message);
      }
    } catch (err) {
      alert("Error triggering seed");
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HotelNav />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header Title Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                Hotel Operations Dashboard
              </h1>
              <Badge variant="outline" className="text-xs font-mono text-primary border-primary/30">
                Slice 9: Folio &amp; Billing
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Live operational state calculated directly from native Supabase PostgreSQL.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDashboard}
              disabled={loading}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <Link href="/hotel/rooms">
              <Button size="sm" className="flex items-center gap-1.5">
                <DoorOpen className="h-4 w-4" />
                Room Rack
              </Button>
            </Link>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={fetchDashboard} className="ml-4">
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {loading && !data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 rounded-lg bg-muted/60" />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && data && data.totalRooms === 0 && (
          <Card className="border-dashed text-center py-12">
            <CardContent className="space-y-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Building className="h-7 w-7 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-bold">No Hotel Rooms Found</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                  This hotel property currently has no rooms registered. You can initialize safe demo fixtures or configure room types and rooms manually.
                </p>
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <Button onClick={handleSeed} disabled={seeding}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {seeding ? "Seeding..." : "Initialize Demo Hotel Data"}
                </Button>
                <Link href="/hotel/room-types">
                  <Button variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Room Type
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Live Data Grid */}
        {data && data.totalRooms > 0 && (
          <div className="space-y-8">
            {/* Top KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Total Rooms */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase font-medium">Total Inventory</CardDescription>
                  <CardTitle className="text-2xl sm:text-3xl font-black text-foreground flex items-center justify-between">
                    <span>{data.totalRooms}</span>
                    <DoorOpen className="h-5 w-5 text-muted-foreground/60" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Configured hotel rooms</p>
                </CardContent>
              </Card>

              {/* Available Rooms */}
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase font-medium text-emerald-700 dark:text-emerald-400">
                    Ready & Available
                  </CardDescription>
                  <CardTitle className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                    <span>{data.availableRooms}</span>
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Clean & inspect ready</p>
                </CardContent>
              </Card>

              {/* Occupied Rooms */}
              <Card className="border-blue-500/20 bg-blue-500/5">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase font-medium text-blue-700 dark:text-blue-400">
                    Occupied
                  </CardDescription>
                  <CardTitle className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 flex items-center justify-between">
                    <span>{data.occupiedRooms}</span>
                    <BedDouble className="h-5 w-5 text-blue-500" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Active in-house guests</p>
                </CardContent>
              </Card>

              {/* Reserved Rooms */}
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase font-medium">Reserved</CardDescription>
                  <CardTitle className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 flex items-center justify-between">
                    <span>{data.reservedRooms}</span>
                    <Badge variant="warning" className="text-[10px] px-1.5">Hold</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Upcoming arrival holds</p>
                </CardContent>
              </Card>

              {/* Occupancy Rate */}
              <Card className="col-span-2 lg:col-span-1">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase font-medium">Occupancy Rate</CardDescription>
                  <CardTitle className="text-2xl sm:text-3xl font-black text-foreground flex items-center justify-between">
                    <span>{data.occupancyRatePct}%</span>
                    <Percent className="h-5 w-5 text-muted-foreground/60" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="w-full bg-muted rounded-full h-2 mt-1">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(data.occupancyRatePct, 100)}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Front Office Stays Lifecycle Grid (Slice 3) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="text-xs uppercase font-semibold text-primary">
                      Active In-House Stays
                    </CardDescription>
                    <KeyRound className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-2xl font-black text-foreground">
                    {data.activeStaysCount ?? 0}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between pt-0">
                  <p className="text-xs text-muted-foreground">Currently occupying hotel rooms</p>
                  <Link href="/hotel/stays">
                    <Button variant="ghost" size="sm" className="text-xs h-7 text-primary hover:text-primary">
                      View Ledger <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="text-xs uppercase font-semibold text-muted-foreground">
                      Today&apos;s Check-Ins
                    </CardDescription>
                    <Badge variant="outline" className="text-[10px]">Arrivals</Badge>
                  </div>
                  <CardTitle className="text-2xl font-black text-foreground">
                    {data.todayCheckInsCount ?? 0}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between pt-0">
                  <p className="text-xs text-muted-foreground">Reservations arriving today</p>
                  <Link href="/hotel/reservations">
                    <Button variant="ghost" size="sm" className="text-xs h-7">
                      Check-In <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardDescription className="text-xs uppercase font-semibold text-muted-foreground">
                      Today&apos;s Check-Outs
                    </CardDescription>
                    <Badge variant="outline" className="text-[10px]">Departures</Badge>
                  </div>
                  <CardTitle className="text-2xl font-black text-foreground">
                    {data.todayCheckOutsCount ?? 0}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between pt-0">
                  <p className="text-xs text-muted-foreground">Stays scheduled to depart</p>
                  <Link href="/hotel/stays">
                    <Button variant="ghost" size="sm" className="text-xs h-7">
                      Departures <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>

            {/* Middle Section: Housekeeping & Room Types */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Housekeeping Operational Status */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Housekeeping Status
                  </CardTitle>
                  <CardDescription>
                    Real-time room cleanliness and maintenance states
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
                    <span className="text-sm font-medium text-emerald-900 dark:text-emerald-300">Clean & Ready</span>
                    <Badge variant="success" className="font-bold">{data.housekeepingBreakdown.clean}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
                    <span className="text-sm font-medium text-amber-900 dark:text-amber-300">Dirty / To Clean</span>
                    <Badge variant="warning" className="font-bold">{data.housekeepingBreakdown.dirty}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40">
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-300">In Cleaning</span>
                    <Badge variant="info" className="font-bold">{data.housekeepingBreakdown.cleaning}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/40">
                    <span className="text-sm font-medium text-purple-900 dark:text-purple-300">Inspected / VIP Ready</span>
                    <Badge className="font-bold bg-purple-600 hover:bg-purple-700">{data.housekeepingBreakdown.inspected}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40">
                    <span className="text-sm font-medium text-rose-900 dark:text-rose-300">Maintenance / Out of Order</span>
                    <Badge variant="destructive" className="font-bold">{data.housekeepingBreakdown.maintenance}</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Room Types Breakdown */}
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BedDouble className="h-4 w-4 text-primary" />
                      Inventory by Room Type
                    </CardTitle>
                    <CardDescription>
                      Availability and baseline rate per category
                    </CardDescription>
                  </div>
                  <Link href="/hotel/room-types">
                    <Button variant="ghost" size="sm" className="text-xs">
                      Manage Types <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-y border-border">
                        <tr>
                          <th className="px-4 py-2.5">Room Type</th>
                          <th className="px-4 py-2.5">Code</th>
                          <th className="px-4 py-2.5 text-right">Base Rate</th>
                          <th className="px-4 py-2.5 text-center">Available / Total</th>
                          <th className="px-4 py-2.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.roomTypeBreakdown.map((rt) => (
                          <tr key={rt.roomTypeId} className="hover:bg-muted/30">
                            <td className="px-4 py-3 font-medium text-foreground">{rt.name}</td>
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{rt.code}</td>
                            <td className="px-4 py-3 text-right font-medium">₹{Number(rt.baseRate).toLocaleString("en-IN")}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">{rt.available}</span>
                              <span className="text-muted-foreground"> / {rt.total}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {rt.available > 0 ? (
                                <Badge variant="success" className="text-[10px]">In Stock</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-[10px]">Sold Out</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Architecture Invariants Card */}
            <Card className="bg-muted/20 border-border">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-md bg-primary/10 text-primary mt-0.5">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground">
                        Phase 7 Domain Boundaries Enforced
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Each Hotel Room is physically mapped to an ASSO <code className="bg-muted px-1 rounded text-primary">business_context</code>. Tenant isolation is guaranteed via PostgreSQL RLS. Operational and Housekeeping states are strictly segregated.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link href="/hotel/guests">
                      <Button variant="outline" size="sm">
                        Guest Profiles
                      </Button>
                    </Link>
                    <Link href="/hotel/reservations">
                      <Button variant="outline" size="sm">
                        Reservations
                      </Button>
                    </Link>
                    <Link href="/hotel/stays">
                      <Button size="sm">
                        <KeyRound className="h-3.5 w-3.5 mr-1" />
                        Stays Ledger
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
