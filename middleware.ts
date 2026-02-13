import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { isMaintenanceMode } from "@/lib/maintenance";

export const runtime = "nodejs";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Wartungsseite und API-Routen für Wartungsmodus immer erlauben
  if (
    pathname === "/maintenance" ||
    pathname === "/api/admin/maintenance" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // Session abrufen
  const session = await auth();

  // Wartungsmodus-Check
  const maintenanceActive = await isMaintenanceMode();
  
  if (maintenanceActive) {
    // Admins dürfen trotz Wartungsmodus auf alles zugreifen
    const isAdmin = session?.user && (session.user as any).role === "admin";
    
    if (!isAdmin) {
      // Normale User und nicht eingeloggte User zur Wartungsseite
      return NextResponse.redirect(new URL("/maintenance", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match alle Pfade außer:
     * - /api/auth (NextAuth)
     * - /_next/static (static files)
     * - /_next/image (image optimization)
     * - /favicon.ico, /manifest.json, etc.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-).*)",
  ],
};
