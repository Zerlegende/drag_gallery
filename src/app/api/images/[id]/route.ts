import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getImageById, upsertTags, withTransaction } from "@/lib/db";

const patchSchema = z.object({
  tags: z.array(z.string()).default([]),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await withTransaction(async (client) => {
    const tags = await upsertTags(client, parsed.data.tags);
    await client.query("DELETE FROM image_tags WHERE image_id = $1", [params.id]);
    if (tags.length > 0) {
      const values = tags.map((tag, index) => `($1, $${index + 2})`).join(",");
      await client.query(
        `INSERT INTO image_tags (image_id, tag_id) VALUES ${values} ON CONFLICT DO NOTHING`,
        [params.id, ...tags.map((tag) => tag.id)],
      );
    }
  });

  const image = await getImageById(params.id);
  if (!image) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return NextResponse.json({ image });
}
