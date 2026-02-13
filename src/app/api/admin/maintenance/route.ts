import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

// GET: Wartungsmodus-Status abrufen
export async function GET() {
  try {
    const result = await query<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'maintenance_mode'",
      []
    );

    const maintenanceMode = result[0]?.value === "true";
    return NextResponse.json({ maintenanceMode });
  } catch (error) {
    console.error("Error fetching maintenance mode:", error);
    // Bei Fehler (z.B. Tabelle existiert nicht) Wartungsmodus als deaktiviert annehmen
    return NextResponse.json({ maintenanceMode: false });
  }
}

// POST: Wartungsmodus aktivieren/deaktivieren (nur für Admins)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    // Nur Admins dürfen Wartungsmodus ändern
    if (!session?.user || (session.user as any).role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { enabled } = body;

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    // Update Wartungsmodus in DB
    await query(
      `INSERT INTO system_settings (key, value, updated_at, updated_by) 
       VALUES ('maintenance_mode', $1, now(), $2)
       ON CONFLICT (key) 
       DO UPDATE SET value = $1, updated_at = now(), updated_by = $2`,
      [enabled.toString(), session.user.id]
    );

    return NextResponse.json({ 
      success: true, 
      maintenanceMode: enabled 
    });
  } catch (error) {
    console.error("Error updating maintenance mode:", error);
    
    // Spezifische Fehlermeldung für fehlende Tabelle
    const errorMessage = (error as any)?.message || "";
    if (errorMessage.includes("system_settings") || errorMessage.includes("does not exist")) {
      return NextResponse.json(
        { error: "Bitte führe zuerst die Datenbank-Migration aus: db/migrations/003_add_system_settings.sql" },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to update maintenance mode" },
      { status: 500 }
    );
  }
}
