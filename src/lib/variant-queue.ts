/**
 * Image Variant Processing Queue
 * Processes images with max 2 concurrent operations to avoid RAM overflow
 * 
 * Flow: Original (JPEG/PNG/etc.) → Convert to AVIF → Generate size variants (@300, @800, @1600)
 * All processing happens server-side in the background.
 */

import { createHash } from 'crypto';
import sharp from 'sharp';
import { generateImageVariants, VARIANT_COUNT } from './image-variants';
import { getObject, putObject, deleteObject } from './storage';
import { query, setImageContentHash } from './db';
import { telegramNotifier } from './telegram-notifier';
import { env } from './env';

type QueueItem = {
  imageId: string;
  key: string;
  mime: string;
};

/** Was gerade mit dem Bild passiert – für die Anzeige im Client */
export type ProcessingPhase = 'downloading' | 'converting' | 'variants';

export type ImageProgress = {
  phase: ProcessingPhase;
  /** Abgeschlossene Arbeitsschritte */
  completed: number;
  /** Gesamtzahl der Schritte für dieses Bild */
  total: number;
};

/**
 * Schritte pro Bild. Das sind echte, abgeschlossene Teilarbeiten – kein
 * Zeitschätzer. Bilder, die schon als AVIF ankommen, überspringen die
 * Konvertierung und haben deshalb weniger Schritte.
 */
const STEPS_WITH_CONVERSION = 3 + 1 + VARIANT_COUNT; // laden, konvertieren, hochladen + Varianten
const STEPS_ALREADY_AVIF = 1 + VARIANT_COUNT;        // nur Varianten (inkl. deren Download)

/**
 * Nach dieser Zeit gilt die Verarbeitung eines Bildes als hängend. Ein
 * blockierter MinIO- oder Sharp-Aufruf würde sonst dauerhaft einen der beiden
 * Slots belegen und die gesamte Queue zum Stillstand bringen.
 */
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

class VariantQueue {
  private queue: QueueItem[] = [];
  private processing = 0;
  /**
   * Gleichzeitig verarbeitete Bilder. Achtung: jeder Slot erzeugt seine drei
   * Größen parallel, es laufen also bis zu 3x so viele Sharp-Operationen.
   * Über VARIANT_CONCURRENCY einstellbar.
   */
  private readonly maxConcurrent = env.server().VARIANT_CONCURRENCY;
  /** IDs in Queue oder Verarbeitung – verhindert doppeltes Einreihen */
  private known = new Set<string>();
  /** Echter Fortschritt der aktuell verarbeiteten Bilder */
  private progress = new Map<string, ImageProgress>();

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
      const result = await this.withTimeout(this.processItem(item), PROCESSING_TIMEOUT_MS);

      // Update status to completed
      await query(
        'UPDATE images SET variant_status = $1 WHERE id = $2',
        ['completed', item.imageId]
      );

      // Erst jetzt melden: das Bild ist fertig konvertiert und liegt endgültig
      // im Speicher. Alles davor könnte noch scheitern.
      await this.reportSuccess(item.imageId, result.originalBytes);
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
      this.progress.delete(item.imageId);

      // Process next item in queue
      this.processNext();
    }
  }

  /**
   * Konvertierung und Variantenerzeugung für ein Bild.
   * Meldet nach jedem echten Teilschritt den Fortschritt.
   */
  private async processItem(item: QueueItem): Promise<{ originalBytes: number | null }> {
    const needsConversion = item.mime !== 'image/avif';
    const total = needsConversion ? STEPS_WITH_CONVERSION : STEPS_ALREADY_AVIF;
    let completed = 0;

    /** Phase wechseln, ohne einen Schritt als erledigt zu zählen */
    const enter = (phase: ProcessingPhase) =>
      this.progress.set(item.imageId, { phase, completed, total });
    /** Einen abgeschlossenen Schritt melden */
    const advance = (phase: ProcessingPhase) => {
      completed++;
      this.progress.set(item.imageId, { phase, completed, total });
    };

    let processingKey = item.key;
    let processingMime = item.mime;
    // Größe vor der Konvertierung – wird für den Telegram-Report gebraucht,
    // da die DB-Spalte danach die komprimierte Größe enthält.
    let originalBytes: number | null = null;

    // Step 1: Convert to AVIF if not already AVIF
    if (needsConversion) {
      enter('downloading');
      const converted = await this.convertOriginalToAvif(item.key, item.imageId, advance);
      processingKey = converted.avifKey;
      originalBytes = converted.originalBytes;
      processingMime = 'image/avif';
    } else {
      enter('downloading');
      // Kein Konvertierungsschritt, der das Original ohnehin lädt – deshalb
      // nur dann nachladen, wenn der Hash wirklich noch fehlt.
      await this.backfillContentHash(item.imageId, item.key);
    }

    // Step 2: Generate size variants (@300, @800, @1600) from the (now AVIF) original
    enter('variants');
    await generateImageVariants(processingKey, processingMime, {
      onDownloaded: () => advance('variants'),
      onVariant: () => advance('variants'),
    });

    return { originalBytes };
  }

  /**
   * Meldet ein fertig verarbeitetes Bild an den Telegram-Sammler.
   * Liest die endgültige (komprimierte) Größe aus der DB, die zu diesem
   * Zeitpunkt bereits die AVIF-Größe enthält.
   */
  private async reportSuccess(imageId: string, originalBytes: number | null) {
    try {
      const rows = await query<{ filename: string; size: string | null; username: string | null }>(
        `SELECT i.filename, i.size, u.username
         FROM images i
         LEFT JOIN users u ON u.id = i.uploaded_by
         WHERE i.id = $1`,
        [imageId]
      );

      const row = rows[0];
      if (!row) return;

      const storedBytes = Number(row.size) || 0;
      telegramNotifier.record({
        username: row.username ?? 'Unbekannt',
        filename: row.filename,
        size: storedBytes,
        // Bilder, die schon als AVIF ankamen, wurden nicht komprimiert
        originalSize: originalBytes ?? storedBytes,
      });
    } catch (error) {
      // Ein fehlgeschlagener Report darf die Verarbeitung nicht beeinflussen
      console.error(`Telegram-Report konnte nicht erstellt werden: ${imageId}`, error);
    }
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
  private async convertOriginalToAvif(
    originalKey: string,
    imageId: string,
    advance?: (phase: ProcessingPhase) => void,
  ): Promise<{ avifKey: string; originalBytes: number }> {
    const originalBuffer = await this.downloadToBuffer(originalKey);

    if (originalBuffer.length === 0) {
      throw new Error(`Original image is empty: ${originalKey}`);
    }
    advance?.('converting');

    // Hash über die Originalbytes, bevor konvertiert wird – danach sind sie weg
    await this.storeContentHash(imageId, originalBuffer);

    // Convert to AVIF
    const avifBuffer = await sharp(originalBuffer)
      .avif({ quality: 80, effort: 4 })
      .toBuffer();
    advance?.('converting');

    // New key with .avif extension
    const avifKey = originalKey.replace(/\.[^/.]+$/, '.avif');

    // Upload AVIF version
    await putObject(avifKey, avifBuffer, 'image/avif');
    advance?.('variants');

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

    return { avifKey, originalBytes: originalBuffer.length };
  }

  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      maxConcurrent: this.maxConcurrent,
    };
  }

  /** Echter Fortschritt eines gerade verarbeiteten Bildes, sonst null */
  getProgress(imageId: string): ImageProgress | null {
    return this.progress.get(imageId) ?? null;
  }

  /**
   * Wartepositionen aller noch nicht gestarteten Bilder (1-basiert).
   * Damit kann der Client "Position 12 von 40" anzeigen statt zu raten.
   */
  getQueuePositions(): Map<string, number> {
    const positions = new Map<string, number>();
    this.queue.forEach((item, index) => positions.set(item.imageId, index + 1));
    return positions;
  }
}

// Singleton instance
export const variantQueue = new VariantQueue();
