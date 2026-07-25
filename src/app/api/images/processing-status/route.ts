import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { variantQueue } from "@/lib/variant-queue";

type ImageRow = {
  id: string;
  filename: string;
  key: string;
  variant_status: string;
  created_at: string;
};

/**
 * Reichert eine Bild-Zeile mit dem echten Verarbeitungsfortschritt an:
 * - 'processing' → abgeschlossene Teilschritte des laufenden Bildes
 * - 'pending'    → Warteposition in der Queue
 */
function withProgress(image: ImageRow, positions: Map<string, number>, queueLength: number) {
  const progress = variantQueue.getProgress(image.id);

  return {
    ...image,
    phase: progress?.phase ?? null,
    completedSteps: progress?.completed ?? null,
    totalSteps: progress?.total ?? null,
    queuePosition: positions.get(image.id) ?? null,
    queueLength,
  };
}

/**
 * GET /api/images/processing-status
 * Offene Bilder des Users (pending/processing, plus kürzlich fehlgeschlagene).
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 'failed' muss mitgeliefert werden, sonst verschwindet ein fehlgeschlagenes
    // Bild einfach aus der Liste und der Client meldet es als "fertig".
    const images = await query<ImageRow>(
      `SELECT id, filename, key, variant_status, created_at
       FROM images
       WHERE uploaded_by = $1
       AND (
         variant_status IN ('pending', 'processing')
         OR (variant_status = 'failed' AND created_at > NOW() - INTERVAL '1 hour')
       )
       ORDER BY created_at DESC`,
      [session.user.id]
    );

    const queueStatus = variantQueue.getStatus();
    const positions = variantQueue.getQueuePositions();

    return NextResponse.json({
      images: images.map(img => withProgress(img, positions, queueStatus.queueLength)),
      queue: queueStatus,
      total: images.length,
      pending: images.filter(img => img.variant_status === 'pending').length,
      processing: images.filter(img => img.variant_status === 'processing').length,
    });
  } catch (error) {
    console.error("Error fetching processing status:", error);
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 }
    );
  }
}

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).max(1000),
});

/**
 * POST /api/images/processing-status
 *
 * Liefert eine eindeutige Antwort für genau die angefragten Bilder – inklusive
 * 'completed'. Der Client muss dadurch nicht mehr aus dem Fehlen eines Bildes
 * in der Liste auf "fertig" schließen.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const ids = Array.from(new Set(parsed.data.ids));
    const images = ids.length === 0 ? [] : await query<ImageRow>(
      `SELECT id, filename, key, variant_status, created_at
       FROM images
       WHERE id = ANY($1::uuid[]) AND uploaded_by = $2`,
      [ids, session.user.id]
    );

    const queueStatus = variantQueue.getStatus();
    const positions = variantQueue.getQueuePositions();
    const found = new Set(images.map(img => img.id));

    return NextResponse.json({
      images: images.map(img => withProgress(img, positions, queueStatus.queueLength)),
      // Gelöscht oder nicht (mehr) sichtbar – der Client wartet sonst ewig
      unknown: ids.filter(id => !found.has(id)),
      queue: queueStatus,
    });
  } catch (error) {
    console.error("Error fetching processing status:", error);
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 }
    );
  }
}
