"use client";

import { useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  ImageIcon, 
  Users, 
  Settings, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  Heart
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/sidebar-context";

export function AdminSidebar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const { leftSidebarCollapsed, setLeftSidebarCollapsed } = useSidebar();
  
  // Nur für Admins anzeigen
  const isAdmin = session?.user && (session.user as any).role === 'admin';

  // Während des Ladens nichts anzeigen
  if (status === "loading") {
    return null;
  }

  if (!session?.user) {
    return null;
  }

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/liked", icon: Heart, label: "Gelikte Bilder" },
    ...(isAdmin ? [
      { href: "/admin/users", icon: Users, label: "User Management" },
    ] : []),
    { href: "/admin/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 z-40 h-screen border-r bg-card transition-all duration-300",
        leftSidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          {!leftSidebarCollapsed && (
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <ImageIcon className="h-5 w-5" />
              <span>BZ Bilder</span>
            </Link>
          )}
          {leftSidebarCollapsed && (
            <ImageIcon className="h-5 w-5 mx-auto" />
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  leftSidebarCollapsed && "justify-center"
                )}
                title={leftSidebarCollapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4" />
                {!leftSidebarCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer: User Info + Logout */}
        <div className="border-t p-4 space-y-4">
          {!leftSidebarCollapsed && (
            <div className="flex flex-col items-center gap-3">
              <div className="relative w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border-4 border-border">
                {(session.user as any).avatar ? (
                  <img 
                    src={`${process.env.NEXT_PUBLIC_MINIO_BASE_URL}/${(session.user as any).avatar}`}
                    alt={session.user.name || 'User'} 
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-4xl font-semibold text-primary">
                    {session.user.name?.charAt(0).toUpperCase() || 'U'}
                  </span>
                )}
              </div>
              <div className="text-center w-full">
                <p className="font-medium truncate text-base">{session.user.name}</p>
              </div>
            </div>
          )}
          
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => signOut()}
            className={cn("w-full gap-2", leftSidebarCollapsed && "px-2")}
            title={leftSidebarCollapsed ? "Logout" : undefined}
          >
            <LogOut className="h-4 w-4" />
            {!leftSidebarCollapsed && <span>Logout</span>}
          </Button>

          {/* Toggle Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
            className={cn("w-full gap-2", leftSidebarCollapsed && "px-2")}
            title={leftSidebarCollapsed ? "Sidebar ausfahren" : "Sidebar einklappen"}
          >
            {leftSidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Einklappen</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
