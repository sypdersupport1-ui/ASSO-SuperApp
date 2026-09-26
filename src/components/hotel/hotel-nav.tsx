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
  Settings,
  ArrowLeft,
  Menu,
  X,
  Hotel,
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
    { label: "Dashboard", href: "/hotel", icon: LayoutDashboard },
    { label: "Rooms & Rack", href: "/hotel/rooms", icon: DoorOpen },
    { label: "Room Types", href: "/hotel/room-types", icon: BedDouble },
    { label: "Guests", href: "/hotel/guests", icon: Users },
    { label: "Reservations", href: "/hotel/reservations", icon: CalendarDays },
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
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Status indicator & Mobile Toggle */}
        <div className="flex items-center gap-3">
          <Badge variant="success" className="hidden sm:flex items-center gap-1.5 text-xs py-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Hotel Live DB (Supabase)
          </Badge>

          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-card px-4 pt-2 pb-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
