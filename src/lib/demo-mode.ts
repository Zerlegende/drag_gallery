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
  // Use a placeholder service with different colors for variety
  const colors = [
    '6366f1', // indigo
    '8b5cf6', // violet  
    'ec4899', // pink
    'f59e0b', // amber
    '10b981', // emerald
    '3b82f6', // blue
    'ef4444', // red
    '14b8a6', // teal
  ];
  const color = colors[index % colors.length];
  return `https://dummyimage.com/800x600/${color}/ffffff&text=Demo+Bild+${index + 1}`;
}
