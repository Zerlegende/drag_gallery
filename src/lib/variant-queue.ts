/**
 * Image Variant Processing Queue
 * Processes images with max 2 concurrent operations to avoid RAM overflow
 */

import { generateImageVariants } from './image-variants';
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

      // Generate variants
      await generateImageVariants(item.key, item.mime);

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
