"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Grid3X3,
  Layers,
  Move,
  Save,
  RotateCcw,
  Plus,
  Users,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Ban,
  ArrowRightLeft,
  QrCode,
  Sparkles,
  RefreshCw,
  Info,
  Check,
  X,
  Edit2,
  Trash2,
  FolderPlus,
  LayoutGrid,
} from "lucide-react";
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

export interface SectionItem {
  sectionId: string;
  name: string;
  code?: string | null;
  displayOrder: number;
  isActive: boolean;
}

export interface TableItem {
  tableId: string;
  tableNumber: string;
  displayLabel: string;
  capacity: number;
  section: string;
  sectionId?: string | null;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING" | "OUT_OF_SERVICE";
  posX: number;
  posY: number;
  width: number;
  height: number;
  shape: "RECTANGLE" | "ROUND" | "SQUARE";
  rotation: number;
  isActive: boolean;
  activeSession?: {
    sessionId: string;
    sessionNumber: string;
    guestCount: number;
    customerName?: string | null;
    customerPhone?: string | null;
    openedAt: string;
    notes?: string | null;
  } | null;
  hasActiveQr: boolean;
  qrTokenId?: string | null;
  qrOpaqueToken?: string | null;
}

interface FloorMapProps {
  tables: TableItem[];
  onRefresh: () => void;
  onViewQr?: (table: TableItem) => void;
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; label: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }> = {
  AVAILABLE: {
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-500/50 hover:border-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    label: "Available",
    badgeVariant: "secondary",
  },
  OCCUPIED: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-500/60 hover:border-amber-500 ring-1 ring-amber-500/20",
    text: "text-amber-700 dark:text-amber-400",
    label: "Occupied",
    badgeVariant: "default",
  },
  RESERVED: {
    bg: "bg-indigo-50 dark:bg-indigo-950/30",
    border: "border-indigo-500/50 hover:border-indigo-500",
    text: "text-indigo-700 dark:text-indigo-400",
    label: "Reserved",
    badgeVariant: "secondary",
  },
  CLEANING: {
    bg: "bg-sky-50 dark:bg-sky-950/30",
    border: "border-sky-500/50 hover:border-sky-500",
    text: "text-sky-700 dark:text-sky-400",
    label: "Cleaning",
    badgeVariant: "secondary",
  },
  OUT_OF_SERVICE: {
    bg: "bg-slate-100 dark:bg-slate-900/50",
    border: "border-slate-400/40 hover:border-slate-500",
    text: "text-slate-500 dark:text-slate-400",
    label: "Out of Service",
    badgeVariant: "outline",
  },
};

export function FloorMap({ tables, onRefresh, onViewQr }: FloorMapProps) {
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>("ALL");
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [localTables, setLocalTables] = useState<TableItem[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [savingLayout, setSavingLayout] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Selected table for operational action dialog
  const [activeTableModal, setActiveTableModal] = useState<TableItem | null>(null);

  // Transfer Session Dialog
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [targetTableId, setTargetTableId] = useState<string>("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferring, setTransferring] = useState(false);

  // Open Session Dialog
  const [openSessionModalOpen, setOpenSessionModalOpen] = useState(false);
  const [guestCount, setGuestCount] = useState<number>(2);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [openingSession, setOpeningSession] = useState(false);

  // Close Session Dialog
  const [closeSessionModalOpen, setCloseSessionModalOpen] = useState(false);
  const [nextCloseStatus, setNextCloseStatus] = useState<"CLEANING" | "AVAILABLE">("CLEANING");
  const [closeNotes, setCloseNotes] = useState("");
  const [closingSession, setClosingSession] = useState(false);

  // Manage Sections Dialog
  const [manageSectionsOpen, setManageSectionsOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionCode, setNewSectionCode] = useState("");
  const [creatingSection, setCreatingSection] = useState(false);

  // Dragging state
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Fetch sections
  const fetchSections = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/restaurant/sections");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setSections(json.data);
      }
    } catch (e) {
      console.error("Failed to load sections", e);
    }
  }, []);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  // Sync tables from props into local editable state
  useEffect(() => {
    if (!isEditMode) {
      // Auto-assign default spatial coordinates if tables start at (0, 0)
      const mapped = tables.map((t, idx) => {
        if (t.posX === 0 && t.posY === 0) {
          const col = idx % 5;
          const row = Math.floor(idx / 5);
          return {
            ...t,
            posX: 30 + col * 170,
            posY: 30 + row * 160,
          };
        }
        return t;
      });
      setLocalTables(mapped);
      setHasUnsavedChanges(false);
    }
  }, [tables, isEditMode]);

  // Filter tables by active section
  const visibleTables = localTables.filter((t) => {
    if (selectedSection === "ALL") return true;
    if (t.sectionId) return t.sectionId === selectedSection;
    return t.section === selectedSection;
  });

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent, table: TableItem) => {
    if (!isEditMode) return;
    e.stopPropagation();
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    setDraggingTableId(table.tableId);
    setDragOffset({
      x: e.clientX - canvasRect.left - table.posX,
      y: e.clientY - canvasRect.top - table.posY,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isEditMode || !draggingTableId || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();

    // Snap to 20px grid
    const rawX = e.clientX - canvasRect.left - dragOffset.x;
    const rawY = e.clientY - canvasRect.top - dragOffset.y;
    const snappedX = Math.max(10, Math.round(rawX / 20) * 20);
    const snappedY = Math.max(10, Math.round(rawY / 20) * 20);

    setLocalTables((prev) =>
      prev.map((t) => (t.tableId === draggingTableId ? { ...t, posX: snappedX, posY: snappedY } : t))
    );
    setHasUnsavedChanges(true);
  };

  const handleMouseUp = () => {
    if (draggingTableId) {
      setDraggingTableId(null);
    }
  };

  // Save layout
  const handleSaveLayout = async () => {
    setSavingLayout(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const payload = {
        tables: localTables.map((t) => ({
          tableId: t.tableId,
          posX: t.posX,
          posY: t.posY,
          width: t.width,
          height: t.height,
          shape: t.shape,
          rotation: t.rotation,
          sectionId: t.sectionId || undefined,
        })),
      };

      const res = await fetch("/api/v1/restaurant/tables/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success) {
        setActionSuccess("Floor plan layout saved successfully!");
        setHasUnsavedChanges(false);
        setIsEditMode(false);
        onRefresh();
      } else {
        setActionError(json.error?.message || "Failed to save layout.");
      }
    } catch {
      setActionError("Server error while saving layout.");
    } finally {
      setSavingLayout(false);
    }
  };

  const handleCancelLayout = () => {
    setLocalTables(tables);
    setHasUnsavedChanges(false);
    setIsEditMode(false);
  };

  // Shape toggler in edit mode
  const cycleTableShape = (tableId: string) => {
    const shapes: Array<"RECTANGLE" | "ROUND" | "SQUARE"> = ["RECTANGLE", "ROUND", "SQUARE"];
    setLocalTables((prev) =>
      prev.map((t) => {
        if (t.tableId === tableId) {
          const nextIdx = (shapes.indexOf(t.shape) + 1) % shapes.length;
          return { ...t, shape: shapes[nextIdx] };
        }
        return t;
      })
    );
    setHasUnsavedChanges(true);
  };

  // Table Operational Actions
  const handleOpenSession = async () => {
    if (!activeTableModal) return;
    setOpeningSession(true);
    setActionError(null);
    try {
      const res = await fetch("/api/v1/restaurant/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableId: activeTableModal.tableId,
          guestCount,
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          notes: sessionNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionSuccess(`Dining session opened for Table ${activeTableModal.tableNumber}`);
        setOpenSessionModalOpen(false);
        setActiveTableModal(null);
        onRefresh();
      } else {
        setActionError(json.error?.message || "Failed to open dining session.");
      }
    } catch {
      setActionError("Network error while opening session.");
    } finally {
      setOpeningSession(false);
    }
  };

  const handleCloseSession = async () => {
    if (!activeTableModal?.activeSession) return;
    setClosingSession(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/v1/restaurant/sessions/${activeTableModal.activeSession.sessionId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nextTableStatus: nextCloseStatus,
          notes: closeNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionSuccess(`Session closed. Table ${activeTableModal.tableNumber} is now ${nextCloseStatus}.`);
        setCloseSessionModalOpen(false);
        setActiveTableModal(null);
        onRefresh();
      } else {
        setActionError(json.error?.message || "Failed to close dining session.");
      }
    } catch {
      setActionError("Network error while closing session.");
    } finally {
      setClosingSession(false);
    }
  };

  const handleTransferSession = async () => {
    if (!activeTableModal?.activeSession || !targetTableId) return;
    setTransferring(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/v1/restaurant/sessions/${activeTableModal.activeSession.sessionId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetTableId,
          notes: transferNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        const dest = tables.find((t) => t.tableId === targetTableId)?.tableNumber || "target";
        setActionSuccess(`Session successfully transferred from Table ${activeTableModal.tableNumber} to Table ${dest}!`);
        setTransferModalOpen(false);
        setActiveTableModal(null);
        onRefresh();
      } else {
        setActionError(json.error?.message || "Session transfer failed.");
      }
    } catch {
      setActionError("Network error during session transfer.");
    } finally {
      setTransferring(false);
    }
  };

  const handleQuickStatusChange = async (table: TableItem, nextStatus: string) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/v1/restaurant/tables/${table.tableId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, reason: "Manual floor plan status update" }),
      });
      const json = await res.json();
      if (json.success) {
        setActionSuccess(`Table ${table.tableNumber} status updated to ${nextStatus}.`);
        setActiveTableModal(null);
        onRefresh();
      } else {
        setActionError(json.error?.message || "Status change failed.");
      }
    } catch {
      setActionError("Network error while changing status.");
    }
  };

  // Create section
  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionName.trim()) return;
    setCreatingSection(true);
    try {
      const res = await fetch("/api/v1/restaurant/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSectionName.trim(),
          code: newSectionCode.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setNewSectionName("");
        setNewSectionCode("");
        fetchSections();
      } else {
        alert(json.error?.message || "Failed to create section.");
      }
    } finally {
      setCreatingSection(false);
    }
  };

  // Eligible transfer destination tables: Active, not the current table, and currently AVAILABLE
  const eligibleTransferTargets = tables.filter(
    (t) => t.tableId !== activeTableModal?.tableId && t.isActive && t.status === "AVAILABLE"
  );

  return (
    <div className="space-y-4">
      {/* Action alerts */}
      {actionError && (
        <Alert variant="destructive" className="animate-in fade-in">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Operation Error</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{actionError}</span>
            <Button variant="ghost" size="sm" onClick={() => setActionError(null)}>Dismiss</Button>
          </AlertDescription>
        </Alert>
      )}

      {actionSuccess && (
        <Alert className="border-emerald-500/50 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{actionSuccess}</span>
            <Button variant="ghost" size="sm" onClick={() => setActionSuccess(null)}>Dismiss</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Top Toolbar: Section Selector & Controls */}
      <Card className="border-border">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          {/* Section filter tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground mr-1 uppercase tracking-wider flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" /> Area:
            </span>
            <Button
              variant={selectedSection === "ALL" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedSection("ALL")}
              className="h-8 text-xs font-medium"
            >
              All Sections ({localTables.length})
            </Button>
            {sections.map((sec) => {
              const count = localTables.filter((t) => t.sectionId === sec.sectionId || t.section === sec.name).length;
              return (
                <Button
                  key={sec.sectionId}
                  variant={selectedSection === sec.sectionId || selectedSection === sec.name ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedSection(sec.sectionId)}
                  className="h-8 text-xs font-medium"
                >
                  {sec.name} ({count})
                </Button>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setManageSectionsOpen(true)}
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              title="Configure Restaurant Sections"
            >
              <FolderPlus className="h-3.5 w-3.5 mr-1" /> Manage Sections
            </Button>
          </div>

          {/* Right Mode Actions */}
          <div className="flex items-center gap-2">
            {isEditMode ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelLayout}
                  disabled={savingLayout}
                  className="h-8 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveLayout}
                  disabled={savingLayout}
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Save className="h-3.5 w-3.5 mr-1.5" /> {savingLayout ? "Saving..." : "Save Layout"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  className="h-8 text-xs"
                  title="Reconcile floor state from server"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setIsEditMode(true)}
                  className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <Move className="h-3.5 w-3.5 mr-1.5" /> Edit Floor Layout
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Mode Notice Banner */}
      {isEditMode && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-950 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-200 rounded-lg text-xs">
          <div className="flex items-center gap-2">
            <Move className="h-4 w-4 text-indigo-600 animate-pulse" />
            <span>
              <strong>Layout Edit Mode Active:</strong> Drag tables across the canvas to reposition them (snapped to 20px grid). Click the shape icon on any table to switch between Rectangle, Round, and Square.
            </span>
          </div>
          <Badge variant="outline" className="border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300">
            Safety Guard: Layout edits never alter active dining sessions or QR codes
          </Badge>
        </div>
      )}

      {/* Status Legend Bar */}
      <div className="flex flex-wrap items-center justify-between text-xs px-2 text-muted-foreground gap-2">
        <div className="flex items-center gap-3">
          <span className="font-medium">Status Legend:</span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span> Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse"></span> Occupied (Active)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500"></span> Reserved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500"></span> Cleaning
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400"></span> Out of Service
          </span>
        </div>
        <div>
          Showing <strong>{visibleTables.length}</strong> tables
        </div>
      </div>

      {/* Interactive Floor Plan Canvas */}
      <div
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={`relative min-h-[620px] w-full border border-border rounded-xl bg-card overflow-x-auto overflow-y-hidden shadow-inner select-none transition-colors ${
          isEditMode ? "bg-grid-slate-200/50 dark:bg-grid-slate-800/40 cursor-crosshair border-dashed border-indigo-400" : ""
        }`}
        style={{
          backgroundImage: isEditMode
            ? "radial-gradient(circle, rgba(99, 102, 241, 0.15) 1px, transparent 1px)"
            : "radial-gradient(circle, rgba(148, 163, 184, 0.12) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          minWidth: "1000px",
        }}
      >
        {visibleTables.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <LayoutGrid className="h-10 w-10 mb-2 opacity-40" />
            <p className="font-medium text-sm">No tables in this section.</p>
            <p className="text-xs text-muted-foreground mt-1">Select &ldquo;All Sections&rdquo; or create a table assigned to this area.</p>
          </div>
        ) : (
          visibleTables.map((table) => {
            const styleConf = STATUS_COLORS[table.status] || STATUS_COLORS.AVAILABLE;
            const isRound = table.shape === "ROUND";
            const isSquare = table.shape === "SQUARE";

            return (
              <div
                key={table.tableId}
                onMouseDown={(e) => handleMouseDown(e, table)}
                onClick={() => {
                  if (!isEditMode) {
                    setActiveTableModal(table);
                  }
                }}
                style={{
                  position: "absolute",
                  left: `${table.posX}px`,
                  top: `${table.posY}px`,
                  width: `${isRound || isSquare ? Math.max(table.width, table.height) : table.width + 30}px`,
                  height: `${isRound || isSquare ? Math.max(table.width, table.height) : table.height}px`,
                }}
                className={`group flex flex-col justify-between p-2.5 border-2 transition-all shadow-sm ${
                  isRound ? "rounded-full items-center text-center" : isSquare ? "rounded-xl" : "rounded-2xl"
                } ${styleConf.bg} ${styleConf.border} ${
                  isEditMode
                    ? "cursor-grab active:cursor-grabbing hover:scale-105 hover:shadow-md ring-2 ring-indigo-400/50"
                    : "cursor-pointer hover:shadow-md hover:-translate-y-0.5"
                }`}
              >
                {/* Table Header: Table Number & Status Pill */}
                <div className={`w-full flex items-center justify-between gap-1 ${isRound ? "justify-center pt-1" : ""}`}>
                  <span className="font-extrabold text-sm tracking-tight text-foreground flex items-center gap-1">
                    {table.tableNumber}
                  </span>
                  {!isRound && (
                    <Badge variant={styleConf.badgeVariant} className="text-[10px] h-4 px-1.5 font-semibold">
                      {styleConf.label}
                    </Badge>
                  )}
                </div>

                {/* Table Body / Center Info */}
                <div className="flex flex-col items-center justify-center my-auto">
                  <span className="text-[11px] font-medium text-muted-foreground truncate max-w-[110px]" title={table.displayLabel}>
                    {table.displayLabel}
                  </span>

                  {table.activeSession ? (
                    <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-900/50 px-1.5 py-0.5 rounded">
                      <Users className="h-3 w-3" />
                      <span>{table.activeSession.guestCount} guests</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                      <Users className="h-3 w-3 opacity-60" />
                      <span>{table.capacity} seats</span>
                    </div>
                  )}
                </div>

                {/* Table Footer: Shape toggle in edit mode OR quick action indicator */}
                <div className={`w-full flex items-center justify-between text-[10px] text-muted-foreground ${isRound ? "justify-center pb-1" : ""}`}>
                  {isEditMode ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        cycleTableShape(table.tableId);
                      }}
                      className="text-[10px] px-1 py-0.5 rounded bg-background/80 hover:bg-background border border-border text-indigo-600 font-semibold"
                      title="Click to cycle table shape (Rectangle / Round / Square)"
                    >
                      {table.shape}
                    </button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/70 truncate">{table.section}</span>
                  )}

                  {!isRound && !isEditMode && table.hasActiveQr && (
                    <span title="Table QR Configured">
                      <QrCode className="h-3 w-3 text-muted-foreground/60" />
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ========================================================================= */}
      {/* OPERATIONAL TABLE ACTION MODAL                                            */}
      {/* ========================================================================= */}
      {activeTableModal && (
        <Dialog open={!!activeTableModal} onOpenChange={(open) => !open && setActiveTableModal(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center justify-between pr-4">
                <DialogTitle className="text-lg flex items-center gap-2">
                  <span>Table {activeTableModal.tableNumber}</span>
                  <Badge variant={STATUS_COLORS[activeTableModal.status]?.badgeVariant || "secondary"}>
                    {STATUS_COLORS[activeTableModal.status]?.label || activeTableModal.status}
                  </Badge>
                </DialogTitle>
              </div>
              <DialogDescription>
                {activeTableModal.displayLabel} • {activeTableModal.section} • Capacity: {activeTableModal.capacity} guests
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Active Session Info Box */}
              {activeTableModal.activeSession ? (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-amber-600" /> Active Dining Session
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono border-amber-300">
                      {activeTableModal.activeSession.sessionNumber}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1 border-t border-amber-200/60 dark:border-amber-800/60">
                    <div>
                      <span className="text-muted-foreground/70 block">Guests:</span>
                      <strong className="text-foreground">{activeTableModal.activeSession.guestCount} People</strong>
                    </div>
                    <div>
                      <span className="text-muted-foreground/70 block">Seated At:</span>
                      <strong className="text-foreground">
                        {new Date(activeTableModal.activeSession.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </strong>
                    </div>
                    {activeTableModal.activeSession.customerName && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground/70 block">Customer:</span>
                        <strong className="text-foreground">{activeTableModal.activeSession.customerName}</strong>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-muted/40 border border-border rounded-lg text-xs text-muted-foreground">
                  No active dining session currently on Table {activeTableModal.tableNumber}.
                </div>
              )}

              {/* Operational Action Buttons */}
              <div className="space-y-2 pt-1">
                {/* OCCUPIED Actions */}
                {activeTableModal.status === "OCCUPIED" && activeTableModal.activeSession && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="border-indigo-300 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50"
                      onClick={() => {
                        setTargetTableId("");
                        setTransferNotes("");
                        setTransferModalOpen(true);
                      }}
                    >
                      <ArrowRightLeft className="h-4 w-4 mr-1.5" /> Transfer Table
                    </Button>
                    <Button
                      variant="outline"
                      className="border-amber-300 text-amber-700 dark:text-amber-300 hover:bg-amber-50"
                      onClick={() => {
                        setNextCloseStatus("CLEANING");
                        setCloseNotes("");
                        setCloseSessionModalOpen(true);
                      }}
                    >
                      <Check className="h-4 w-4 mr-1.5" /> Close Session
                    </Button>
                  </div>
                )}

                {/* AVAILABLE Actions */}
                {activeTableModal.status === "AVAILABLE" && (
                  <div className="space-y-2">
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                      onClick={() => {
                        setGuestCount(2);
                        setCustomerName("");
                        setCustomerPhone("");
                        setSessionNotes("");
                        setOpenSessionModalOpen(true);
                      }}
                    >
                      <Users className="h-4 w-4 mr-2" /> Open Dining Session
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickStatusChange(activeTableModal, "RESERVED")}
                      >
                        Mark Reserved
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickStatusChange(activeTableModal, "OUT_OF_SERVICE")}
                      >
                        Out of Service
                      </Button>
                    </div>
                  </div>
                )}

                {/* CLEANING Actions */}
                {activeTableModal.status === "CLEANING" && (
                  <Button
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white font-medium"
                    onClick={() => handleQuickStatusChange(activeTableModal, "AVAILABLE")}
                  >
                    <Sparkles className="h-4 w-4 mr-2" /> Mark Clean & Available
                  </Button>
                )}

                {/* RESERVED or OUT_OF_SERVICE Actions */}
                {(activeTableModal.status === "RESERVED" || activeTableModal.status === "OUT_OF_SERVICE") && (
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    onClick={() => handleQuickStatusChange(activeTableModal, "AVAILABLE")}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Release to Available
                  </Button>
                )}

                {/* QR Code Action */}
                {onViewQr && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      const t = activeTableModal;
                      setActiveTableModal(null);
                      onViewQr(t);
                    }}
                  >
                    <QrCode className="h-3.5 w-3.5 mr-1.5" /> View / Download Table QR Code
                  </Button>
                )}
              </div>
            </div>

            <DialogFooter className="sm:justify-end">
              <Button variant="ghost" size="sm" onClick={() => setActiveTableModal(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* TRANSFER TABLE SESSION MODAL                                              */}
      {/* ========================================================================= */}
      {transferModalOpen && activeTableModal && (
        <Dialog open={transferModalOpen} onOpenChange={setTransferModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-indigo-600" />
                Transfer Table {activeTableModal.tableNumber}
              </DialogTitle>
              <DialogDescription>
                Transfer active session <strong>{activeTableModal.activeSession?.sessionNumber}</strong> to another available table in the restaurant.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-sm">
              <div className="p-3 bg-muted/40 border border-border rounded-lg text-xs space-y-1">
                <p>
                  <strong>Session Safety Guarantee:</strong> All placed items, active kitchen orders, and customer session history are preserved atomically. Financial ledger is unaltered.
                </p>
                <p className="text-muted-foreground">
                  Source Table {activeTableModal.tableNumber} will transition to <strong>CLEANING</strong>. Target table will transition to <strong>OCCUPIED</strong>.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Select Target Destination Table:
                </label>
                {eligibleTransferTargets.length === 0 ? (
                  <p className="text-xs text-destructive py-2">
                    No available tables found to receive transfer. Tables must be active and in AVAILABLE state.
                  </p>
                ) : (
                  <select
                    value={targetTableId}
                    onChange={(e) => setTargetTableId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">-- Choose Target Table --</option>
                    {eligibleTransferTargets.map((target) => (
                      <option key={target.tableId} value={target.tableId}>
                        Table {target.tableNumber} ({target.displayLabel}) • {target.section} • {target.capacity} seats
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Transfer Audit Notes (Optional):
                </label>
                <Input
                  placeholder="e.g. Guests requested larger booth by the window"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setTransferModalOpen(false)} disabled={transferring}>
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleTransferSession}
                disabled={transferring || !targetTableId}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {transferring ? "Transferring..." : "Confirm Table Transfer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* OPEN TABLE SESSION MODAL                                                  */}
      {/* ========================================================================= */}
      {openSessionModalOpen && activeTableModal && (
        <Dialog open={openSessionModalOpen} onOpenChange={setOpenSessionModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Seat Guests: Table {activeTableModal.tableNumber}</DialogTitle>
              <DialogDescription>
                Open an authoritative dining session for this table.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Guest Count:
                </label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={guestCount}
                  onChange={(e) => setGuestCount(parseInt(e.target.value, 10) || 1)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Customer / Guest Name (Optional):
                </label>
                <Input
                  placeholder="e.g. John Doe"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Customer Phone (Optional):
                </label>
                <Input
                  placeholder="e.g. +91 9876543210"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Notes (Optional):
                </label>
                <Input
                  placeholder="Special requests or occasion"
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpenSessionModalOpen(false)} disabled={openingSession}>
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleOpenSession}
                disabled={openingSession}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {openingSession ? "Opening..." : "Seat & Open Session"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* CLOSE TABLE SESSION MODAL                                                 */}
      {/* ========================================================================= */}
      {closeSessionModalOpen && activeTableModal && (
        <Dialog open={closeSessionModalOpen} onOpenChange={setCloseSessionModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Close Session: Table {activeTableModal.tableNumber}</DialogTitle>
              <DialogDescription>
                Complete active dining session <strong>{activeTableModal.activeSession?.sessionNumber}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Next Table State:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={nextCloseStatus === "CLEANING" ? "default" : "outline"}
                    className={nextCloseStatus === "CLEANING" ? "bg-sky-600 hover:bg-sky-700 text-white" : ""}
                    onClick={() => setNextCloseStatus("CLEANING")}
                  >
                    CLEANING (Recommended)
                  </Button>
                  <Button
                    type="button"
                    variant={nextCloseStatus === "AVAILABLE" ? "default" : "outline"}
                    className={nextCloseStatus === "AVAILABLE" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                    onClick={() => setNextCloseStatus("AVAILABLE")}
                  >
                    AVAILABLE Immediately
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                  Closing Notes (Optional):
                </label>
                <Input
                  placeholder="e.g. Guests departed smoothly"
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setCloseSessionModalOpen(false)} disabled={closingSession}>
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={handleCloseSession}
                disabled={closingSession}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {closingSession ? "Closing..." : "Confirm & Close Session"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* MANAGE RESTAURANT SECTIONS MODAL                                          */}
      {/* ========================================================================= */}
      {manageSectionsOpen && (
        <Dialog open={manageSectionsOpen} onOpenChange={setManageSectionsOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderPlus className="h-5 w-5 text-indigo-600" />
                Manage Restaurant Sections
              </DialogTitle>
              <DialogDescription>
                Create and organize restaurant floor areas (e.g. Main Hall, Patio, Bar).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Add Section Form */}
              <form onSubmit={handleCreateSection} className="space-y-2 p-3 bg-muted/40 border border-border rounded-lg">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                  Add New Section:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Section Name (e.g. Rooftop)"
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    required
                  />
                  <Input
                    placeholder="Code (e.g. ROOF)"
                    value={newSectionCode}
                    onChange={(e) => setNewSectionCode(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={creatingSection || !newSectionName.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> {creatingSection ? "Adding..." : "Add Section"}
                </Button>
              </form>

              {/* Existing Sections List */}
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                  Configured Sections ({sections.length}):
                </span>
                {sections.map((sec) => {
                  const assignedCount = localTables.filter((t) => t.sectionId === sec.sectionId || t.section === sec.name).length;
                  return (
                    <div
                      key={sec.sectionId}
                      className="flex items-center justify-between p-2 rounded border border-border bg-card text-xs"
                    >
                      <div>
                        <strong>{sec.name}</strong>
                        {sec.code && <span className="ml-1 text-muted-foreground">({sec.code})</span>}
                        <span className="ml-2 text-muted-foreground">• {assignedCount} tables</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setManageSectionsOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
