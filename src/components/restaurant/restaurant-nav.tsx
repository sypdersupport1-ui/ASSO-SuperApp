"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  UtensilsCrossed,
  LayoutDashboard,
  Grid3X3,
  BookOpen,
  ShoppingBag,
  MonitorPlay,
  CreditCard,
  Receipt,
  Users2,
  BarChart3,
  Package,
  Settings,
  ArrowLeft,
  Menu,
  X,
  Radio,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface RestaurantNavProps {
  outletName?: string;
  outletCode?: string;
}

export function RestaurantNav({
  outletName = "The Royal Saffron Restaurant",
  outletCode = "REST_MAIN",
}: RestaurantNavProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [realtimeActive, setRealtimeActive] = useState(true);

  const activeNavItems = [
    { label: "Dashboard", href: "/restaurant", icon: LayoutDashboard },
    { label: "Tables & Floor", href: "/restaurant/tables", icon: Grid3X3 },
    { label: "Digital Menu", href: "/restaurant/menu", icon: BookOpen },
  ];

  const upcomingModules = [
    { label: "Orders", slice: "R3", icon: ShoppingBag },
    { label: "Kitchen KDS", slice: "R4", icon: MonitorPlay },
    { label: "POS", slice: "R5", icon: CreditCard },
    { label: "Billing", slice: "R6", icon: Receipt },
    { label: "Staff", slice: "R1 Cap", icon: Users2 },
    { label: "Analytics", slice: "R8", icon: BarChart3 },
    { label: "Inventory", slice: "Shared", icon: Package },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand & Outlet Context */}
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors pr-2 border-r border-border"
            title="Return to ASSO SuperApp Foundation"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Platform</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-600 text-white shadow-sm ring-2 ring-amber-500/20">
              <UtensilsCrossed className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-foreground text-sm sm:text-base">
                  {outletName}
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase font-mono px-1.5 py-0 border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/5"
                >
                  {outletCode}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                ASSO Restaurant Vertical • Slice 1 Foundation & Table Operations
              </p>
            </div>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1.5">
          {activeNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/restaurant"
                ? pathname === "/restaurant"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs xl:text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-amber-600 text-white shadow-sm font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          <div className="h-4 w-px bg-border mx-1" />

          {/* Planned Future Modules Architecture Badges */}
          <div className="flex items-center gap-1">
            {upcomingModules.slice(0, 4).map((m) => (
              <span
                key={m.label}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground/60 rounded bg-muted/40 cursor-not-allowed select-none"
                title={`${m.label} module planned for ${m.slice}`}
              >
                <m.icon className="h-3 w-3 opacity-60" />
                {m.label}
                <span className="text-[9px] font-mono px-1 py-0 rounded bg-muted text-muted-foreground/80">
                  {m.slice}
                </span>
              </span>
            ))}
          </div>
        </nav>

        {/* Realtime Live Indicator & Mobile Hamburger */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Realtime Live
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-border bg-card px-4 pt-3 pb-6 space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground px-2 pb-1 uppercase tracking-wider">
              Active Restaurant Operations
            </p>
            {activeNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/restaurant"
                  ? pathname === "/restaurant"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-amber-600 text-white font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-xs font-semibold text-muted-foreground px-2 uppercase tracking-wider">
              Upcoming Capabilities Architecture
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {upcomingModules.map((m) => (
                <div
                  key={m.label}
                  className="flex items-center justify-between px-2.5 py-1.5 text-xs text-muted-foreground/60 rounded bg-muted/30 select-none"
                >
                  <span className="flex items-center gap-1.5">
                    <m.icon className="h-3.5 w-3.5 opacity-60" />
                    {m.label}
                  </span>
                  <span className="text-[9px] font-mono px-1 rounded bg-muted">
                    {m.slice}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
