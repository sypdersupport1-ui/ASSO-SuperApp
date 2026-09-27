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
  Sparkles,
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
  ShieldCheck,
  RotateCcw,
  Check,
  X,
  BedDouble,
  Building,
} from "lucide-react";
import type {
  HousekeepingTaskDetail,
  HousekeepingSummary,
} from "@/lib/hotel/housekeeping-service";
import type { HotelRoom } from "@/db/schema/hotel";

export default function HousekeepingPage() {
  const [tasks, setTasks] = useState<HousekeepingTaskDetail[]>([]);
  const [summary, setSummary] = useState<HousekeepingSummary | null>(null);
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all-tasks");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");

  // Modal States
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [inspectDialogOpen, setInspectDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<HousekeepingTaskDetail | null>(null);

  // Form states
  const [newTaskRoomId, setNewTaskRoomId] = useState("");
  const [newTaskType, setNewTaskType] = useState("DEPARTURE_TURNOVER");
  const [newTaskPriority, setNewTaskPriority] = useState("NORMAL");
  const [newTaskNotes, setNewTaskNotes] = useState("");
  const [inspectionPassed, setInspectionPassed] = useState(true);
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [assignStaffName, setAssignStaffName] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchHousekeepingData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch summary, tasks, and rooms in parallel
      const [summaryRes, tasksRes, roomsRes] = await Promise.all([
        fetch("/api/v1/hotel/housekeeping/summary"),
        fetch("/api/v1/hotel/housekeeping/tasks"),
        fetch("/api/v1/hotel/rooms"),
      ]);

      const [summaryJson, tasksJson, roomsJson] = await Promise.all([
        summaryRes.json(),
        tasksRes.json(),
        roomsRes.json(),
      ]);

      if (summaryJson.success) {
        setSummary(summaryJson.data);
      }
      if (tasksJson.success) {
        setTasks(tasksJson.data || []);
      }
      if (roomsJson.success) {
        setRooms(roomsJson.data || []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load housekeeping operational data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHousekeepingData();

    // Connect to Server-Sent Events (SSE) for real-time updates
    const eventSource = new EventSource("/api/v1/realtime");

    eventSource.addEventListener("housekeeping.task_created", () => {
      fetchHousekeepingData();
    });
    eventSource.addEventListener("housekeeping.task_assigned", () => {
      fetchHousekeepingData();
    });
    eventSource.addEventListener("housekeeping.task_started", () => {
      fetchHousekeepingData();
    });
    eventSource.addEventListener("housekeeping.task_completed", () => {
      fetchHousekeepingData();
    });
    eventSource.addEventListener("housekeeping.task_inspected", () => {
      fetchHousekeepingData();
    });
    eventSource.addEventListener("room.housekeeping_changed", () => {
      fetchHousekeepingData();
    });

    return () => {
      eventSource.close();
    };
  }, [fetchHousekeepingData]);

  // Task Actions
  const handleStartTask = async (taskId: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/hotel/housekeeping/tasks/${taskId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to start cleaning task.");
      }
      await fetchHousekeepingData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/hotel/housekeeping/tasks/${taskId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to complete cleaning task.");
      }
      await fetchHousekeepingData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskRoomId) {
      alert("Please select a room.");
      return;
    }
    try {
      setActionLoading(true);
      const res = await fetch("/api/v1/hotel/housekeeping/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: newTaskRoomId,
          taskType: newTaskType,
          priority: newTaskPriority,
          notes: newTaskNotes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to create housekeeping task.");
      }
      setCreateDialogOpen(false);
      setNewTaskRoomId("");
      setNewTaskNotes("");
      await fetchHousekeepingData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleInspectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;

    try {
      setActionLoading(true);
      const res = await fetch(
        `/api/v1/hotel/housekeeping/tasks/${selectedTask.taskId}/inspect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            passed: inspectionPassed,
            notes: inspectionNotes,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to submit inspection.");
      }
      setInspectDialogOpen(false);
      setSelectedTask(null);
      setInspectionNotes("");
      await fetchHousekeepingData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
    if (priorityFilter !== "ALL" && t.priority !== priorityFilter) return false;
    if (search.trim()) {
      const term = search.toLowerCase();
      const matchRoom = t.roomNumber.toLowerCase().includes(term);
      const matchType = t.taskType.toLowerCase().includes(term);
      const matchStaff = t.assignedStaffName?.toLowerCase().includes(term);
      const matchNotes = t.notes?.toLowerCase().includes(term);
      if (!matchRoom && !matchType && !matchStaff && !matchNotes) return false;
    }
    return true;
  });

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "URGENT":
        return <Badge variant="destructive" className="font-semibold text-xs">URGENT</Badge>;
      case "HIGH":
        return <Badge className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs">HIGH</Badge>;
      case "LOW":
        return <Badge variant="secondary" className="text-xs">LOW</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">NORMAL</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "INSPECTED":
        return (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs">
            <CheckCircle2 className="h-3 w-3" /> INSPECTED / READY
          </Badge>
        );
      case "CLEANED":
        return (
          <Badge className="bg-purple-600 hover:bg-purple-700 text-white gap-1 text-xs">
            <Sparkles className="h-3 w-3" /> AWAITING INSPECTION
          </Badge>
        );
      case "IN_PROGRESS":
        return (
          <Badge className="bg-blue-600 hover:bg-blue-700 text-white gap-1 text-xs">
            <Clock className="h-3 w-3" /> CLEANING IN PROGRESS
          </Badge>
        );
      case "ASSIGNED":
        return (
          <Badge className="bg-sky-600 hover:bg-sky-700 text-white gap-1 text-xs">
            <UserCheck className="h-3 w-3" /> ASSIGNED
          </Badge>
        );
      case "PENDING":
        return (
          <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1 text-xs">
            <AlertCircle className="h-3 w-3" /> PENDING
          </Badge>
        );
      case "CANCELLED":
        return <Badge variant="secondary" className="text-xs">CANCELLED</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <HotelNav />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header Console */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                <Sparkles className="h-7 w-7 text-primary" />
                Housekeeping Operations
              </h1>
              <Badge variant="outline" className="text-xs font-mono">
                Slice 5
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Room turnover, daily cleaning workflow, inspection, and readiness management.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchHousekeepingData}
              disabled={loading}
              className="gap-2 h-10 px-4 min-w-[44px]"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              className="gap-2 h-10 px-4 min-w-[44px]"
            >
              <Plus className="h-4 w-4" />
              <span>New Task</span>
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive text-destructive text-sm flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Operational KPI Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Needs Cleaning */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Needs Cleaning
              </CardDescription>
              <CardTitle className="text-2xl sm:text-3xl font-bold text-amber-600">
                {summary ? summary.roomCounts.dirty : 0}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="font-semibold text-foreground">
                  {summary ? summary.taskCounts.pending : 0}
                </span>{" "}
                pending turnover tasks
              </p>
            </CardContent>
          </Card>

          {/* 2. In Progress */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Cleaning In Progress
              </CardDescription>
              <CardTitle className="text-2xl sm:text-3xl font-bold text-blue-600">
                {summary ? summary.taskCounts.inProgress : 0}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="font-semibold text-foreground">
                  {summary ? summary.roomCounts.cleaning : 0}
                </span>{" "}
                rooms currently being cleaned
              </p>
            </CardContent>
          </Card>

          {/* 3. Awaiting Inspection */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Awaiting Inspection
              </CardDescription>
              <CardTitle className="text-2xl sm:text-3xl font-bold text-purple-600">
                {summary ? summary.taskCounts.cleaned : 0}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="font-semibold text-foreground">
                  {summary ? summary.taskCounts.inspectedToday : 0}
                </span>{" "}
                inspected today
              </p>
            </CardContent>
          </Card>

          {/* 4. Ready For Sale */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Ready For Occupancy
              </CardDescription>
              <CardTitle className="text-2xl sm:text-3xl font-bold text-emerald-600">
                {summary ? summary.roomCounts.readyForOccupancy : 0}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="font-semibold text-foreground">
                  {summary ? summary.roomCounts.occupied : 0}
                </span>{" "}
                occupied / {summary ? summary.roomCounts.totalRooms : 0} total rooms
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Operational Workspace Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-2 sm:grid-cols-3 w-full sm:w-auto h-auto p-1 bg-muted/60">
            <TabsTrigger value="all-tasks" className="text-xs py-2 gap-1.5 min-h-[44px]">
              <Sparkles className="h-4 w-4" />
              <span>All Tasks ({tasks.length})</span>
            </TabsTrigger>
            <TabsTrigger value="my-tasks" className="text-xs py-2 gap-1.5 min-h-[44px]">
              <UserCheck className="h-4 w-4" />
              <span>Active Work ({tasks.filter(t => t.status !== "INSPECTED" && t.status !== "CANCELLED").length})</span>
            </TabsTrigger>
            <TabsTrigger value="room-readiness" className="text-xs py-2 gap-1.5 min-h-[44px]">
              <DoorOpen className="h-4 w-4" />
              <span>Room Readiness Matrix ({rooms.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: ALL TASKS */}
          <TabsContent value="all-tasks" className="space-y-4">
            {/* Search and Filters Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-card p-3 rounded-lg border border-border">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter by room, task, notes..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-10 text-xs"
                />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-10 text-xs px-3 rounded-md border border-input bg-background text-foreground"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="CLEANED">Cleaned</option>
                  <option value="INSPECTED">Inspected</option>
                </select>

                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="h-10 text-xs px-3 rounded-md border border-input bg-background text-foreground"
                >
                  <option value="ALL">All Priorities</option>
                  <option value="URGENT">Urgent</option>
                  <option value="HIGH">High</option>
                  <option value="NORMAL">Normal</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>

            {/* Tasks Data Grid */}
            {filteredTasks.length === 0 ? (
              <div className="text-center py-12 border border-dashed rounded-lg bg-card text-muted-foreground text-sm">
                No housekeeping tasks matching the current filters.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTasks.map((task) => (
                  <Card key={task.taskId} className="border-border hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-lg text-foreground">
                              Room {task.roomNumber}
                            </span>
                            {getPriorityBadge(task.priority)}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {task.roomTypeName} • Floor {task.floorNumber || "1"}
                          </p>
                        </div>
                        {getStatusBadge(task.status)}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3 pt-0">
                      <div className="p-2.5 rounded bg-muted/50 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Type:</span>
                          <span className="font-medium text-foreground">
                            {task.taskType.replace(/_/g, " ")}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Trigger:</span>
                          <span className="font-medium text-foreground">{task.triggerSource}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Room State:</span>
                          <span className="font-semibold text-foreground">
                            {task.operationalStatus} + {task.housekeepingStatus}
                          </span>
                        </div>
                        {task.isOccupied && (
                          <div className="flex items-center gap-1 text-amber-600 font-semibold pt-1">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Guest In-House (Protect Occupancy)
                          </div>
                        )}
                        {task.notes && (
                          <p className="text-muted-foreground italic border-t border-border/40 pt-1 mt-1">
                            "{task.notes}"
                          </p>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-1 border-t border-border">
                        {task.status === "PENDING" && (
                          <Button
                            size="sm"
                            className="w-full h-10 gap-1.5 text-xs font-semibold"
                            onClick={() => handleStartTask(task.taskId)}
                            disabled={actionLoading}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Start Cleaning
                          </Button>
                        )}

                        {task.status === "ASSIGNED" && (
                          <Button
                            size="sm"
                            className="w-full h-10 gap-1.5 text-xs font-semibold"
                            onClick={() => handleStartTask(task.taskId)}
                            disabled={actionLoading}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Start Cleaning
                          </Button>
                        )}

                        {task.status === "IN_PROGRESS" && (
                          <Button
                            size="sm"
                            className="w-full h-10 gap-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white"
                            onClick={() => handleCompleteTask(task.taskId)}
                            disabled={actionLoading}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Mark Cleaned
                          </Button>
                        )}

                        {task.status === "CLEANED" && (
                          <Button
                            size="sm"
                            className="w-full h-10 gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => {
                              setSelectedTask(task);
                              setInspectionPassed(true);
                              setInspectDialogOpen(true);
                            }}
                            disabled={actionLoading}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Inspect Room
                          </Button>
                        )}

                        {task.status === "INSPECTED" && (
                          <div className="w-full text-center py-2 text-xs font-medium text-emerald-600 flex items-center justify-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4" /> Ready for Occupancy
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* TAB 2: ACTIVE WORK / MY TASKS */}
          <TabsContent value="my-tasks" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tasks
                .filter((t) => t.status === "IN_PROGRESS" || t.status === "ASSIGNED" || t.status === "PENDING")
                .map((task) => (
                  <Card key={task.taskId} className="border-border">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-lg">Room {task.roomNumber}</span>
                        {getPriorityBadge(task.priority)}
                      </div>
                      <CardDescription className="text-xs">
                        {task.taskType.replace(/_/g, " ")} • Floor {task.floorNumber || "1"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-xs p-2 rounded bg-muted/50">
                        <span className="text-muted-foreground">Current Status:</span>
                        {getStatusBadge(task.status)}
                      </div>

                      {task.status === "IN_PROGRESS" ? (
                        <Button
                          size="sm"
                          className="w-full h-10 gap-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white"
                          onClick={() => handleCompleteTask(task.taskId)}
                          disabled={actionLoading}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Complete Cleaning
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full h-10 gap-1.5 text-xs font-semibold"
                          onClick={() => handleStartTask(task.taskId)}
                          disabled={actionLoading}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Start Cleaning
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
            </div>
          </TabsContent>

          {/* TAB 3: ROOM READINESS MATRIX */}
          <TabsContent value="room-readiness" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {rooms.map((room) => {
                const isReady =
                  room.operationalStatus === "AVAILABLE" &&
                  (room.housekeepingStatus === "INSPECTED" || room.housekeepingStatus === "CLEAN");
                const isDirty = room.housekeepingStatus === "DIRTY";
                const isCleaning = room.housekeepingStatus === "CLEANING";

                return (
                  <div
                    key={room.roomId}
                    className={`p-3 rounded-lg border text-xs space-y-2 ${
                      isReady
                        ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20"
                        : isDirty
                        ? "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20"
                        : isCleaning
                        ? "border-blue-200 bg-blue-50/50 dark:bg-blue-950/20"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-foreground">
                        {room.roomNumber}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Fl {room.floorNumber || "1"}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <Badge
                        variant="outline"
                        className={`text-[10px] w-full justify-center ${
                          room.operationalStatus === "OCCUPIED"
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300"
                            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300"
                        }`}
                      >
                        {room.operationalStatus}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] w-full justify-center ${
                          room.housekeepingStatus === "INSPECTED"
                            ? "bg-emerald-600 text-white"
                            : room.housekeepingStatus === "DIRTY"
                            ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-300"
                            : room.housekeepingStatus === "CLEANING"
                            ? "bg-blue-600 text-white"
                            : "bg-purple-600 text-white"
                        }`}
                      >
                        {room.housekeepingStatus}
                      </Badge>
                    </div>

                    {isDirty && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-8 text-[10px] font-semibold"
                        onClick={() => {
                          setNewTaskRoomId(room.roomId);
                          setCreateDialogOpen(true);
                        }}
                      >
                        + Turnover
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        {/* MODAL 1: NEW TASK DIALOG */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                Create Housekeeping Task
              </DialogTitle>
              <DialogDescription>
                Dispatch cleaning or turnover for a physical room.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateTask} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Room</label>
                <select
                  value={newTaskRoomId}
                  onChange={(e) => setNewTaskRoomId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  required
                >
                  <option value="">Select Room...</option>
                  {rooms.map((r) => (
                    <option key={r.roomId} value={r.roomId}>
                      Room {r.roomNumber} ({r.operationalStatus} - {r.housekeepingStatus})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Task Type</label>
                <select
                  value={newTaskType}
                  onChange={(e) => setNewTaskType(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="DEPARTURE_TURNOVER">Departure Turnover</option>
                  <option value="ROUTINE_CLEANING">Routine Cleaning</option>
                  <option value="DEEP_CLEANING">Deep Cleaning</option>
                  <option value="INSPECTION">Inspection Only</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Priority</label>
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                >
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High (Turnover)</option>
                  <option value="URGENT">Urgent (VIP Arrival)</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Notes / Instructions</label>
                <Input
                  placeholder="Optional cleaning notes or special instructions..."
                  value={newTaskNotes}
                  onChange={(e) => setNewTaskNotes(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>

              <DialogFooter className="pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                  disabled={actionLoading}
                  className="min-h-[44px]"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={actionLoading} className="min-h-[44px]">
                  {actionLoading ? "Creating..." : "Create Task"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* MODAL 2: INSPECTION WORKFLOW DIALOG */}
        <Dialog open={inspectDialogOpen} onOpenChange={setInspectDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                Room Inspection Workflow
              </DialogTitle>
              <DialogDescription>
                Verify Room {selectedTask?.roomNumber} after cleaning.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleInspectSubmit} className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Inspection Verdict</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setInspectionPassed(true)}
                    className={`p-3 rounded-lg border text-center transition-all min-h-[44px] ${
                      inspectionPassed
                        ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-emerald-600" />
                    <span className="text-xs font-bold block">PASS / MARK READY</span>
                    <span className="text-[10px] text-muted-foreground">Room is clean & ready for sale</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInspectionPassed(false)}
                    className={`p-3 rounded-lg border text-center transition-all min-h-[44px] ${
                      !inspectionPassed
                        ? "border-rose-600 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 ring-2 ring-rose-500"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <X className="h-5 w-5 mx-auto mb-1 text-rose-600" />
                    <span className="text-xs font-bold block">FAIL / RE-CLEAN</span>
                    <span className="text-[10px] text-muted-foreground">Send back as DIRTY</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Inspection Notes {inspectionPassed ? "(Optional)" : "(Required for Re-cleaning)"}
                </label>
                <Input
                  placeholder={
                    inspectionPassed
                      ? "Inspection verified, ready for check-in..."
                      : "Explain why inspection failed (e.g. bathroom needs retowel)..."
                  }
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  className="h-10 text-sm"
                  required={!inspectionPassed}
                />
              </div>

              <DialogFooter className="pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setInspectDialogOpen(false)}
                  disabled={actionLoading}
                  className="min-h-[44px]"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                  className={`min-h-[44px] ${
                    inspectionPassed ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  }`}
                >
                  {actionLoading
                    ? "Submitting..."
                    : inspectionPassed
                    ? "Approve & Mark Ready"
                    : "Reject & Re-open Task"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
