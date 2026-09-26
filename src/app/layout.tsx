import type { Metadata } from "next";
import "./globals.css";

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
      <body className="min-h-screen bg-background font-sans antialiased text-foreground">
        {children}
      </body>
    </html>
  );
}
