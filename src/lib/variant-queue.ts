/**
 * Image Variant Processing Queue
 * Processes images with max 2 concurrent operations to avoid RAM overflow
 * 
 * Flow: Original (JPEG/PNG/etc.) → Convert to AVIF → Generate size variants (@300, @800, @1600)
 * All processing happens server-side in the background.
 */

import sharp from 'sharp';
import { generateImageVariants } from './image-variants';
import { getObject, putObject, deleteObject } from './storage';
import { query } from './db';

type QueueItem = {
  imageId: string;
  key: string;
  mime: string;
};

class VariantQueue {
  private queue: QueueItem[] = [];
  private processing = 0;
  private readonly maxConcurrent = 2;

  async add(imageId: string, key: string, mime: string) {
    const item: QueueItem = { imageId, key, mime };
    this.queue.push(item);
    
    // Start processing if below concurrency limit
    this.processNext();
  }

  private async processNext() {
    // Check if we can process more
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.processing++;

    try {
      // Update status to processing
      await query(
        'UPDATE images SET variant_status = $1 WHERE id = $2',
        ['processing', item.imageId]
      );

      let processingKey = item.key;
      let processingMime = item.mime;

      // Step 1: Convert to AVIF if not already AVIF
      if (item.mime !== 'image/avif') {
        processingKey = await this.convertOriginalToAvif(item.key, item.imageId);
        processingMime = 'image/avif';
      }

      // Step 2: Generate size variants (@300, @800, @1600) from the (now AVIF) original
      await generateImageVariants(processingKey, processingMime);

      // Update status to completed
      await query(
        'UPDATE images SET variant_status = $1 WHERE id = $2',
        ['completed', item.imageId]
      );
    } catch (error) {
      console.error(`Processing failed: ${item.imageId}`, error);
      
      // Update status to failed
      await query(
        'UPDATE images SET variant_status = $1 WHERE id = $2',
        ['failed', item.imageId]
      ).catch(err => console.error('Failed to update error status:', err));
    } finally {
      this.processing--;
      
      // Process next item in queue
      this.processNext();
    }
  }

  /**
   * Convert original image to AVIF, upload it, update DB key, delete old original.
   * Returns the new AVIF key.
   */
  private async convertOriginalToAvif(originalKey: string, imageId: string): Promise<string> {
    // Download original from MinIO
    const stream = await getObject(originalKey);
    if (!stream) {
      throw new Error(`Failed to fetch original: ${originalKey}`);
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as any) {
      chunks.push(chunk);
    }
    const originalBuffer = Buffer.concat(chunks);

    if (originalBuffer.length === 0) {
      throw new Error(`Original image is empty: ${originalKey}`);
    }

    // Convert to AVIF
    const avifBuffer = await sharp(originalBuffer)
      .avif({ quality: 80, effort: 4 })
      .toBuffer();

    // New key with .avif extension
    const avifKey = originalKey.replace(/\.[^/.]+$/, '.avif');

    // Upload AVIF version
    await putObject(avifKey, avifBuffer, 'image/avif');

    // Update DB: new key, mime, size, and filename
    const avifFilename = originalKey.split('/').pop()?.replace(/\.[^/.]+$/, '.avif') || 'image.avif';
    await query(
      `UPDATE images SET key = $1, mime = 'image/avif', size = $2, filename = $3 WHERE id = $4`,
      [avifKey, avifBuffer.length, avifFilename, imageId]
    );

    // Delete old original (only if key changed)
    if (avifKey !== originalKey) {
      try {
        await deleteObject(originalKey);
      } catch {
        // Non-critical: old file stays, no problem
      }
    }

    return avifKey;
  }

  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

// Singleton instance
export const variantQueue = new VariantQueue();
