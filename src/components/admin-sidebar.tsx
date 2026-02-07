"use client";

import { useEffect, useState } from "react";
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
  Heart,
  Upload,
  X,
  Eye,
  EyeOff
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/sidebar-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { getDemoMode, saveDemoMode } from "@/lib/user-preferences";

export function AdminSidebar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const { leftSidebarCollapsed, setLeftSidebarCollapsed } = useSidebar();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const { showToast } = useToast();
  
  // Nur für Admins anzeigen
  const isAdmin = session?.user && (session.user as any).role === 'admin';

  // Load demo mode state on mount
  useEffect(() => {
    if (isAdmin) {
      setDemoMode(getDemoMode());
    }
  }, [isAdmin]);

  const toggleDemoMode = () => {
    const newMode = !demoMode;
    setDemoMode(newMode);
    saveDemoMode(newMode);
    // Reload page to apply demo mode
    window.location.reload();
  };

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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showToast("error", "Bitte wähle eine Bilddatei aus");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast("error", "Bild ist zu groß (max 5MB)");
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await fetch('/api/user/avatar', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload fehlgeschlagen');
      }

      showToast("success", "Profilbild erfolgreich aktualisiert");
      // Reload session to get new avatar
      window.location.reload();
    } catch (error) {
      showToast("error", "Fehler beim Hochladen des Profilbilds");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className={cn(
          "fixed top-3 left-3 z-50 p-2 rounded-lg bg-card border shadow-lg md:hidden",
          mobileMenuOpen && "bg-primary text-primary-foreground"
        )}
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed left-0 top-0 z-40 h-screen border-r bg-card transition-all duration-300",
          // Desktop
          "hidden md:block",
          leftSidebarCollapsed ? "md:w-16" : "md:w-64",
          // Mobile
          "md:translate-x-0",
          mobileMenuOpen ? "block translate-x-0 w-64" : "-translate-x-full w-64"
        )}
      >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex h-14 items-center justify-center border-b px-4">
          {!leftSidebarCollapsed && (
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <ImageIcon className="h-5 w-5" />
              <span>Drag Gallery</span>
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
            const showLabel = mobileMenuOpen || !leftSidebarCollapsed;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  !showLabel && "justify-center"
                )}
                title={!showLabel ? item.label : undefined}
              >
                <item.icon className="h-4 w-4" />
                {showLabel && <span>{item.label}</span>}
              </Link>
            );
          })}

          {/* Demo Mode Toggle - Only for Admins */}
          {isAdmin && (
            <button
              onClick={toggleDemoMode}
              className={cn(
                "w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                demoMode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                !(mobileMenuOpen || !leftSidebarCollapsed) && "justify-center"
              )}
              title={(mobileMenuOpen || !leftSidebarCollapsed) ? undefined : (demoMode ? "Demo-Modus aktiv" : "Demo-Modus")}
            >
              {demoMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {(mobileMenuOpen || !leftSidebarCollapsed) && (
                <span>{demoMode ? "Demo-Modus" : "Live-Modus"}</span>
              )}
            </button>
          )}
        </nav>

        {/* Footer: User Info + Logout */}
        <div className="border-t p-4 space-y-4">
          {/* Avatar und Username - Immer im mobilen Menü anzeigen, nur collapsed auf Desktop ausblenden */}
          {(mobileMenuOpen || !leftSidebarCollapsed) && (
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => setAvatarDialogOpen(true)}
                className="relative w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border-4 border-border hover:border-primary transition-colors cursor-pointer group"
              >
                {(session.user as any).avatar ? (
                  <img 
                    src={`${process.env.NEXT_PUBLIC_MINIO_BASE_URL}/${(session.user as any).avatar}`}
                    alt={session.user.name || 'User'} 
                    className="h-full w-full object-cover group-hover:opacity-75 transition-opacity"
                  />
                ) : (
                  <span className="text-4xl font-semibold text-primary">
                    {session.user.name?.charAt(0).toUpperCase() || 'U'}
                  </span>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
              <div className="text-center w-full">
                <p className="font-medium truncate text-base">{session.user.name}</p>
              </div>
            </div>
          )}
          
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              signOut();
              setMobileMenuOpen(false);
            }}
            className={cn("w-full gap-2", !mobileMenuOpen && leftSidebarCollapsed && "px-2")}
            title={!mobileMenuOpen && leftSidebarCollapsed ? "Logout" : undefined}
          >
            <LogOut className="h-4 w-4" />
            {(mobileMenuOpen || !leftSidebarCollapsed) && <span>Logout</span>}
          </Button>

          {/* Toggle Button - Nur auf Desktop anzeigen */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLeftSidebarCollapsed(!leftSidebarCollapsed)}
            className={cn("w-full gap-2 hidden md:flex", leftSidebarCollapsed && "px-2")}
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

    {/* Avatar Dialog */}
    <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Profilbild</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAvatarDialogOpen(false)}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col items-center gap-4 py-4">
          {/* Großes Profilbild */}
          <div className="relative w-64 h-64 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border-4 border-border">
            {(session.user as any).avatar ? (
              <img 
                src={`${process.env.NEXT_PUBLIC_MINIO_BASE_URL}/${(session.user as any).avatar}`}
                alt={session.user.name || 'User'} 
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-8xl font-semibold text-primary">
                {session.user.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            )}
          </div>

          {/* Upload Button */}
          <div className="w-full">
            <input
              type="file"
              id="avatar-upload"
              accept="image/*"
              onChange={handleAvatarUpload}
              disabled={isUploading}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('avatar-upload')?.click()}
              disabled={isUploading}
              className="w-full gap-2"
            >
              <Upload className="h-4 w-4" />
              {isUploading ? "Wird hochgeladen..." : "Neues Bild hochladen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
