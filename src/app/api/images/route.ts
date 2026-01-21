import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getImageById, getImagesWithTags, upsertTags, withTransaction } from "@/lib/db";
import { variantQueue } from "@/lib/variant-queue";

const bodySchema = z.object({
  filename: z.string().min(1),
  key: z.string().min(1),
  mime: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()).optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tags = searchParams.getAll("tag");
  const images = await getImagesWithTags(tags);
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
        INSERT INTO images (id, filename, key, mime, size, uploaded_by, position, variant_status)
        VALUES ($1, $2, $3, $4, $5, $6, (
          SELECT COALESCE(MAX(position) + 1, 0) FROM images
        ), 'pending')
      `,
      [
        id,
        parsed.data.filename,
        parsed.data.key,
        parsed.data.mime ?? null,
        parsed.data.size ?? null,
        userId ?? null,
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

  const image = await getImageById(imageId);
  if (!image) {
    return NextResponse.json({ error: "Image not found after creation." }, { status: 500 });
  }

  return NextResponse.json({ image });
}
