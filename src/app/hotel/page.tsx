"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { HotelNav } from "@/components/hotel/hotel-nav";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { hotelFetch } from "@/lib/hotel/client-auth";
import { useToast } from "@/components/ui/toast";
import {
  BedDouble,
  DoorOpen,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  Wrench,
  Percent,
  Plus,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Building,
  KeyRound,
  UtensilsCrossed,
  LogOut,
  LogIn,
  ConciergeBell,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import type { FrontOfficeSummary, FrontOfficeAttentionItem } from "@/lib/hotel/front-office-service";

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

interface MaintenanceSummaryData {
  openCount: number;
  inProgressCount: number;
  outOfServiceRooms: number;
}

interface RoomServiceSummaryData {
  activeOrdersCount: number;
}

export default function HotelDashboardPage() {
  const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [frontOffice, setFrontOffice] = useState<FrontOfficeSummary | null>(null);
  const [maintSummary, setMaintSummary] = useState<MaintenanceSummaryData | null>(null);
  const [roomServiceSummary, setRoomServiceSummary] = useState<RoomServiceSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, foRes, maintRes, rsRes] = await Promise.allSettled([
        hotelFetch("/api/v1/hotel/dashboard"),
        hotelFetch("/api/v1/hotel/front-office"),
        hotelFetch("/api/v1/hotel/maintenance/summary"),
        hotelFetch("/api/v1/hotel/room-service/orders?status=ACTIVE"),
      ]);

      if (dashRes.status === "fulfilled") {
        const json = await dashRes.value.json();
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error?.message || "Failed to load hotel dashboard metrics.");
        }
      } else {
        setError("Network connection to dashboard metrics failed.");
      }

      if (foRes.status === "fulfilled") {
        try {
          const json = await foRes.value.json();
          if (json.success) setFrontOffice(json.data);
        } catch {
          // Non-blocking
        }
      }

      if (maintRes.status === "fulfilled") {
        try {
          const json = await maintRes.value.json();
          if (json.success && json.data) {
            setMaintSummary({
              openCount: json.data.openCount ?? 0,
              inProgressCount: json.data.inProgressCount ?? 0,
              outOfServiceRooms: json.data.outOfServiceRooms ?? 0,
            });
          }
        } catch {
          // Non-blocking
        }
      }

      if (rsRes.status === "fulfilled") {
        try {
          const json = await rsRes.value.json();
          if (json.success && Array.isArray(json.data)) {
            setRoomServiceSummary({
              activeOrdersCount: json.data.length,
            });
          }
        } catch {
          // Non-blocking
        }
      }
    } catch {
      setError("Network or server connection failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await hotelFetch("/api/v1/hotel/seed", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        toast.success("Hotel demo environment seeded successfully.");
        await fetchDashboard();
      } else {
        toast.error("Seed failed: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      toast.error("Error triggering seed");
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Operational metrics
  const todayArrivals = frontOffice?.kpis.todayArrivalsCount ?? data?.todayCheckInsCount ?? 0;
  const todayDepartures = frontOffice?.kpis.todayDeparturesCount ?? data?.todayCheckOutsCount ?? 0;
  const activeStays = frontOffice?.kpis.activeStaysCount ?? data?.activeStaysCount ?? data?.occupiedRooms ?? 0;
  const attentionItems = frontOffice?.attentionItems ?? [];
  const dirtyRooms = data?.housekeepingBreakdown.dirty ?? frontOffice?.kpis.availableDirtyRoomsCount ?? 0;
  const cleanRooms = data?.housekeepingBreakdown.clean ?? frontOffice?.kpis.availableCleanRoomsCount ?? 0;
  const cleaningRooms = data?.housekeepingBreakdown.cleaning ?? 0;
  const inspectedRooms = data?.housekeepingBreakdown.inspected ?? 0;
  const maintenanceRooms = data?.outOfServiceRooms ?? maintSummary?.outOfServiceRooms ?? 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <HotelNav />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Command Center Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <ConciergeBell className="h-6 w-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                Hotel Operations Command Center
              </h1>
              <Badge variant="outline" className="text-xs font-mono text-primary border-primary/30">
                Operational UX
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Live operational awareness: Occupancy, arrivals/departures, turnover readiness, and guest service queues.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
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

            <Link href="/hotel/front-office">
              <Button size="sm" className="flex items-center gap-1.5">
                <LogIn className="h-4 w-4" />
                Front Desk
              </Button>
            </Link>

            <Link href="/hotel/rooms">
              <Button variant="secondary" size="sm" className="flex items-center gap-1.5">
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

        {/* Loading State Skeletons */}
        {loading && !data && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-muted/60 animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-44 rounded-xl bg-muted/50 animate-pulse" />
              ))}
            </div>
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
                <h3 className="text-lg font-bold">No Hotel Rooms Registered</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
                  This hotel property currently has no rooms configured. Initialize the safe demo fixtures or configure room types and rooms manually.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <Button onClick={handleSeed} disabled={seeding}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {seeding ? "Seeding..." : "Initialize Demo Hotel Data"}
                </Button>
                <Link href="/hotel/room-types">
                  <Button variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Configure Room Types
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Live Operational Command Center Content */}
        {data && data.totalRooms > 0 && (
          <div className="space-y-8">
            {/* 1. OPERATIONAL ATTENTION BANNER (What needs my attention right now?) */}
            {attentionItems.length > 0 && (
              <Card className="border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                      <CardTitle className="text-base font-bold text-foreground">
                        Operational Attention Required ({attentionItems.length})
                      </CardTitle>
                    </div>
                    <Badge variant="warning" className="text-xs">Action Items</Badge>
                  </div>
                  <CardDescription className="text-xs text-muted-foreground">
                    Items requiring immediate staff action: arrivals pending room allocation, dirty vacant rooms, or overdue departures.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {attentionItems.slice(0, 6).map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-lg border border-border bg-card flex flex-col justify-between gap-2 shadow-sm"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-xs text-foreground">{item.title}</span>
                            <Badge
                              variant={item.severity === "critical" ? "destructive" : "warning"}
                              className="text-[10px] uppercase font-mono px-1.5 py-0"
                            >
                              {item.severity}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                        </div>
                        <div className="pt-1 flex items-center justify-end">
                          <Link href={item.actionHref || "/hotel/front-office"}>
                            <Button size="sm" variant="ghost" className="h-7 text-xs font-medium text-primary hover:text-primary gap-1">
                              {item.actionLabel}
                              <ArrowRight className="h-3 w-3" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 2. OPERATIONAL PULSE KPIS */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Active In-House Stays */}
              <Link href="/hotel/stays" className="group">
                <Card className="h-full border-border hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase font-medium flex items-center justify-between">
                      <span>Active Stays</span>
                      <KeyRound className="h-4 w-4 text-primary" />
                    </CardDescription>
                    <CardTitle className="text-2xl sm:text-3xl font-black text-foreground group-hover:text-primary transition-colors">
                      {activeStays}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground flex items-center justify-between">
                      <span>In-house guests</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </p>
                  </CardContent>
                </Card>
              </Link>

              {/* Today's Arrivals */}
              <Link href="/hotel/front-office" className="group">
                <Card className="h-full border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40 transition-colors">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase font-medium text-blue-700 dark:text-blue-400 flex items-center justify-between">
                      <span>Today Arrivals</span>
                      <LogIn className="h-4 w-4 text-blue-500" />
                    </CardDescription>
                    <CardTitle className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">
                      {todayArrivals}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground flex items-center justify-between">
                      <span>Check-ins pending</span>
                      <ChevronRight className="h-3.5 w-3.5 text-blue-500 group-hover:translate-x-0.5 transition-transform" />
                    </p>
                  </CardContent>
                </Card>
              </Link>

              {/* Today's Departures */}
              <Link href="/hotel/front-office" className="group">
                <Card className="h-full border-border hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase font-medium flex items-center justify-between">
                      <span>Today Departures</span>
                      <LogOut className="h-4 w-4 text-muted-foreground" />
                    </CardDescription>
                    <CardTitle className="text-2xl sm:text-3xl font-black text-foreground">
                      {todayDepartures}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground flex items-center justify-between">
                      <span>Scheduled checkouts</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </p>
                  </CardContent>
                </Card>
              </Link>

              {/* Ready & Available */}
              <Link href="/hotel/rooms" className="group">
                <Card className="h-full border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 transition-colors">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase font-medium text-emerald-700 dark:text-emerald-400 flex items-center justify-between">
                      <span>Ready / Available</span>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </CardDescription>
                    <CardTitle className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                      {cleanRooms}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-muted-foreground flex items-center justify-between">
                      <span>Clean & vacant</span>
                      <span className="font-mono text-[11px] font-semibold">of {data.totalRooms}</span>
                    </p>
                  </CardContent>
                </Card>
              </Link>

              {/* Occupancy Rate */}
              <Card className="col-span-2 lg:col-span-1 border-border">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase font-medium flex items-center justify-between">
                    <span>Occupancy Rate</span>
                    <Percent className="h-4 w-4 text-muted-foreground/60" />
                  </CardDescription>
                  <CardTitle className="text-2xl sm:text-3xl font-black text-foreground">
                    {data.occupancyRatePct}%
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="w-full bg-muted rounded-full h-2 mt-1">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(data.occupancyRatePct, 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {data.occupiedRooms} occupied / {data.totalRooms} total
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* 3. DEPARTMENTAL OPERATIONAL QUEUES */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Front Desk Queue */}
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                      <ConciergeBell className="h-4 w-4 text-primary" />
                      Front Desk
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">Slice 4</Badge>
                  </div>
                  <CardDescription className="text-xs">Guest arrivals & departures</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Today Arrivals:</span>
                    <span className="font-semibold text-foreground">{todayArrivals}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Today Departures:</span>
                    <span className="font-semibold text-foreground">{todayDepartures}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Active Stays:</span>
                    <span className="font-semibold text-foreground">{activeStays}</span>
                  </div>
                  <div className="pt-2">
                    <Link href="/hotel/front-office">
                      <Button size="sm" variant="outline" className="w-full text-xs h-8 justify-between">
                        <span>Open Front Desk</span>
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Housekeeping Turnover Queue */}
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-amber-500" />
                      Housekeeping
                    </CardTitle>
                    <Badge
                      variant={dirtyRooms > 0 ? "warning" : "success"}
                      className="text-[10px]"
                    >
                      {dirtyRooms > 0 ? `${dirtyRooms} Dirty` : "Clean"}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">Room cleaning & readiness</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Dirty / Turnover:</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">{dirtyRooms}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">In Cleaning:</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">{cleaningRooms}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Inspected / Ready:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{inspectedRooms}</span>
                  </div>
                  <div className="pt-2">
                    <Link href="/hotel/housekeeping">
                      <Button size="sm" variant="outline" className="w-full text-xs h-8 justify-between">
                        <span>Housekeeping Console</span>
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* Maintenance & Engineering */}
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                      <Wrench className="h-4 w-4 text-rose-500" />
                      Maintenance
                    </CardTitle>
                    <Badge
                      variant={maintenanceRooms > 0 ? "destructive" : "outline"}
                      className="text-[10px]"
                    >
                      {maintenanceRooms > 0 ? `${maintenanceRooms} OOO` : "Normal"}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">Engineering & repairs</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Out of Service Rooms:</span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">{maintenanceRooms}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Open Work Requests:</span>
                    <span className="font-semibold text-foreground">{maintSummary?.openCount ?? 0}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Active Work In-Progress:</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">{maintSummary?.inProgressCount ?? 0}</span>
                  </div>
                  <div className="pt-2">
                    <Link href="/hotel/maintenance">
                      <Button size="sm" variant="outline" className="w-full text-xs h-8 justify-between">
                        <span>Maintenance Queue</span>
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>

              {/* In-Room Dining & Room Service */}
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                      <UtensilsCrossed className="h-4 w-4 text-primary" />
                      Room Service
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">F&amp;B Console</Badge>
                  </div>
                  <CardDescription className="text-xs">In-room dining & fulfillment</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Active Room Orders:</span>
                    <span className="font-semibold text-primary">{roomServiceSummary?.activeOrdersCount ?? 0}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Kitchen Routing:</span>
                    <span className="font-semibold text-foreground">KDS Enabled</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Folio Auto-Posting:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Active</span>
                  </div>
                  <div className="pt-2">
                    <Link href="/hotel/room-service">
                      <Button size="sm" variant="outline" className="w-full text-xs h-8 justify-between">
                        <span>Room Service Console</span>
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 4. ROOM TYPE INVENTORY & RATES */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Housekeeping Breakdown Card */}
              <Card className="lg:col-span-1 border-border">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Turnover State Distribution
                  </CardTitle>
                  <CardDescription>
                    Real-time room cleanliness and maintenance states
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Clean & Ready for Sale</span>
                    <Badge variant="success" className="font-bold">{cleanRooms}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Dirty / Turnover Required</span>
                    <Badge variant="warning" className="font-bold">{dirtyRooms}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Cleaning In-Progress</span>
                    <Badge variant="info" className="font-bold">{cleaningRooms}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">Inspected / VIP Ready</span>
                    <Badge className="font-bold bg-purple-600 hover:bg-purple-700">{inspectedRooms}</Badge>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20">
                    <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">Out of Service / Engineering</span>
                    <Badge variant="destructive" className="font-bold">{maintenanceRooms}</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Room Types Breakdown */}
              <Card className="lg:col-span-2 border-border">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BedDouble className="h-4 w-4 text-primary" />
                      Inventory &amp; Rates by Room Type
                    </CardTitle>
                    <CardDescription>
                      Availability and baseline rate per configured category
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

            {/* Quick Operational Launchpad */}
            <Card className="bg-muted/20 border-border">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-md bg-primary/10 text-primary mt-0.5">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground">
                        Operational Quick Launchpad
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Rapid staff navigation across front office, stays, guest directory, room rack, and billing.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link href="/hotel/front-office">
                      <Button size="sm" className="gap-1.5">
                        <LogIn className="h-3.5 w-3.5" />
                        Front Desk Check-in
                      </Button>
                    </Link>
                    <Link href="/hotel/rooms">
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <DoorOpen className="h-3.5 w-3.5" />
                        Room Rack
                      </Button>
                    </Link>
                    <Link href="/hotel/reservations">
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        Reservations
                      </Button>
                    </Link>
                    <Link href="/hotel/stays">
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <KeyRound className="h-3.5 w-3.5" />
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
