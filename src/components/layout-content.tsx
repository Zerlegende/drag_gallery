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
        // Desktop: Padding für linke Sidebar (immer da)
        hasSession && leftSidebarCollapsed && "md:pl-16",
        hasSession && !leftSidebarCollapsed && "md:pl-64",
        // Desktop: Padding für rechte Sidebar (immer da - entweder 16px collapsed oder 80 open)
        hasSession && !rightSidebarOpen && "md:pr-16",
        hasSession && rightSidebarOpen && "md:pr-80"
      )}
    >
      <main className="flex-1 w-full px-2 md:px-4 lg:px-6">{children}</main>
      <footer className="border-t border-border bg-card/30 py-4 text-center text-xs md:text-sm text-muted-foreground mt-auto">
        © {new Date().getFullYear()} {env.client.NEXT_PUBLIC_APP_NAME}
      </footer>
    </div>
  );
}
