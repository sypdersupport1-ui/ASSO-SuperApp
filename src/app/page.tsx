"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, ShieldCheck, Database, Radio, Layers, Server, ExternalLink, Hotel, ArrowRight, DoorOpen, BedDouble } from "lucide-react";

interface HealthData {
  status: "healthy" | "degraded";
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  database: {
    status: "connected" | "disconnected" | "not_configured" | "mock" | "error";
    mode: "live" | "mock" | "unconfigured";
    engine: string;
    latencyMs: number;
    configuredUrl?: string;
    error?: string;
    details?: string;
  };
  realtime: {
    status: string;
    activeClients: number;
    heartbeatIntervalMs: number;
  };
  testDatabase: {
    engine: string;
    scope: string;
    status: string;
  };
  timestamp: string;
}

export default function Home() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [testInput, setTestInput] = useState("");

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/health");
      const json = await res.json();
      if (json.success) {
        setHealth(json.data);
      }
    } catch (err) {
      console.error("Health check failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const isDegraded = health?.status === "degraded" || health?.database.status === "disconnected";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between border-b pb-6 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight font-display text-slate-900 dark:text-white">
                ASSO SuperApp
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                PHASE 5 FOUNDATION
              </Badge>
              <Badge
                variant={isDegraded ? "warning" : "success"}
                className="font-mono text-xs uppercase"
              >
                {health?.status || "CHECKING"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Core Technical Foundation & Operations Verification Dashboard
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading}>
              {loading ? "Checking..." : "Refresh Status"}
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm">System Specs</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>ASSO Platform Foundation Specs</DialogTitle>
                  <DialogDescription>
                    Approved Phase 5 Architectural Baseline & Runtime Matrix
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-3 text-sm">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Framework</span>
                    <span className="font-semibold">Next.js 15 App Router</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Runtime Language</span>
                    <span className="font-semibold">TypeScript 5 (Strict Mode)</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Runtime Database</span>
                    <span className="font-semibold">PostgreSQL via Drizzle ORM</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Test Database</span>
                    <span className="font-semibold">pg-mem (Automated Tests Only)</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Security Model</span>
                    <span className="font-semibold">Transaction RLS + 5-Layer Auth</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Realtime Mechanism</span>
                    <span className="font-semibold">HTTP Server-Sent Events (SSE)</span>
                  </div>
                </div>
                <DialogFooter className="flex justify-between items-center sm:justify-between w-full">
                  <span className="text-xs text-muted-foreground">Zero premature vertical coding</span>
                  <Badge variant="outline">Hotel → Restaurant → Cinema</Badge>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        {/* Truthful Status Alert Banner */}
        {isDegraded ? (
          <Alert variant="warning">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle className="text-base font-semibold">
              Application Running in Degraded Mode
            </AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                The Next.js 15 application server and API routes are healthy, but the configured PostgreSQL database at{" "}
                <code className="bg-amber-100 dark:bg-amber-950 px-1 py-0.5 rounded font-mono text-xs">
                  {health?.database.configuredUrl || "localhost:5432"}
                </code>{" "}
                is <strong>unreachable</strong> (connection refused). No local PostgreSQL daemon is currently running on port 5432.
              </p>
              <p className="text-xs text-muted-foreground">
                <em>Note: Automated schema and RLS tests execute self-contained via in-memory <code>pg-mem</code>. A live PostgreSQL instance (e.g. Supabase or local Postgres) is required for real database persistence.</em>
              </p>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="success">
            <CheckCircle2 className="h-5 w-5" />
            <AlertTitle className="text-base font-semibold">
              Technical Foundation Operational
            </AlertTitle>
            <AlertDescription>
              All core platform capabilities, Supabase PostgreSQL database, and realtime streaming hubs are fully active. Phase 7 Hotel Vertical Slice 1 is live! (Restaurant and Cinema verticals remain strictly paused).
            </AlertDescription>
          </Alert>
        )}

        {/* Phase 7: Hotel Vertical Live Launcher Banner */}
        <Card className="border-primary/40 bg-gradient-to-r from-primary/5 via-card to-primary/5 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Hotel className="h-4 w-4" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">
                    Phase 7 — HOTEL VERTICAL (Slice 1 Active)
                  </h3>
                  <Badge variant="success" className="text-[10px] uppercase font-mono">
                    Production DB Ready
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground max-w-2xl">
                  First business vertical slice established: Hotel Property, Room Types, Rooms, 1:1 Business Context mapping, and Operational Dashboard with PostgreSQL RLS.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Link href="/hotel">
                  <Button className="flex items-center gap-2 shadow-sm">
                    <Hotel className="h-4 w-4" />
                    Hotel Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/hotel/rooms">
                  <Button variant="outline" className="flex items-center gap-2">
                    <DoorOpen className="h-4 w-4" />
                    Room Rack
                  </Button>
                </Link>
                <Link href="/hotel/room-types">
                  <Button variant="outline" className="flex items-center gap-2">
                    <BedDouble className="h-4 w-4" />
                    Room Types
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Foundation Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Core Platform */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Core Platform</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display uppercase">
                {health?.status || "HEALTHY"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Uptime: {health?.uptimeSeconds || 0}s | Env: {health?.environment || "development"}
              </p>
              <div className="mt-3 flex gap-2">
                <Badge variant="outline">App Router</Badge>
                <Badge variant="outline">v{health?.version || "0.1.0"}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Database & RLS (Truthful Dynamic Status) */}
          <Card className={isDegraded ? "border-amber-300 dark:border-amber-800" : ""}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Database & RLS</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold font-display uppercase">
                  {health?.database.status === "connected"
                    ? "CONNECTED"
                    : health?.database.status === "disconnected"
                    ? "DISCONNECTED"
                    : health?.database.status === "mock"
                    ? "MOCK MODE"
                    : "NOT CONFIGURED"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {health?.database.status === "connected"
                  ? `Latency: ${health?.database.latencyMs}ms | RLS Active`
                  : health?.database.status === "disconnected"
                  ? "Configured, but port 5432 refused connection"
                  : health?.database.details || "No database configured"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge
                  variant={
                    health?.database.status === "connected"
                      ? "success"
                      : health?.database.status === "disconnected"
                      ? "destructive"
                      : "warning"
                  }
                >
                  {health?.database.status === "connected"
                    ? "PostgreSQL Live"
                    : health?.database.status === "disconnected"
                    ? "PostgreSQL Offline"
                    : "Mock / Unconfigured"}
                </Badge>
                <Badge variant="outline">Test DB: pg-mem</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Realtime SSE Hub */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Realtime SSE Hub</CardTitle>
              <Radio className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display uppercase">
                {health?.realtime.status || "OPERATIONAL"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Connected Clients: {health?.realtime.activeClients ?? 0} | 15s Heartbeat
              </p>
              <div className="mt-3 flex gap-2">
                <Badge variant="outline">SSE Stream</Badge>
                <Badge variant="outline">Auto-Reconnect</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 5-Layer Security & Design System Showcase */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <CardTitle className="text-lg">5-Layer Security Pipeline</CardTitle>
              </div>
              <CardDescription>
                Server-side authorization enforced independently on every incoming request
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm p-2 rounded bg-slate-100 dark:bg-slate-900">
                <span className="font-medium">1. Authentication</span>
                <Badge variant="secondary">Bearer JWT (RFC 7519)</Badge>
              </div>
              <div className="flex items-center justify-between text-sm p-2 rounded bg-slate-100 dark:bg-slate-900">
                <span className="font-medium">2. Tenant Context</span>
                <Badge variant="secondary">SET LOCAL app.current_tenant_id</Badge>
              </div>
              <div className="flex items-center justify-between text-sm p-2 rounded bg-slate-100 dark:bg-slate-900">
                <span className="font-medium">3. Module Entitlement</span>
                <Badge variant="secondary">Plan / Addon Subscription</Badge>
              </div>
              <div className="flex items-center justify-between text-sm p-2 rounded bg-slate-100 dark:bg-slate-900">
                <span className="font-medium">4. Granular RBAC</span>
                <Badge variant="secondary">Scoped Permissions (e.g. orders.create)</Badge>
              </div>
              <div className="flex items-center justify-between text-sm p-2 rounded bg-slate-100 dark:bg-slate-900">
                <span className="font-medium">5. Business Policy</span>
                <Badge variant="secondary">Financial Thresholds & Approvals</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-indigo-600" />
                <CardTitle className="text-lg">Design System Primitives</CardTitle>
              </div>
              <CardDescription>
                Phase 4 Design tokens, semantic colors, and accessible components
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button size="sm">Primary</Button>
                <Button size="sm" variant="secondary">Secondary</Button>
                <Button size="sm" variant="outline">Outline</Button>
                <Button size="sm" variant="destructive">Destructive</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">Default</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="info">Info</Badge>
                <Badge variant="destructive">Destructive</Badge>
              </div>
              <div>
                <Input
                  placeholder="Interactive input with accessible focus ring..."
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Machine-Readable Endpoints Direct Links */}
        <Card className="bg-slate-100/50 dark:bg-slate-900/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              Machine-Readable Runtime API Probes
            </CardTitle>
            <CardDescription className="text-xs">
              Raw JSON endpoints for monitoring, telemetry, and automated uptime checks:
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            <a
              href="/api/v1/health"
              target="_blank"
              rel="noreferrer"
              className="p-2.5 rounded bg-white dark:bg-slate-950 border hover:border-slate-400 transition-colors flex items-center justify-between"
            >
              <span>GET /api/v1/health</span>
              <Badge variant="outline" className="text-[10px]">JSON</Badge>
            </a>
            <a
              href="/api/v1/realtime"
              target="_blank"
              rel="noreferrer"
              className="p-2.5 rounded bg-white dark:bg-slate-950 border hover:border-slate-400 transition-colors flex items-center justify-between"
            >
              <span>GET /api/v1/realtime</span>
              <Badge variant="outline" className="text-[10px]">SSE</Badge>
            </a>
          </CardContent>
        </Card>

        {/* Footer */}
        <footer className="text-center text-xs text-muted-foreground pt-6 border-t">
          ASSO Platform © 2026. Architected for equal sibling verticals: Hotel → Restaurant → Cinema.
        </footer>
      </div>
    </div>
  );
}
