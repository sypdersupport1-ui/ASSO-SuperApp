"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { HotelNav } from "@/components/hotel/hotel-nav";
import { FolioWorkspace } from "@/components/hotel/folio-workspace";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2 } from "lucide-react";

export default function HotelFolioPage() {
  const params = useParams();
  const router = useRouter();
  const stayId = params?.stayId as string;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans pb-16 flex flex-col">
      {/* Global Hotel Top Navigation */}
      <HotelNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6 flex-1 w-full">
        {/* Back Link */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="text-muted-foreground hover:text-foreground -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Front Office / Stays
          </Button>

          <div className="flex items-center gap-2">
            <Link href="/hotel/front-office">
              <Button size="sm" variant="outline">
                Front Desk
              </Button>
            </Link>
            <Link href="/hotel/room-service">
              <Button size="sm" variant="outline">
                Kitchen Console
              </Button>
            </Link>
          </div>
        </div>

        {/* Embedded Folio Workspace */}
        {stayId ? (
          <FolioWorkspace stayId={stayId} />
        ) : (
          <div className="p-8 text-center text-muted-foreground">Invalid stay identifier.</div>
        )}
      </main>
    </div>
  );
}
