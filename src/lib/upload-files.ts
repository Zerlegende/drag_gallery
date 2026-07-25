/**
 * Gemeinsame Helfer für den Upload-Pfad (Client-seitig).
 *
 * Wird von der Upload-Queue, der Dropzone und den Drag&Drop-Handlern benutzt,
 * damit überall dieselben Regeln gelten, welche Dateien akzeptiert werden.
 */

export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "image/avif",
];

/**
 * Viele Browser liefern für HEIC/HEIF einen leeren file.type. Ohne diesen
 * Fallback verschwinden iPhone-Fotos kommentarlos aus der Auswahl.
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
  avif: "image/avif",
};

export function getFileExtension(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

/**
 * Liefert den MIME-Type, mit dem die Datei hochgeladen werden soll –
 * notfalls aus der Dateiendung abgeleitet. null = nicht unterstützt.
 */
export function resolveMimeType(file: File): string | null {
  if (ACCEPTED_MIME_TYPES.includes(file.type)) return file.type;
  return EXTENSION_TO_MIME[getFileExtension(file.name)] ?? null;
}

export function isAcceptedFile(file: File): boolean {
  return resolveMimeType(file) !== null;
}

/**
 * Prüft beim Drag-Over, ob überhaupt Bilddateien dabei sind. Dateinamen sind
 * zu diesem Zeitpunkt nicht verfügbar, nur der (evtl. leere) Typ – ein leerer
 * Typ wird deshalb durchgelassen.
 */
export function dragHasImageFiles(items: DataTransferItemList | undefined): boolean {
  return Array.from(items ?? []).some(
    item => item.kind === "file" && (item.type === "" || ACCEPTED_MIME_TYPES.includes(item.type)),
  );
}

/** Ob im aktuellen Kontext Content-Hashes berechnet werden können */
export function canHashFiles(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.subtle?.digest === "function";
}

/**
 * SHA-256 über den kompletten Dateiinhalt, hex-kodiert.
 *
 * Das ist die Grundlage der Duplikaterkennung: identischer Inhalt ergibt
 * denselben Hash, egal wie die Datei heißt. crypto.subtle gibt es nur in
 * sicheren Kontexten (HTTPS oder localhost) – sonst null.
 */
export async function hashFile(file: File): Promise<string | null> {
  if (!canHashFiles()) return null;
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}
