import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getImageById, getImagesWithTags, upsertTags, withTransaction } from "@/lib/db";
import { telegramNotifier } from "@/lib/telegram-notifier";
import { variantQueue } from "@/lib/variant-queue";

const bodySchema = z.object({
  filename: z.string().min(1),
  key: z.string().min(1),
  mime: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()).optional(),
  // SHA-256 des Originals für die Duplikaterkennung; der Client kann ihn in
  // unsicheren Kontexten (kein crypto.subtle) nicht berechnen – dann holt ihn
  // die Variant-Pipeline nach.
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tags = searchParams.getAll("tag");
  const archiveParam = searchParams.get("archive");
  // "main" = Hauptgalerie (ohne Archiv), UUID = spezifisches Archiv, null = alle
  const archiveId = archiveParam === "main" ? null : archiveParam ?? undefined;
  const images = await getImagesWithTags(tags, undefined, archiveId);
  return NextResponse.json({ images });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const userId = session.user.id as string | undefined;

  const imageId = await withTransaction(async (client) => {
    const id = randomUUID();

    await client.query(
      `
        INSERT INTO images (id, filename, key, mime, size, uploaded_by, position, variant_status, content_hash)
        VALUES ($1, $2, $3, $4, $5, $6, (
          SELECT COALESCE(MAX(position) + 1, 0) FROM images
        ), 'pending', $7)
      `,
      [
        id,
        parsed.data.filename,
        parsed.data.key,
        parsed.data.mime ?? null,
        parsed.data.size ?? null,
        userId ?? null,
        parsed.data.contentHash ?? null,
      ],
    );

    const tags = await upsertTags(client, parsed.data.tags ?? []);
    if (tags.length > 0) {
      const values = tags.map((tag, index) => `($1, $${index + 2})`).join(",");
      await client.query(
        `INSERT INTO image_tags (image_id, tag_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [id, ...tags.map((tag) => tag.id)],
      );
    }

    return id;
  });

  // Add to variant processing queue (max 2 concurrent)
  variantQueue.add(imageId, parsed.data.key, parsed.data.mime ?? 'image/avif');

  // Telegram-Report sammeln (wird gebündelt verschickt)
  telegramNotifier.record({
    username: session.user.name ?? "Unbekannt",
    filename: parsed.data.filename,
    size: parsed.data.size ?? null,
  });

  const image = await getImageById(imageId);
  if (!image) {
    return NextResponse.json({ error: "Image not found after creation." }, { status: 500 });
  }

  return NextResponse.json({ image });
}
