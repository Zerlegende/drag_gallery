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
 * Parse variant key back to original and size
 * Example: "user/photo@300.avif" -> { originalKey: "user/photo.avif", width: 300 }
 */
export function parseVariantKey(variantKey: string): { originalKey: string; width: number | null } {
  const match = variantKey.match(/^(.+)@(\d+)\.([^.]+)$/);
  if (match) {
    const [, basePath, widthStr, ext] = match;
    return {
      originalKey: `${basePath}.${ext}`,
      width: parseInt(widthStr, 10),
    };
  }
  return { originalKey: variantKey, width: null };
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
