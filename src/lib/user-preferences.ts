/**
 * Cookie-basierte Nutzereinstellungen
 * Speichert Kachelgröße und Tag-Container-Zustände
 */

export type ImageSize = "small" | "medium" | "large";

export type UserPreferences = {
  imageSize: ImageSize;
  expandedTags: Record<string, boolean>;
};

const COOKIE_NAME = "user-preferences";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 Jahr

/**
 * Liest die Nutzereinstellungen aus dem Cookie
 */
export function getUserPreferences(): Partial<UserPreferences> {
  if (typeof document === "undefined") return {};

  const cookies = document.cookie.split("; ");
  const preferenceCookie = cookies.find((c) => c.startsWith(`${COOKIE_NAME}=`));

  if (!preferenceCookie) return {};

  try {
    const value = preferenceCookie.split("=")[1];
    const decoded = decodeURIComponent(value);
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

/**
 * Speichert die Nutzereinstellungen im Cookie
 */
export function saveUserPreferences(preferences: Partial<UserPreferences>) {
  if (typeof document === "undefined") return;

  const current = getUserPreferences();
  const updated = { ...current, ...preferences };

  const encoded = encodeURIComponent(JSON.stringify(updated));
  document.cookie = `${COOKIE_NAME}=${encoded}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}

/**
 * Speichert die Kachelgröße
 */
export function saveImageSize(size: ImageSize) {
  saveUserPreferences({ imageSize: size });
}

/**
 * Speichert die Tag-Container-Zustände
 */
export function saveExpandedTags(expandedTags: Record<string, boolean>) {
  saveUserPreferences({ expandedTags });
}

/**
 * Lädt die Kachelgröße (mit Fallback)
 */
export function getImageSize(): ImageSize {
  const prefs = getUserPreferences();
  return prefs.imageSize || "small";
}

/**
 * Lädt die Tag-Container-Zustände (mit Fallback für alle Tags)
 */
export function getExpandedTags(allTagIds: string[]): Record<string, boolean> {
  const prefs = getUserPreferences();
  
  // Wenn gespeicherte Zustände vorhanden sind, verwende sie
  if (prefs.expandedTags && Object.keys(prefs.expandedTags).length > 0) {
    // Stelle sicher, dass alle aktuellen Tags einen Zustand haben
    const result: Record<string, boolean> = {};
    for (const tagId of allTagIds) {
      result[tagId] = prefs.expandedTags[tagId] ?? true; // Default: aufgeklappt
    }
    return result;
  }

  // Fallback: Alle Tags aufgeklappt
  return allTagIds.reduce((acc, tagId) => ({ ...acc, [tagId]: true }), {});
}
