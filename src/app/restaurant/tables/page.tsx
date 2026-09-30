"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  UtensilsCrossed,
  Grid3X3,
  Plus,
  RefreshCw,
  QrCode,
  Edit,
  Trash2,
  Users,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  RotateCw,
  Ban,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Power,
  Armchair,
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

interface TableItem {
  tableId: string;
  tableNumber: string;
  displayLabel: string;
  capacity: number;
  section: string;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "CLEANING" | "OUT_OF_SERVICE";
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

export default function RestaurantTableManagementPage() {
  const [tables, setTables] = useState<TableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSection, setFilterSection] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");

  // Create Table Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createTableNumber, setCreateTableNumber] = useState("");
  const [createDisplayLabel, setCreateDisplayLabel] = useState("");
  const [createCapacity, setCreateCapacity] = useState(4);
  const [createSection, setCreateSection] = useState("Main Dining");
  const [creating, setCreating] = useState(false);

  // Edit Table Modal State
  const [editTable, setEditTable] = useState<TableItem | null>(null);
  const [editDisplayLabel, setEditDisplayLabel] = useState("");
  const [editCapacity, setEditCapacity] = useState(4);
  const [editSection, setEditSection] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // Status Change State
  const [statusChangeTable, setStatusChangeTable] = useState<TableItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<string>("AVAILABLE");
  const [statusReason, setStatusReason] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // QR Modal State
  const [qrModalTable, setQrModalTable] = useState<TableItem | null>(null);
  const [qrData, setQrData] = useState<{
    qrSvgDataUri: string;
    qrUrl: string;
    opaqueToken: string;
    tokenStatus: string;
  } | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [rotatingQr, setRotatingQr] = useState(false);
  const [revokingQr, setRevokingQr] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");

  const fetchTables = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/v1/restaurant/tables");
      const json = await res.json();
      if (json.success) {
        setTables(json.data);
      } else {
        setError(json.error?.message || "Failed to load tables.");
      }
    } catch {
      setError("Network or server connection failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  // Create Table
  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/v1/restaurant/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableNumber: createTableNumber.trim(),
          displayLabel: createDisplayLabel.trim() || undefined,
          capacity: createCapacity,
          section: createSection.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setCreateModalOpen(false);
        setCreateTableNumber("");
        setCreateDisplayLabel("");
        fetchTables();
      } else {
        alert("Create failed: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error submitting table to server");
    } finally {
      setCreating(false);
    }
  };

  // Edit Table
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTable) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/v1/restaurant/tables/${editTable.tableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayLabel: editDisplayLabel.trim(),
          capacity: editCapacity,
          section: editSection.trim(),
          isActive: editIsActive,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setEditTable(null);
        fetchTables();
      } else {
        alert("Update failed: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error saving edits");
    } finally {
      setSavingEdit(false);
    }
  };

  // Toggle IsActive
  const handleToggleActive = async (table: TableItem) => {
    const actionName = table.isActive ? "deactivate" : "activate";
    if (!confirm(`Are you sure you want to ${actionName} Table ${table.tableNumber}?`)) return;

    try {
      const res = await fetch(`/api/v1/restaurant/tables/${table.tableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !table.isActive }),
      });
      const json = await res.json();
      if (json.success) {
        fetchTables();
      } else {
        alert("Action failed: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error updating active status");
    }
  };

  // Change Status
  const handleConfirmStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusChangeTable) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/v1/restaurant/tables/${statusChangeTable.tableId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: targetStatus,
          reason: statusReason.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusChangeTable(null);
        setStatusReason("");
        fetchTables();
      } else {
        alert("Status change rejected: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error updating status on server");
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Load QR for Table
  const openQrDialog = async (table: TableItem) => {
    setQrModalTable(table);
    setLoadingQr(true);
    setQrData(null);
    setRevokeReason("");
    try {
      const res = await fetch(`/api/v1/restaurant/tables/${table.tableId}/qr`);
      const json = await res.json();
      if (json.success) {
        setQrData(json.data);
      }
    } catch {
      // Error loading QR
    } finally {
      setLoadingQr(false);
    }
  };

  // Rotate QR
  const handleRotateQr = async () => {
    if (!qrModalTable) return;
    if (!confirm(`Rotate QR code for Table ${qrModalTable.tableNumber}? Existing physical QR codes and active guest sessions will be immediately invalidated.`)) return;
    setRotatingQr(true);
    try {
      const res = await fetch(`/api/v1/restaurant/tables/${qrModalTable.tableId}/qr/rotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Staff triggered QR rotation" }),
      });
      const json = await res.json();
      if (json.success) {
        setQrData(json.data);
        fetchTables();
      } else {
        alert("Rotation failed: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error rotating QR");
    } finally {
      setRotatingQr(false);
    }
  };

  // Revoke QR
  const handleRevokeQr = async () => {
    if (!qrModalTable) return;
    const reason = revokeReason.trim() || "Staff manually revoked table QR";
    setRevokingQr(true);
    try {
      const res = await fetch(`/api/v1/restaurant/tables/${qrModalTable.tableId}/qr/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (json.success) {
        setQrData(null);
        fetchTables();
        alert("Table QR successfully revoked.");
      } else {
        alert("Revocation failed: " + (json.error?.message || "Unknown error"));
      }
    } catch {
      alert("Error revoking QR");
    } finally {
      setRevokingQr(false);
    }
  };

  // Sections
  const sections = Array.from(new Set(tables.map((t) => t.section))).filter(Boolean);

  // Filtered tables
  const filtered = tables.filter((t) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        t.tableNumber.toLowerCase().includes(q) ||
        t.displayLabel.toLowerCase().includes(q) ||
        t.section.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filterSection !== "ALL" && t.section !== filterSection) return false;
    if (filterStatus !== "ALL" && t.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-display">
              Table Management
            </h1>
            <Badge className="bg-amber-600 text-white border-0 text-xs">
              Physical Entity Directory
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Configure restaurant tables, physical capacities, sections, server-authorized statuses, and high-entropy QR codes.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTables}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            onClick={() => setCreateModalOpen(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Table
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Table Operations Alert</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filter Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div className="flex-1 max-w-sm">
          <Input
            placeholder="Search by table number, label, section..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterSection}
            onChange={(e) => setFilterSection(e.target.value)}
            className="bg-background border border-border rounded px-3 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">All Sections</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-background border border-border rounded px-3 py-1.5 text-xs text-foreground focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="OCCUPIED">Occupied</option>
            <option value="RESERVED">Reserved</option>
            <option value="CLEANING">Cleaning</option>
            <option value="OUT_OF_SERVICE">Out of Service</option>
          </select>
        </div>
      </div>

      {/* Tables Table View */}
      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-muted-foreground uppercase text-[10px] tracking-wider font-semibold">
                <th className="py-3 px-4">Table</th>
                <th className="py-3 px-4">Display Label</th>
                <th className="py-3 px-4">Section</th>
                <th className="py-3 px-4">Capacity</th>
                <th className="py-3 px-4">Current Status</th>
                <th className="py-3 px-4">Active Dining Session</th>
                <th className="py-3 px-4">QR Token</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    No tables found. Click &quot;Add Table&quot; to create one.
                  </td>
                </tr>
              ) : (
                filtered.map((table) => {
                  const statusBadgeClass =
                    table.status === "AVAILABLE"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                      : table.status === "OCCUPIED"
                      ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300"
                      : table.status === "RESERVED"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                      : table.status === "CLEANING"
                      ? "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300"
                      : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";

                  return (
                    <tr
                      key={table.tableId}
                      className={`hover:bg-muted/40 transition-colors ${
                        !table.isActive ? "opacity-50" : ""
                      }`}
                    >
                      <td className="py-3.5 px-4 font-bold text-foreground font-display text-sm">
                        {table.tableNumber}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-foreground">
                        {table.displayLabel}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground">{table.section}</td>
                      <td className="py-3.5 px-4 font-mono font-medium">
                        {table.capacity} guests
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => {
                            setStatusChangeTable(table);
                            setTargetStatus(table.status);
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase transition-opacity hover:opacity-80 ${statusBadgeClass}`}
                          title="Click to transition status"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {table.status}
                        </button>
                      </td>
                      <td className="py-3.5 px-4">
                        {table.activeSession ? (
                          <div className="space-y-0.5">
                            <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                              {table.activeSession.customerName || "Walk-in Party"} (
                              {table.activeSession.guestCount}p)
                            </span>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {table.activeSession.sessionNumber}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => openQrDialog(table)}
                          className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          {table.hasActiveQr ? "Active QR" : "Generate"}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setEditTable(table);
                              setEditDisplayLabel(table.displayLabel);
                              setEditCapacity(table.capacity);
                              setEditSection(table.section);
                              setEditIsActive(table.isActive);
                            }}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit Table Properties"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>

                          <button
                            onClick={() => handleToggleActive(table)}
                            className={`p-1.5 rounded hover:bg-muted transition-colors ${
                              table.isActive
                                ? "text-emerald-600 hover:text-rose-600"
                                : "text-rose-600 hover:text-emerald-600"
                            }`}
                            title={table.isActive ? "Deactivate Table" : "Activate Table"}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Table */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Restaurant Table</DialogTitle>
            <DialogDescription>
              Create a physical dining table with unique outlet-scoped number and automatic high-entropy QR code.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTable} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Table Number *</label>
                <Input
                  placeholder="e.g. T-09"
                  value={createTableNumber}
                  onChange={(e) => setCreateTableNumber(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Capacity (Seats) *</label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={createCapacity}
                  onChange={(e) => setCreateCapacity(parseInt(e.target.value, 10) || 1)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Display Label</label>
              <Input
                placeholder="e.g. Table 9 (Garden View)"
                value={createDisplayLabel}
                onChange={(e) => setCreateDisplayLabel(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Dining Section</label>
              <Input
                placeholder="e.g. Main Dining, Terrace, Balcony"
                value={createSection}
                onChange={(e) => setCreateSection(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateModalOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                disabled={creating}
              >
                {creating ? "Creating..." : "Create Table"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Edit Table */}
      <Dialog open={!!editTable} onOpenChange={(open) => !open && setEditTable(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Table {editTable?.tableNumber}</DialogTitle>
            <DialogDescription>Modify physical properties and operational availability.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Display Label</label>
              <Input
                value={editDisplayLabel}
                onChange={(e) => setEditDisplayLabel(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Capacity (Seats)</label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(parseInt(e.target.value, 10) || 1)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Section</label>
                <Input
                  value={editSection}
                  onChange={(e) => setEditSection(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="editIsActive"
                checked={editIsActive}
                onChange={(e) => setEditIsActive(e.target.checked)}
                className="rounded border-border text-amber-600 focus:ring-amber-500 h-4 w-4"
              />
              <label htmlFor="editIsActive" className="text-xs font-medium text-foreground">
                Table is Active & In Floor Circulation
              </label>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditTable(null)}
                disabled={savingEdit}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                disabled={savingEdit}
              >
                {savingEdit ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Status Change */}
      <Dialog
        open={!!statusChangeTable}
        onOpenChange={(open) => !open && setStatusChangeTable(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transition Status — Table {statusChangeTable?.tableNumber}</DialogTitle>
            <DialogDescription>
              Current status: <span className="font-semibold uppercase">{statusChangeTable?.status}</span>.
              Select an authorized state machine transition.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmStatusChange} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Target Status *</label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary"
              >
                <option value="AVAILABLE">AVAILABLE (Clean & Ready for seating)</option>
                <option value="OCCUPIED">OCCUPIED (Party seated)</option>
                <option value="RESERVED">RESERVED (Held for reservation)</option>
                <option value="CLEANING">CLEANING (Bussing & sanitize required)</option>
                <option value="OUT_OF_SERVICE">OUT_OF_SERVICE (Maintenance / Taken out)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Operational Reason / Notes</label>
              <Input
                placeholder="e.g. Deep cleaning requested, VIP reservation"
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStatusChangeTable(null)}
                disabled={updatingStatus}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                disabled={updatingStatus}
              >
                {updatingStatus ? "Transitioning..." : "Apply Transition"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: QR Lifecycle Management */}
      <Dialog open={!!qrModalTable} onOpenChange={(open) => !open && setQrModalTable(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Table {qrModalTable?.tableNumber} QR & Context</DialogTitle>
            <DialogDescription>
              Server-scoped QR code linked to this physical restaurant table context.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {loadingQr ? (
              <div className="h-44 w-full flex items-center justify-center border border-dashed rounded-lg">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : qrData ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-center gap-4 p-3 bg-muted/40 rounded-xl border border-border">
                  <div className="p-2.5 bg-white rounded-lg border shadow-xs inline-block">
                    <img
                      src={qrData.qrSvgDataUri}
                      alt="Table QR"
                      className="h-32 w-32 object-contain"
                    />
                  </div>
                  <div className="space-y-1.5 text-xs text-left flex-1">
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        Token Status
                      </span>
                      <p>
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]">
                          {qrData.tokenStatus}
                        </Badge>
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        Public Landing URL
                      </span>
                      <p className="font-mono text-[10px] break-all text-muted-foreground bg-background p-1 rounded border border-border">
                        {qrData.qrUrl}
                      </p>
                    </div>
                    <Link
                      href={qrData.qrUrl}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-[11px] text-amber-600 hover:underline font-semibold"
                    >
                      Open Customer Portal <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>

                {/* QR Lifecycle Actions */}
                <div className="p-3 rounded-lg border border-border space-y-3 bg-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-foreground">Rotate QR Code</p>
                      <p className="text-[11px] text-muted-foreground">
                        Atomically invalidates current QR and issues a fresh opaque token.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRotateQr}
                      disabled={rotatingQr}
                      className="text-xs flex items-center gap-1.5"
                    >
                      <RotateCw className={`h-3.5 w-3.5 ${rotatingQr ? "animate-spin" : ""}`} />
                      Rotate
                    </Button>
                  </div>

                  <div className="pt-2 border-t border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                          Revoke QR Code
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Deactivates this table&apos;s QR code without generating a replacement.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleRevokeQr}
                        disabled={revokingQr}
                        className="text-xs flex items-center gap-1.5"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    </div>
                    <Input
                      placeholder="Required reason for revocation..."
                      value={revokeReason}
                      onChange={(e) => setRevokeReason(e.target.value)}
                      className="text-xs h-8"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                No active QR token found.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQrModalTable(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
