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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-16">
      {/* Global Hotel Top Navigation */}
      <HotelNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {/* Back Link */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 -ml-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Front Office / Stays
          </Button>

          <div className="flex items-center gap-2">
            <Link href="/hotel/front-office">
              <Button size="sm" variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-900">
                Front Desk
              </Button>
            </Link>
            <Link href="/hotel/room-service">
              <Button size="sm" variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-900">
                Kitchen Console
              </Button>
            </Link>
          </div>
        </div>

        {/* Embedded Folio Workspace */}
        {stayId ? (
          <FolioWorkspace stayId={stayId} />
        ) : (
          <div className="p-8 text-center text-zinc-500">Invalid stay identifier.</div>
        )}
      </main>
    </div>
  );
}
