"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  DoorOpen,
  BedDouble,
  Users,
  CalendarDays,
  KeyRound,
  Settings,
  ArrowLeft,
  Menu,
  X,
  Hotel,
  ConciergeBell,
  Sparkles,
  Wrench,
  UtensilsCrossed,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface HotelNavProps {
  propertyName?: string;
  propertyCode?: string;
}

export function HotelNav({ propertyName = "ASSO Grand Hotel", propertyCode = "AGH-BLR" }: HotelNavProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: "Front Desk", href: "/hotel/front-office", icon: ConciergeBell },
    { label: "Dashboard", href: "/hotel", icon: LayoutDashboard },
    { label: "Room Service", href: "/hotel/room-service", icon: UtensilsCrossed },
    { label: "Rooms & Rack", href: "/hotel/rooms", icon: DoorOpen },
    { label: "Room Types", href: "/hotel/room-types", icon: BedDouble },
    { label: "Guests", href: "/hotel/guests", icon: Users },
    { label: "Reservations", href: "/hotel/reservations", icon: CalendarDays },
    { label: "Stays", href: "/hotel/stays", icon: KeyRound },
    { label: "Housekeeping", href: "/hotel/housekeeping", icon: Sparkles },
    { label: "Maintenance", href: "/hotel/maintenance", icon: Wrench },
    { label: "Settings", href: "/hotel/settings", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand & Property Context */}
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors pr-2 border-r border-border"
            title="Return to ASSO SuperApp Foundation"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Platform</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Hotel className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-foreground text-sm sm:text-base">
                  {propertyName}
                </span>
                <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0 border-primary/30 text-primary">
                  {propertyCode}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                ASSO Hotel Vertical • First Production Slice
              </p>
            </div>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/hotel"
                ? pathname === "/hotel"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs xl:text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/hotel/guest/room-service"
            target="_blank"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border border-accent/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors whitespace-nowrap ml-1"
            title="Open Customer QR Digital Dining Experience"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Customer QR View</span>
          </Link>
          <Link
            href="/restaurant"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border border-border bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors whitespace-nowrap ml-1"
            title="Switch to Restaurant Operations Workspace"
          >
            <UtensilsCrossed className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span>Restaurant</span>
          </Link>
        </nav>

        {/* Status indicator & Mobile Toggle */}
        <div className="flex items-center gap-3">
          <Badge variant="success" className="hidden sm:flex items-center gap-1.5 text-xs py-1 font-mono">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Supabase Live DB
          </Badge>

          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden min-h-[44px] min-w-[44px] p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-border bg-card px-4 pt-2 pb-4 space-y-1 shadow-lg max-h-[80vh] overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/hotel"
                ? pathname === "/hotel"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors min-h-[44px] ${
                  isActive
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/hotel/guest/room-service"
            target="_blank"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 min-h-[44px]"
          >
            <Sparkles className="h-5 w-5 text-amber-500 shrink-0" />
            <span>Customer QR Digital Dining</span>
          </Link>
          <Link
            href="/restaurant"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium border border-border bg-amber-500/10 text-amber-700 dark:text-amber-400 min-h-[44px]"
          >
            <UtensilsCrossed className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Switch to Restaurant Workspace</span>
          </Link>
        </div>
      )}
    </header>
  );
}
