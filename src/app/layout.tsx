import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import React from "react";

import "@/styles/globals.css";
import { AppProviders } from "@/app/providers";
import { env } from "@/lib/env";
import { AdminSidebar } from "@/components/admin-sidebar";
import { LayoutContent } from "@/components/layout-content";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: env.client.NEXT_PUBLIC_APP_NAME,
  description: "Installierbare PWA zur Verwaltung von Bildern.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={inter.className}>
        <AppProviders>
          <div className="flex min-h-screen bg-background">
            <AdminSidebar />
            <LayoutContent>{children}</LayoutContent>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
