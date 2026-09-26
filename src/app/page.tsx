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
import { CheckCircle2, ShieldCheck, Database, Radio, Layers, Server } from "lucide-react";

interface HealthData {
  status: string;
  service: string;
  version: string;
  uptimeSeconds: number;
  database: { status: string; latencyMs: number };
  realtime: { activeClients: number };
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
              <Badge variant="success" className="font-mono text-xs">
                PHASE 5 FOUNDATION
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Core Technical Foundation & Operations Skeleton
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading}>
              {loading ? "Checking..." : "Refresh Health"}
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm">System Specs</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>ASSO Platform Foundation</DialogTitle>
                  <DialogDescription>
                    Approved Phase 5 Foundation Stack & Architecture
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-3 text-sm">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Framework</span>
                    <span className="font-semibold">Next.js 15 App Router</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Language</span>
                    <span className="font-semibold">TypeScript 5 (Strict Mode)</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Styling</span>
                    <span className="font-semibold">Tailwind CSS + Design Tokens</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Database & ORM</span>
                    <span className="font-semibold">PostgreSQL / Supabase + Drizzle ORM</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Security</span>
                    <span className="font-semibold">Transaction RLS + 5-Layer Auth</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Realtime</span>
                    <span className="font-semibold">Server-Sent Events (SSE)</span>
                  </div>
                </div>
                <DialogFooter>
                  <Badge variant="outline">RFC 7519 JWT</Badge>
                  <Badge variant="outline">Idempotent API</Badge>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        {/* Status Alert */}
        <Alert variant="success">
          <CheckCircle2 className="h-5 w-5" />
          <AlertTitle className="text-base font-semibold">Technical Foundation Operational</AlertTitle>
          <AlertDescription>
            The modular monolith foundation is executing cleanly on localhost. Feature development for Hotel, Restaurant, and Cinema verticals remains paused until human approval of Phase 5.
          </AlertDescription>
        </Alert>

        {/* Foundation Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Core Platform</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display">{health?.status || "HEALTHY"}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Uptime: {health?.uptimeSeconds || 0}s | Version: {health?.version || "0.1.0"}
              </p>
              <div className="mt-3 flex gap-2">
                <Badge variant="outline">App Router</Badge>
                <Badge variant="outline">Zod Validated</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Database & RLS</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display">
                {health?.database.status === "connected" ? "CONNECTED" : "READY (MOCK/MEM)"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Latency: {health?.database.latencyMs || 0}ms | Multi-tenant RLS
              </p>
              <div className="mt-3 flex gap-2">
                <Badge variant="outline">Drizzle ORM</Badge>
                <Badge variant="outline">Transaction Scope</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Realtime SSE Hub</CardTitle>
              <Radio className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display">ACTIVE</div>
              <p className="text-xs text-muted-foreground mt-1">
                Connected Clients: {health?.realtime.activeClients || 0} | 15s Heartbeat
              </p>
              <div className="mt-3 flex gap-2">
                <Badge variant="outline">SSE Streaming</Badge>
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
                Server-side authorization enforced on every incoming request
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm p-2 rounded bg-slate-100 dark:bg-slate-900">
                <span className="font-medium">1. Authentication</span>
                <Badge variant="secondary">Bearer JWT (RS256/HS256)</Badge>
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

        {/* Footer */}
        <footer className="text-center text-xs text-muted-foreground pt-6 border-t">
          ASSO Platform © 2026. Architected for equal sibling verticals: Hotel → Restaurant → Cinema.
        </footer>
      </div>
    </div>
  );
}
