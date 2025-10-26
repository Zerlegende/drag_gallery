import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import React from "react";

import "@/styles/globals.css";
import { AppProviders } from "@/app/providers";
import { env } from "@/lib/env";

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
          <div className="flex min-h-screen flex-col bg-background">
            <header className="border-b border-border bg-card/50 backdrop-blur">
              <div className="container flex h-16 items-center justify-between">
                <span className="text-lg font-semibold tracking-tight">
                  {env.client.NEXT_PUBLIC_APP_NAME}
                </span>
              </div>
            </header>
            <main className="flex-1">{children}</main>
            <footer className="border-t border-border bg-card/30 py-4 text-center text-sm text-muted-foreground">
              © {new Date().getFullYear()} {env.client.NEXT_PUBLIC_APP_NAME}
            </footer>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
