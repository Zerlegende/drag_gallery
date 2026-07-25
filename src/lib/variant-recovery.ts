/**
 * Wiederherstellung der Bildverarbeitung nach einem Neustart.
 *
 * Die Variant-Queue lebt nur im RAM. Wird der Server mitten in einem Upload
 * neu gestartet (Deploy, Absturz), bleiben Bilder für immer auf
 * variant_status = 'pending' oder 'processing' liegen: sie bekommen nie
 * Varianten, und die Clients pollen endlos weiter.
 *
 * Wird einmal pro Serverprozess aus src/instrumentation.ts aufgerufen.
 */

import { query } from "./db";
import { variantQueue } from "./variant-queue";

type StuckImage = {
  id: string;
  key: string;
  mime: string | null;
};

export async function recoverStuckImages(): Promise<{ reset: number; requeued: number }> {
  // In einem frisch gestarteten Prozess kann nichts mehr "processing" sein –
  // solche Zeilen stammen zwangsläufig von einem abgebrochenen Lauf.
  const reset = await query<{ id: string }>(
    `UPDATE images SET variant_status = 'pending'
     WHERE variant_status = 'processing'
     RETURNING id`,
  );

  const stuck = await query<StuckImage>(
    `SELECT id, key, mime FROM images
     WHERE variant_status = 'pending'
     ORDER BY created_at ASC`,
  );

  for (const image of stuck) {
    // Die Verarbeitung ist idempotent: bereits konvertierte Bilder haben
    // mime = 'image/avif' und überspringen den Konvertierungsschritt.
    variantQueue.add(image.id, image.key, image.mime ?? "image/avif");
  }

  if (reset.length > 0 || stuck.length > 0) {
    console.log(
      `[Recovery] ${reset.length} unterbrochene Verarbeitung(en) zurückgesetzt, ` +
        `${stuck.length} Bild(er) neu eingereiht`,
    );
  }

  return { reset: reset.length, requeued: stuck.length };
}
