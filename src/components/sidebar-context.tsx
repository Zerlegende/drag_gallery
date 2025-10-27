"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { getLeftSidebarCollapsed, getRightSidebarOpen, saveLeftSidebarCollapsed, saveRightSidebarOpen } from "@/lib/user-preferences";

type SidebarContextType = {
  leftSidebarCollapsed: boolean;
  setLeftSidebarCollapsed: (collapsed: boolean) => void;
  rightSidebarOpen: boolean;
  setRightSidebarOpen: (open: boolean) => void;
};

const SidebarContext = createContext<SidebarContextType | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  // Start mit Default-Werten (Server-Rendering)
  const [leftSidebarCollapsed, setLeftSidebarCollapsedState] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpenState] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Nach Hydration: Lade Cookie-Werte
  useEffect(() => {
    setLeftSidebarCollapsedState(getLeftSidebarCollapsed());
    setRightSidebarOpenState(getRightSidebarOpen());
    setIsHydrated(true);
  }, []);

  // Wrapper-Funktionen, die auch in Cookies speichern
  const setLeftSidebarCollapsed = (collapsed: boolean) => {
    setLeftSidebarCollapsedState(collapsed);
    saveLeftSidebarCollapsed(collapsed);
  };

  const setRightSidebarOpen = (open: boolean) => {
    setRightSidebarOpenState(open);
    saveRightSidebarOpen(open);
  };

  return (
    <SidebarContext.Provider
      value={{
        leftSidebarCollapsed,
        setLeftSidebarCollapsed,
        rightSidebarOpen,
        setRightSidebarOpen,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return context;
}
