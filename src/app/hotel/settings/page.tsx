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
import { Building2, Plus, RefreshCw, ShieldCheck, Globe, CheckCircle2, AlertTriangle } from "lucide-react";

interface PropertyItem {
  outletId: string;
  name: string;
  code: string;
  verticalType: string;
  timezone: string;
  currency: string;
  isActive: boolean;
  createdAt: string;
}

export default function HotelSettingsPage() {
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [currency, setCurrency] = useState("INR");
  const [submitting, setSubmitting] = useState(false);

  const fetchProperties = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/hotel/properties");
      const json = await res.json();
      if (json.success) {
        setProperties(json.data);
      } else {
        setError(json.error?.message || "Failed to load hotel properties.");
      }
    } catch (err) {
      setError("Network error fetching properties.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/hotel/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          timezone,
          currency,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setDialogOpen(false);
        setName("");
        setCode("");
        await fetchProperties();
      } else {
        alert("Failed to create property: " + json.error?.message);
      }
    } catch (err) {
      alert("Error submitting property");
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
                Hotel Properties & Settings
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                Multi-Tenant Ready
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Manage hotel properties and outlets under your organization tenant context.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchProperties}
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
                  Add Property
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>Add Hotel Property</DialogTitle>
                    <DialogDescription>
                      Create a new hotel property/outlet within this organization.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Property Name *</label>
                      <Input
                        placeholder="e.g. ASSO Heritage Palace"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-foreground">Property Code *</label>
                      <Input
                        placeholder="e.g. AHP-DEL"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">Timezone</label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          value={timezone}
                          onChange={(e) => setTimezone(e.target.value)}
                        >
                          <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                          <option value="UTC">UTC</option>
                          <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                          <option value="Europe/London">Europe/London (GMT)</option>
                          <option value="America/New_York">America/New_York (EST)</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-foreground">Currency</label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          value={currency}
                          onChange={(e) => setCurrency(e.target.value)}
                        >
                          <option value="INR">INR (₹)</option>
                          <option value="USD">USD ($)</option>
                          <option value="AED">AED (د.إ)</option>
                          <option value="EUR">EUR (€)</option>
                          <option value="GBP">GBP (£)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting || !name || !code}>
                      {submitting ? "Saving..." : "Create Property"}
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

        {/* Properties Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {properties.map((prop) => (
            <Card key={prop.outletId} className="border-border">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{prop.name}</CardTitle>
                      <CardDescription className="font-mono text-xs">
                        Code: {prop.code} • ID: {prop.outletId.slice(0, 8)}...
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="success" className="text-xs">Active</Badge>
                </div>
              </CardHeader>
              <CardContent className="border-t border-border/60 pt-4 space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Vertical Domain:</span>
                  <Badge variant="outline" className="font-semibold text-primary">{prop.verticalType}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Operating Timezone:</span>
                  <span className="font-medium text-foreground">{prop.timezone}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Default Currency:</span>
                  <span className="font-medium text-foreground">{prop.currency}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
