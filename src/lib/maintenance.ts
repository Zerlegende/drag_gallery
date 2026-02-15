import { query } from "@/lib/db";

// Helper-Funktion um Wartungsmodus-Status zu prüfen
export async function isMaintenanceMode(): Promise<boolean> {
  try {
    const result = await query<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'maintenance_mode'",
      []
    );
    return result[0]?.value === "true";
  } catch (error) {
    // Bei Fehler (z.B. Tabelle existiert nicht) nicht blockieren
    console.error("Error checking maintenance mode:", error);
    return false;
  }
}
