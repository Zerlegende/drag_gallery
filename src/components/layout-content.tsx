"use client";

import { useSession } from "next-auth/react";
import { env } from "@/lib/env";
import { useSidebar } from "@/components/sidebar-context";
import { cn } from "@/lib/utils";

export function LayoutContent({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const { leftSidebarCollapsed, rightSidebarOpen } = useSidebar();
  
  // Während des Ladens kein Margin (Login-Screen-Style)
  const hasSession = status !== "loading" && !!session?.user;

  return (
    <div 
      className={cn(
        "flex flex-col w-full min-h-screen transition-all duration-300",
        hasSession && (leftSidebarCollapsed ? "pl-16" : "pl-64"),
        hasSession && (rightSidebarOpen ? "pr-80" : "pr-16")
      )}
    >
      <main className="flex-1 w-full">{children}</main>
      <footer className="border-t border-border bg-card/30 py-4 text-center text-sm text-muted-foreground mt-auto">
        © {new Date().getFullYear()} {env.client.NEXT_PUBLIC_APP_NAME}
      </footer>
    </div>
  );
}
