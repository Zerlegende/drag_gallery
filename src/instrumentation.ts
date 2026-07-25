/**
 * Wird von Next.js einmal beim Start des Serverprozesses aufgerufen.
 */
export async function register() {
  // Nur in der Node-Runtime – im Edge-Runtime gibt es weder pg noch sharp
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { recoverStuckImages } = await import("@/lib/variant-recovery");
    await recoverStuckImages();
  } catch (error) {
    // Ein fehlgeschlagenes Recovery darf den Serverstart nicht verhindern
    // (z.B. wenn die Datenbank beim Start noch nicht erreichbar ist).
    console.error("[Recovery] Wiederherstellung fehlgeschlagen:", error);
  }
}
