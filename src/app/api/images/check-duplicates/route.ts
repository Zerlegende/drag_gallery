import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { findImagesByContentHash } from "@/lib/db";

/** Ein Batch pro Request – der Client schickt in Blöcken, nicht pro Datei */
const MAX_HASHES_PER_REQUEST = 200;

const bodySchema = z.object({
  hashes: z
    .array(z.string().regex(/^[a-f0-9]{64}$/, "Kein gültiger SHA-256-Hex-Hash"))
    .max(MAX_HASHES_PER_REQUEST),
});

/**
 * POST /api/images/check-duplicates
 *
 * Prüft anhand des SHA-256 über den Dateiinhalt, welche Bilder es schon gibt –
 * unabhängig vom Dateinamen. Antwortet mit einem Eintrag je gefundenem Hash.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Doppelte Hashes innerhalb des Requests kosten sonst unnötig Arbeit
  const unique = Array.from(new Set(parsed.data.hashes));

  try {
    const matches = await findImagesByContentHash(unique);

    return NextResponse.json({
      duplicates: matches.map(match => ({
        hash: match.content_hash,
        imageId: match.id,
        filename: match.imagename || match.filename,
        createdAt: match.created_at,
        archiveId: match.archive_id,
      })),
    });
  } catch (error) {
    console.error("Check duplicates error:", error);
    return NextResponse.json({ error: "Duplikatprüfung fehlgeschlagen" }, { status: 500 });
  }
}
