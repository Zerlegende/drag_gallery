/**
 * Image Variant Processing Queue
 * Processes images with max 2 concurrent operations to avoid RAM overflow
 * 
 * Flow: Original (JPEG/PNG/etc.) → Convert to AVIF → Generate size variants (@300, @800, @1600)
 * All processing happens server-side in the background.
 */

import { createHash } from 'crypto';
import sharp from 'sharp';
import { generateImageVariants } from './image-variants';
import { getObject, putObject, deleteObject } from './storage';
import { query, setImageContentHash } from './db';

type QueueItem = {
  imageId: string;
  key: string;
  mime: string;
};

/**
 * Nach dieser Zeit gilt die Verarbeitung eines Bildes als hängend. Ein
 * blockierter MinIO- oder Sharp-Aufruf würde sonst dauerhaft einen der beiden
 * Slots belegen und die gesamte Queue zum Stillstand bringen.
 */
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

class VariantQueue {
  private queue: QueueItem[] = [];
  private processing = 0;
  private readonly maxConcurrent = 2;
  /** IDs in Queue oder Verarbeitung – verhindert doppeltes Einreihen */
  private known = new Set<string>();

  async add(imageId: string, key: string, mime: string) {
    // Beim Recovery kann dasselbe Bild sonst mehrfach in die Queue geraten
    if (this.known.has(imageId)) return;
    this.known.add(imageId);

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

      // Der Timeout bricht die laufende Arbeit nicht wirklich ab (Sharp und
      // die S3-Requests laufen weiter), gibt aber den Slot frei, damit die
      // restlichen Bilder nicht ewig warten.
      await this.withTimeout(this.processItem(item), PROCESSING_TIMEOUT_MS);

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
      this.known.delete(item.imageId);

      // Process next item in queue
      this.processNext();
    }
  }

  /**
   * Konvertierung und Variantenerzeugung für ein Bild.
   */
  private async processItem(item: QueueItem) {
    let processingKey = item.key;
    let processingMime = item.mime;

    // Step 1: Convert to AVIF if not already AVIF
    if (item.mime !== 'image/avif') {
      processingKey = await this.convertOriginalToAvif(item.key, item.imageId);
      processingMime = 'image/avif';
    } else {
      // Kein Konvertierungsschritt, der das Original ohnehin lädt – deshalb
      // nur dann nachladen, wenn der Hash wirklich noch fehlt.
      await this.backfillContentHash(item.imageId, item.key);
    }

    // Step 2: Generate size variants (@300, @800, @1600) from the (now AVIF) original
    await generateImageVariants(processingKey, processingMime);
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Verarbeitung nach ${Math.round(timeoutMs / 1000)}s abgebrochen`)),
          timeoutMs,
        );
      }),
    ]).finally(() => clearTimeout(timer)) as Promise<T>;
  }

  /**
   * Lädt ein Objekt komplett in einen Buffer.
   */
  private async downloadToBuffer(key: string): Promise<Buffer> {
    const stream = await getObject(key);
    if (!stream) {
      throw new Error(`Failed to fetch original: ${key}`);
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as any) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Content-Hash aus den Originalbytes ableiten und speichern.
   * Der UPDATE greift nur, wenn noch kein Hash gesetzt ist – ein vom Client
   * gelieferter Hash wird also nie überschrieben (beide hashen dieselben Bytes).
   */
  private async storeContentHash(imageId: string, originalBuffer: Buffer) {
    try {
      const hash = createHash('sha256').update(originalBuffer).digest('hex');
      await setImageContentHash(imageId, hash);
    } catch (error) {
      // Nicht kritisch: ohne Hash nimmt das Bild nur nicht an der
      // Duplikaterkennung teil, der Upload selbst bleibt gültig.
      console.error(`Content-Hash konnte nicht gespeichert werden: ${imageId}`, error);
    }
  }

  /**
   * Holt den Hash nach, wenn er fehlt (z.B. Upload ohne crypto.subtle).
   * Lädt das Original nur, wenn wirklich nötig.
   */
  private async backfillContentHash(imageId: string, key: string) {
    try {
      const rows = await query<{ content_hash: string | null }>(
        'SELECT content_hash FROM images WHERE id = $1',
        [imageId]
      );
      if (rows[0]?.content_hash) return;

      const buffer = await this.downloadToBuffer(key);
      if (buffer.length === 0) return;
      await this.storeContentHash(imageId, buffer);
    } catch (error) {
      console.error(`Content-Hash-Backfill fehlgeschlagen: ${imageId}`, error);
    }
  }

  /**
   * Convert original image to AVIF, upload it, update DB key, delete old original.
   * Returns the new AVIF key.
   */
  private async convertOriginalToAvif(originalKey: string, imageId: string): Promise<string> {
    const originalBuffer = await this.downloadToBuffer(originalKey);

    if (originalBuffer.length === 0) {
      throw new Error(`Original image is empty: ${originalKey}`);
    }

    // Hash über die Originalbytes, bevor konvertiert wird – danach sind sie weg
    await this.storeContentHash(imageId, originalBuffer);

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
