import React from "react";
import { RestaurantNav } from "@/components/restaurant/restaurant-nav";

export const metadata = {
  title: "Restaurant Operations — ASSO SuperApp",
  description: "Restaurant floor plan, table management, live dining sessions, and QR operations.",
};

export default function RestaurantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <RestaurantNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
