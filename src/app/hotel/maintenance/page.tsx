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
  Wrench,
  RefreshCw,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  UserCheck,
  DoorOpen,
  Filter,
  Check,
  X,
  Building,
  RotateCcw,
  Zap,
  Flame,
  Droplet,
  Tv,
  Hammer,
} from "lucide-react";
import type {
  MaintenanceRequestDetail,
  MaintenanceSummary,
} from "@/lib/hotel/maintenance-service";
import type { HotelRoom } from "@/db/schema/hotel";

export default function MaintenancePage() {
  const [requests, setRequests] = useState<MaintenanceRequestDetail[]>([]);
  const [summary, setSummary] = useState<MaintenanceSummary | null>(null);
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all-requests");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  // Modal States
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequestDetail | null>(null);

  // Form States
  const [createForm, setCreateForm] = useState({
    title: "",
    roomId: "",
    category: "PLUMBING",
    priority: "NORMAL",
    operationalImpact: "NONE",
    description: "",
    notes: "",
  });
  const [resolveForm, setResolveForm] = useState({
    resolutionNotes: "",
    restoreRoomOperationalStatus: "AVAILABLE",
  });
  const [actionLoading, setActionLoading] = useState(false);

  // Data Fetching
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [reqRes, sumRes, roomsRes] = await Promise.all([
        fetch("/api/v1/hotel/maintenance"),
        fetch("/api/v1/hotel/maintenance/summary"),
        fetch("/api/v1/hotel/rooms"),
      ]);

      if (!reqRes.ok || !sumRes.ok) {
        throw new Error("Failed to load maintenance records.");
      }

      const reqJson = await reqRes.json();
      const sumJson = await sumRes.json();

      setRequests(reqJson.data || []);
      setSummary(sumJson.data || null);

      if (roomsRes.ok) {
        const roomsJson = await roomsRes.json();
        setRooms(roomsJson.data || []);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred while loading maintenance data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime SSE Listener
  useEffect(() => {
    const eventSource = new EventSource("/api/v1/realtime");
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.event?.startsWith("maintenance.") ||
          data.event === "room.status_changed" ||
          data.event === "room.housekeeping_changed"
        ) {
          fetchData();
        }
      } catch (e) {
        // ignore parse error
      }
    };

    return () => {
      eventSource.close();
    };
  }, [fetchData]);

  // Handlers
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim() || !createForm.description.trim()) {
      alert("Please provide both a title and description.");
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch("/api/v1/hotel/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createForm.title.trim(),
          roomId: createForm.roomId || undefined,
          category: createForm.category,
          priority: createForm.priority,
          operationalImpact: createForm.operationalImpact,
          description: createForm.description.trim(),
          notes: createForm.notes.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to create maintenance request.");
      }

      setCreateDialogOpen(false);
      setCreateForm({
        title: "",
        roomId: "",
        category: "PLUMBING",
        priority: "NORMAL",
        operationalImpact: "NONE",
        description: "",
        notes: "",
      });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartWork = async (requestId: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/hotel/maintenance/${requestId}/start`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to start maintenance work.");
      }
      fetchData();
      if (selectedRequest?.requestId === requestId) {
        setSelectedRequest(json.data);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    if (!resolveForm.resolutionNotes.trim()) {
      alert("Please enter resolution notes.");
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/hotel/maintenance/${selectedRequest.requestId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolutionNotes: resolveForm.resolutionNotes.trim(),
          restoreRoomOperationalStatus: resolveForm.restoreRoomOperationalStatus,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to resolve maintenance request.");
      }

      setResolveDialogOpen(false);
      setResolveForm({
        resolutionNotes: "",
        restoreRoomOperationalStatus: "AVAILABLE",
      });
      fetchData();
      if (selectedRequest) {
        setSelectedRequest(json.data);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseRequest = async (requestId: string) => {
    if (!confirm("Are you sure you want to officially close this resolved request?")) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/hotel/maintenance/${requestId}/close`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to close maintenance request.");
      }
      fetchData();
      if (selectedRequest?.requestId === requestId) {
        setSelectedRequest(json.data);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopenRequest = async (requestId: string) => {
    const notes = prompt("Enter reason for reopening this maintenance issue:");
    if (notes === null) return;

    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/hotel/maintenance/${requestId}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to reopen maintenance request.");
      }
      fetchData();
      if (selectedRequest?.requestId === requestId) {
        setSelectedRequest(json.data);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered Lists
  const filteredRequests = requests.filter((r) => {
    if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
    if (priorityFilter !== "ALL" && r.priority !== priorityFilter) return false;
    if (categoryFilter !== "ALL" && r.category !== categoryFilter) return false;
    if (search.trim()) {
      const term = search.toLowerCase();
      const matchTitle = r.title.toLowerCase().includes(term);
      const matchDesc = r.description.toLowerCase().includes(term);
      const matchRoom = r.room?.roomNumber.toLowerCase().includes(term);
      const matchStaff = r.assignedStaffName?.toLowerCase().includes(term);
      return matchTitle || matchDesc || matchRoom || matchStaff;
    }
    return true;
  });

  const myWorkRequests = requests.filter(
    (r) => r.assignedToStaffId && r.status !== "CLOSED" && r.status !== "CANCELLED"
  );

  const affectedRoomsList = rooms.filter(
    (rm) =>
      rm.operationalStatus === "OUT_OF_ORDER" ||
      rm.operationalStatus === "OUT_OF_SERVICE" ||
      rm.housekeepingStatus === "MAINTENANCE"
  );

  // Category Icon Helper
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "PLUMBING":
        return <Droplet className="h-4 w-4 text-sky-400" />;
      case "ELECTRICAL":
        return <Zap className="h-4 w-4 text-amber-400" />;
      case "HVAC":
        return <Flame className="h-4 w-4 text-emerald-400" />;
      case "APPLIANCE":
        return <Tv className="h-4 w-4 text-purple-400" />;
      case "STRUCTURAL":
      case "FURNITURE":
        return <Hammer className="h-4 w-4 text-orange-400" />;
      default:
        return <Wrench className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <HotelNav />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Header with Title and Actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Maintenance & Engineering</h1>
                <p className="text-sm text-muted-foreground">
                  Operational issue management, room state integration & engineering dispatch
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              size="sm"
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              New Work Request
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* KPI Overview Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Card className="bg-card border-border">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Open Requests
              </CardDescription>
              <CardTitle className="text-2xl font-bold text-amber-400">
                {summary?.openCount ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
              Awaiting assignment
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                In Progress
              </CardDescription>
              <CardTitle className="text-2xl font-bold text-blue-400">
                {summary?.inProgressCount ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
              Active engineering work
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Urgent Priority
              </CardDescription>
              <CardTitle className="text-2xl font-bold text-red-500">
                {summary?.urgentCount ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
              Immediate attention
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Out of Order
              </CardDescription>
              <CardTitle className="text-2xl font-bold text-rose-400">
                {summary?.roomsAffected.outOfOrderCount ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
              Unavailable for sale
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Out of Service
              </CardDescription>
              <CardTitle className="text-2xl font-bold text-amber-500">
                {summary?.roomsAffected.outOfServiceCount ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
              Temporarily suspended
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Resolved Today
              </CardDescription>
              <CardTitle className="text-2xl font-bold text-emerald-400">
                {summary?.resolvedCount ?? 0}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
              Awaiting closure
            </CardContent>
          </Card>
        </div>

        {/* Workspace Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="bg-muted p-1 border border-border">
              <TabsTrigger value="all-requests" className="gap-2">
                <Wrench className="h-4 w-4" />
                All Work Requests ({requests.length})
              </TabsTrigger>
              <TabsTrigger value="my-work" className="gap-2">
                <UserCheck className="h-4 w-4" />
                Assigned Work ({myWorkRequests.length})
              </TabsTrigger>
              <TabsTrigger value="affected-rooms" className="gap-2">
                <DoorOpen className="h-4 w-4" />
                Affected Rooms ({affectedRoomsList.length})
              </TabsTrigger>
            </TabsList>

            {/* Global Search Filter */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search issues, rooms..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-card border-border"
              />
            </div>
          </div>

          {/* TAB 1: ALL REQUESTS */}
          <TabsContent value="all-requests" className="space-y-4">
            {/* Filter Toolbar */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                Filters:
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">OPEN</option>
                <option value="ASSIGNED">ASSIGNED</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
              </select>

              {/* Priority Filter */}
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground focus:outline-none"
              >
                <option value="ALL">All Priorities</option>
                <option value="URGENT">URGENT</option>
                <option value="HIGH">HIGH</option>
                <option value="NORMAL">NORMAL</option>
                <option value="LOW">LOW</option>
              </select>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                <option value="PLUMBING">PLUMBING</option>
                <option value="ELECTRICAL">ELECTRICAL</option>
                <option value="HVAC">HVAC</option>
                <option value="APPLIANCE">APPLIANCE</option>
                <option value="FURNITURE">FURNITURE</option>
                <option value="STRUCTURAL">STRUCTURAL</option>
                <option value="OTHER">OTHER</option>
              </select>

              {(statusFilter !== "ALL" || priorityFilter !== "ALL" || categoryFilter !== "ALL" || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatusFilter("ALL");
                    setPriorityFilter("ALL");
                    setCategoryFilter("ALL");
                    setSearch("");
                  }}
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                >
                  Reset Filters
                </Button>
              )}
            </div>

            {/* Requests Table */}
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Location / Room</th>
                    <th className="px-4 py-3">Category & Title</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Assigned Staff</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No maintenance requests match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((req) => (
                      <tr key={req.requestId} className="hover:bg-muted/40 transition-colors">
                        {/* Location */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {req.room ? (
                            <div>
                              <div className="font-semibold text-foreground flex items-center gap-1.5">
                                <DoorOpen className="h-3.5 w-3.5 text-muted-foreground" />
                                Room {req.room.roomNumber}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {req.room.roomTypeName} • Fl {req.room.floorNumber || 1}
                              </div>
                              {req.room.operationalStatus !== "AVAILABLE" && (
                                <Badge variant="outline" className="mt-1 text-[10px] bg-rose-500/10 text-rose-400 border-rose-500/30">
                                  {req.room.operationalStatus}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Building className="h-3.5 w-3.5" />
                              <span className="font-medium text-xs">Public Area</span>
                            </div>
                          )}
                        </td>

                        {/* Category & Title */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(req.category)}
                            <span className="font-medium text-foreground">{req.title}</span>
                          </div>
                          <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {req.description}
                          </div>
                        </td>

                        {/* Priority */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <Badge
                            className={`text-xs font-semibold ${
                              req.priority === "URGENT"
                                ? "bg-red-500/20 text-red-400 border-red-500/40"
                                : req.priority === "HIGH"
                                ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                                : req.priority === "NORMAL"
                                ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                                : "bg-slate-500/20 text-slate-400 border-slate-500/40"
                            }`}
                          >
                            {req.priority}
                          </Badge>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <Badge
                            className={`text-xs font-semibold ${
                              req.status === "OPEN"
                                ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                                : req.status === "ASSIGNED"
                                ? "bg-sky-500/20 text-sky-400 border-sky-500/40"
                                : req.status === "IN_PROGRESS"
                                ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                                : req.status === "RESOLVED"
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                : req.status === "CLOSED"
                                ? "bg-zinc-500/20 text-zinc-400 border-zinc-500/40"
                                : "bg-rose-500/20 text-rose-400 border-rose-500/40"
                            }`}
                          >
                            {req.status}
                          </Badge>
                        </td>

                        {/* Assigned Staff */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                          {req.assignedStaffName ? (
                            <div className="flex items-center gap-1.5 font-medium text-foreground">
                              <UserCheck className="h-3.5 w-3.5 text-primary" />
                              {req.assignedStaffName}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">Unassigned</span>
                          )}
                        </td>

                        {/* Created Time */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(req.createdAt).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          •{" "}
                          {new Date(req.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedRequest(req);
                                setDetailDialogOpen(true);
                              }}
                              className="h-8 text-xs"
                            >
                              Detail
                            </Button>

                            {req.status === "OPEN" && (
                              <Button
                                size="sm"
                                onClick={() => handleStartWork(req.requestId)}
                                disabled={actionLoading}
                                className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white"
                              >
                                Start Work
                              </Button>
                            )}

                            {req.status === "IN_PROGRESS" && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedRequest(req);
                                  setResolveDialogOpen(true);
                                }}
                                disabled={actionLoading}
                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                              >
                                Resolve
                              </Button>
                            )}

                            {req.status === "RESOLVED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCloseRequest(req.requestId)}
                                disabled={actionLoading}
                                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                              >
                                Close
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* TAB 2: MY WORK */}
          <TabsContent value="my-work" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myWorkRequests.length === 0 ? (
                <div className="col-span-full rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
                  <UserCheck className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
                  <p className="font-medium text-base">No Active Maintenance Assignments</p>
                  <p className="text-xs mt-1">All assigned work orders are resolved or closed.</p>
                </div>
              ) : (
                myWorkRequests.map((req) => (
                  <Card key={req.requestId} className="bg-card border-border hover:border-primary/50 transition-colors">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-center justify-between">
                        <Badge
                          className={`text-xs ${
                            req.priority === "URGENT"
                              ? "bg-red-500/20 text-red-400"
                              : req.priority === "HIGH"
                              ? "bg-orange-500/20 text-orange-400"
                              : "bg-blue-500/20 text-blue-400"
                          }`}
                        >
                          {req.priority}
                        </Badge>
                        <Badge variant="outline">{req.status}</Badge>
                      </div>
                      <CardTitle className="text-base font-semibold mt-2 flex items-center gap-2">
                        {getCategoryIcon(req.category)}
                        {req.title}
                      </CardTitle>
                      <CardDescription className="text-xs line-clamp-2">
                        {req.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-2 border-t border-border mt-2 space-y-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{req.room ? `Room ${req.room.roomNumber}` : "Public Area"}</span>
                        <span>{new Date(req.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedRequest(req);
                            setDetailDialogOpen(true);
                          }}
                          className="h-8 text-xs"
                        >
                          View Details
                        </Button>
                        {req.status === "IN_PROGRESS" && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedRequest(req);
                              setResolveDialogOpen(true);
                            }}
                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* TAB 3: AFFECTED ROOMS */}
          <TabsContent value="affected-rooms" className="space-y-4">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/40">
                <h3 className="font-semibold text-sm">Rooms Impacted by Maintenance Restrictions</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Rooms currently Out of Order, Out of Service, or undergoing maintenance
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
                {affectedRoomsList.length === 0 ? (
                  <div className="col-span-full py-8 text-center text-muted-foreground text-sm">
                    No physical rooms are currently restricted by maintenance.
                  </div>
                ) : (
                  affectedRoomsList.map((rm) => (
                    <Card key={rm.roomId} className="bg-background border-border">
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-lg">Room {rm.roomNumber}</span>
                          <Badge
                            className={
                              rm.operationalStatus === "OUT_OF_ORDER"
                                ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                                : rm.operationalStatus === "OUT_OF_SERVICE"
                                ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                                : "bg-blue-500/20 text-blue-400 border-blue-500/40"
                            }
                          >
                            {rm.operationalStatus}
                          </Badge>
                        </div>
                        <CardDescription className="text-xs">
                          Floor {rm.floorNumber || 1} • Housekeeping: {rm.housekeepingStatus}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-2 border-t border-border text-xs flex justify-between items-center">
                        <span className="text-muted-foreground">
                          {rm.isOccupied ? "Occupied" : "Vacant"}
                        </span>
                        <Link
                          href={`/hotel/rooms`}
                          className="text-primary hover:underline font-medium"
                        >
                          View Rack
                        </Link>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* DIALOG 1: CREATE WORK REQUEST */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" />
                New Maintenance Work Request
              </DialogTitle>
              <DialogDescription>
                Submit an operational defect or engineering issue for hotel facilities.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateRequest} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Issue Title *</label>
                <Input
                  required
                  placeholder="e.g. AC leaking water, Lamp flickering"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  className="bg-background border-border"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Room / Context</label>
                  <select
                    value={createForm.roomId}
                    onChange={(e) => setCreateForm({ ...createForm, roomId: e.target.value })}
                    className="w-full h-9 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground focus:outline-none"
                  >
                    <option value="">Public / Property Area</option>
                    {rooms.map((rm) => (
                      <option key={rm.roomId} value={rm.roomId}>
                        Room {rm.roomNumber} (Fl {rm.floorNumber || 1})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Category *</label>
                  <select
                    value={createForm.category}
                    onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                    className="w-full h-9 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground focus:outline-none"
                  >
                    <option value="PLUMBING">PLUMBING</option>
                    <option value="ELECTRICAL">ELECTRICAL</option>
                    <option value="HVAC">HVAC</option>
                    <option value="APPLIANCE">APPLIANCE</option>
                    <option value="FURNITURE">FURNITURE</option>
                    <option value="STRUCTURAL">STRUCTURAL</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Priority *</label>
                  <select
                    value={createForm.priority}
                    onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                    className="w-full h-9 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground focus:outline-none"
                  >
                    <option value="LOW">LOW</option>
                    <option value="NORMAL">NORMAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="URGENT">URGENT</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Room State Impact</label>
                  <select
                    value={createForm.operationalImpact}
                    onChange={(e) => setCreateForm({ ...createForm, operationalImpact: e.target.value as any })}
                    className="w-full h-9 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground focus:outline-none"
                  >
                    <option value="NONE">NONE (Remain Available)</option>
                    <option value="OUT_OF_SERVICE">OUT OF SERVICE</option>
                    <option value="OUT_OF_ORDER">OUT OF ORDER</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Description *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Detailed description of the issue or defect..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full rounded-md border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={actionLoading}
                  className="bg-primary text-primary-foreground"
                >
                  {actionLoading ? "Submitting..." : "Submit Request"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* DIALOG 2: RESOLVE REQUEST MODAL */}
        <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
          <DialogContent className="max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                Resolve Maintenance Request
              </DialogTitle>
              <DialogDescription>
                Document the repair solution and set the operational state for the room.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleResolveRequest} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Resolution Notes *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe repair actions taken, replaced parts, or verification steps..."
                  value={resolveForm.resolutionNotes}
                  onChange={(e) => setResolveForm({ ...resolveForm, resolutionNotes: e.target.value })}
                  className="w-full rounded-md border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none"
                />
              </div>

              {selectedRequest?.room && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Restore Room Operational Status</label>
                  <select
                    value={resolveForm.restoreRoomOperationalStatus}
                    onChange={(e) => setResolveForm({ ...resolveForm, restoreRoomOperationalStatus: e.target.value })}
                    className="w-full h-9 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground focus:outline-none"
                  >
                    <option value="AVAILABLE">AVAILABLE (Restore for sale, set Housekeeping to DIRTY)</option>
                    <option value="KEEP_CURRENT">KEEP CURRENT (Leave status as-is)</option>
                    <option value="OUT_OF_SERVICE">OUT OF SERVICE</option>
                  </select>
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setResolveDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={actionLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {actionLoading ? "Resolving..." : "Confirm Resolution"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* DIALOG 3: REQUEST DETAIL DRAWER */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="max-w-lg bg-card border-border">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2">
                  {selectedRequest && getCategoryIcon(selectedRequest.category)}
                  {selectedRequest?.title}
                </DialogTitle>
                <Badge>{selectedRequest?.status}</Badge>
              </div>
              <DialogDescription>
                Request #{selectedRequest?.requestId.slice(0, 8)}
              </DialogDescription>
            </DialogHeader>

            {selectedRequest && (
              <div className="space-y-4 py-2 text-xs">
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location:</span>
                    <span className="font-semibold text-foreground">
                      {selectedRequest.room ? `Room ${selectedRequest.room.roomNumber} (${selectedRequest.room.roomTypeName})` : "Public / Facilities Area"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Category:</span>
                    <span className="font-semibold text-foreground">{selectedRequest.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Priority:</span>
                    <span className="font-semibold text-foreground">{selectedRequest.priority}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Assigned To:</span>
                    <span className="font-semibold text-foreground">
                      {selectedRequest.assignedStaffName || "Unassigned"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created:</span>
                    <span className="text-foreground">
                      {new Date(selectedRequest.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {selectedRequest.resolvedAt && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Resolved At:</span>
                      <span>{new Date(selectedRequest.resolvedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <h4 className="font-semibold text-foreground">Description</h4>
                  <p className="rounded-md border border-border bg-background p-2 text-muted-foreground leading-relaxed">
                    {selectedRequest.description}
                  </p>
                </div>

                {selectedRequest.resolutionNotes && (
                  <div className="space-y-1">
                    <h4 className="font-semibold text-emerald-400">Resolution Notes</h4>
                    <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-foreground leading-relaxed">
                      {selectedRequest.resolutionNotes}
                    </p>
                  </div>
                )}

                {/* Workflow Actions */}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
                  {selectedRequest.status === "OPEN" && (
                    <Button
                      size="sm"
                      onClick={() => handleStartWork(selectedRequest.requestId)}
                      className="bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      Start Work
                    </Button>
                  )}

                  {selectedRequest.status === "IN_PROGRESS" && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setDetailDialogOpen(false);
                        setResolveDialogOpen(true);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      Resolve Work
                    </Button>
                  )}

                  {selectedRequest.status === "RESOLVED" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReopenRequest(selectedRequest.requestId)}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Reopen Issue
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleCloseRequest(selectedRequest.requestId)}
                      >
                        Official Close
                      </Button>
                    </>
                  )}

                  {selectedRequest.status === "CLOSED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReopenRequest(selectedRequest.requestId)}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Reopen Closed Issue
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
