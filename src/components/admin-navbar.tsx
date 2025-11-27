"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  ImageIcon, 
  Users, 
  Settings, 
  LogOut 
} from "lucide-react";

export function AdminNavbar() {
  const { data: session } = useSession();
  
  // Nur für Admins anzeigen
  const isAdmin = session?.user && (session.user as any).role === 'admin';

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-center">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <ImageIcon className="h-5 w-5" />
            <span>BZ Bilder</span>
          </Link>
          
          {isAdmin && (
            <div className="hidden md:flex items-center gap-4 text-sm">
              <Link 
                href="/" 
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              
              <Link 
                href="/admin/users" 
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Users className="h-4 w-4" />
                Users
              </Link>
              
              <Link 
                href="/admin/settings" 
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </div>
          )}
        </div>

        {session?.user && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {session.user.name}
              {isAdmin && (
                <span className="ml-2 text-xs bg-primary/10 px-2 py-0.5 rounded">admin</span>
              )}
            </span>
            
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => signOut()}
              className="gap-2"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}
