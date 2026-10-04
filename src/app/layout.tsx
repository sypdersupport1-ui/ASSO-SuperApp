import type { Metadata } from "next";
import { Inter, Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "ASSO Platform — Unified Hospitality SuperApp",
  description: "Next-generation operational foundation for Hotel, Restaurant, and Cinema verticals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${outfit.variable} ${jetbrainsMono.variable} min-h-screen bg-background font-sans antialiased text-foreground`}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
