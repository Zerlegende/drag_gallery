/**
 * Browser-safe utilities for image variants
 * No sharp dependency - can be used in client components
 */

export const VARIANT_SIZES = {
  grid: 300,
  preview: 800,
  fullscreen: 1600,
} as const;

export type VariantName = keyof typeof VARIANT_SIZES;

/**
 * Generate variant key from original key
 * Example: "user/photo.avif" -> "user/photo@300.avif"
 */
export function getVariantKey(originalKey: string, width: number): string {
  return originalKey.replace(/\.([^.]+)$/, `@${width}.$1`);
}

/**
 * Get the appropriate variant key for a given context
 */
export function getImageVariantKey(
  originalKey: string,
  variant: VariantName | 'original' = 'original'
): string {
  if (variant === 'original') {
    return originalKey;
  }
  
  const width = VARIANT_SIZES[variant];
  return getVariantKey(originalKey, width);
}

/**
 * Build a full image URL from key with optional cache-busting timestamp
 * Centralized utility to avoid duplication across components
 */
export function buildImageUrl(
  baseUrl: string | undefined,
  key: string,
  fallback: string,
  timestamp?: string
): string {
  if (!baseUrl) return fallback;
  const url = `${baseUrl.replace(/\/$/, "")}/${key}`;
  return timestamp ? `${url}?t=${timestamp}` : url;
}
