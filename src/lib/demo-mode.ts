/**
 * Demo Mode utilities for censoring sensitive data
 */

import type { ImageWithTags, TagRecord } from './db';

/**
 * Anonymize image data for demo mode
 */
export function anonymizeImage(image: ImageWithTags, index: number): ImageWithTags {
  return {
    ...image,
    filename: `Bild_${String(index + 1).padStart(3, '0')}.avif`,
    imagename: `Demo Bild ${index + 1}`,
    tags: image.tags.map((tag, i) => ({
      ...tag,
      name: `Tag_${i + 1}`,
    })),
  };
}

/**
 * Anonymize tag data for demo mode
 */
export function anonymizeTag(tag: TagRecord, index: number): TagRecord {
  return {
    ...tag,
    name: `Tag_${String(index + 1).padStart(2, '0')}`,
  };
}

/**
 * Get placeholder image URL for demo mode
 */
export function getDemoImageUrl(index: number): string {
  // Use picsum.photos for random placeholder images
  // Adding a seed parameter to get consistent but different images
  return `https://picsum.photos/seed/${index + 1}/800/600`;
}
