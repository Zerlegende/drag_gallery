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
export function getDemoImageUrl(index: number | string, width: number = 800, height: number = 600): string {
  // Use picsum.photos for random placeholder images
  // Adding a seed parameter to get consistent but different images
  // Convert string IDs to a deterministic number for consistent images
  const seed = typeof index === 'string' 
    ? Math.abs(index.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0))
    : index + 1;
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

/**
 * Generate random analytics data for demo mode
 */
export function generateDemoAnalytics() {
  const userCount = 5 + Math.floor(Math.random() * 10); // 5-15 users
  const imageCount = 50 + Math.floor(Math.random() * 100); // 50-150 images
  const likeCount = 100 + Math.floor(Math.random() * 300); // 100-400 likes

  const usernames = [
    'Max', 'Anna', 'Felix', 'Lisa', 'Tom', 'Sarah', 'Leon', 'Emma',
    'Noah', 'Mia', 'Paul', 'Hannah', 'Luca', 'Sophie', 'Jonas'
  ];

  // Generate upload stats
  const uploadStats = Array.from({ length: userCount }, (_, i) => ({
    id: `demo-user-${i}`,
    username: usernames[i % usernames.length] + (i >= usernames.length ? i : ''),
    avatar: null,
    uploadCount: Math.floor(Math.random() * 30) + 1,
    totalSize: (Math.random() * 500 + 50) * 1024 * 1024, // 50-550 MB
    lastUpload: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(), // Last 30 days
  })).sort((a, b) => b.uploadCount - a.uploadCount);

  // Generate like stats
  const likeStats = uploadStats.map((u) => ({
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    likesGiven: Math.floor(Math.random() * 50),
    likesReceived: Math.floor(Math.random() * 80),
  })).sort((a, b) => b.likesGiven - a.likesGiven);

  // Generate recent likes
  const recentLikes = Array.from({ length: 50 }, (_, i) => {
    const userIndex = Math.floor(Math.random() * userCount);
    const imageIndex = Math.floor(Math.random() * imageCount);
    return {
      id: `demo-like-${i}`,
      userId: `demo-user-${userIndex}`,
      username: uploadStats[userIndex].username,
      userAvatar: null,
      imageId: `demo-image-${imageIndex}`,
      imageName: `Demo Bild ${imageIndex + 1}`,
      imageKey: `demo-${imageIndex}.avif`,
      likedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(), // Last 7 days
    };
  }).sort((a, b) => new Date(b.likedAt).getTime() - new Date(a.likedAt).getTime());

  // Generate top liked images
  const topLikedImages = Array.from({ length: 20 }, (_, i) => {
    const uploaderIndex = Math.floor(Math.random() * userCount);
    return {
      id: `demo-image-${i}`,
      imageName: `Demo Bild ${i + 1}`,
      imageKey: `demo-${i}.avif`,
      likeCount: Math.floor(Math.random() * 50) + 10, // 10-60 likes
      uploadedBy: `demo-user-${uploaderIndex}`,
      uploaderName: uploadStats[uploaderIndex].username,
    };
  }).sort((a, b) => b.likeCount - a.likeCount);

  return {
    uploadStats,
    likeStats,
    recentLikes,
    topLikedImages,
    totalImages: imageCount,
    totalLikes: likeCount,
    totalUsers: userCount,
    totalSize: uploadStats.reduce((sum, u) => sum + u.totalSize, 0),
  };
}
