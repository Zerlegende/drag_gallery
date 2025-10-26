"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import * as React from "react";
import { ToastProvider } from "@/components/ui/toast";
import { SidebarProvider } from "@/components/sidebar-context";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient());

  return (
    <SessionProvider refetchInterval={0} refetchOnWindowFocus={true}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <SidebarProvider>{children}</SidebarProvider>
        </ToastProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
