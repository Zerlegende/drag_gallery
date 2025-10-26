import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getImageById, upsertTags, withTransaction, updateImageName } from "@/lib/db";
import { deleteObject } from "@/lib/storage";

const patchSchema = z.object({
  tags: z.array(z.string()).optional(),
  imagename: z.string().optional(),
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
    // Update imagename wenn vorhanden
    if (parsed.data.imagename !== undefined) {
      await updateImageName(params.id, parsed.data.imagename);
    }

    // Update tags wenn vorhanden
    if (parsed.data.tags !== undefined) {
      await client.query("DELETE FROM image_tags WHERE image_id = $1", [params.id]);
      
      if (parsed.data.tags.length > 0) {
        // Check if we have UUIDs (tag IDs) or names
        const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        
        if (isUUID(parsed.data.tags[0])) {
          // We have tag IDs - use them directly
          const values = parsed.data.tags.map((_, index) => `($1, $${index + 2})`).join(",");
          await client.query(
            `INSERT INTO image_tags (image_id, tag_id) VALUES ${values} ON CONFLICT DO NOTHING`,
            [params.id, ...parsed.data.tags],
          );
        } else {
          // We have tag names - use upsert
          const tags = await upsertTags(client, parsed.data.tags);
          if (tags.length > 0) {
            const values = tags.map((tag, index) => `($1, $${index + 2})`).join(",");
            await client.query(
              `INSERT INTO image_tags (image_id, tag_id) VALUES ${values} ON CONFLICT DO NOTHING`,
              [params.id, ...tags.map((tag) => tag.id)],
            );
          }
        }
      }
    }
  });

  const image = await getImageById(params.id);
  if (!image) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return NextResponse.json({ image });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Nur Admins dürfen löschen
  if (session.user.role !== "admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const image = await getImageById(params.id);
  if (!image) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Lösche aus MinIO
  try {
    await deleteObject(image.key);
  } catch (error) {
    console.error("Failed to delete from MinIO:", error);
    // Fahre fort, auch wenn MinIO-Löschung fehlschlägt
  }

  // Lösche aus DB
  await withTransaction(async (client) => {
    await client.query("DELETE FROM image_tags WHERE image_id = $1", [params.id]);
    await client.query("DELETE FROM images WHERE id = $1", [params.id]);
  });

  return new NextResponse(null, { status: 204 });
}
