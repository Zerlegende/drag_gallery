import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getImageById, upsertTags, withTransaction, updateImageName } from "@/lib/db";
import { deleteObject } from "@/lib/storage";

const patchSchema = z.object({
  tags: z.array(z.string()).optional(),
  imagename: z.string().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params; // Await params

  const json = await request.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await withTransaction(async (client) => {
    // Update imagename wenn vorhanden
    if (parsed.data.imagename !== undefined) {
      await updateImageName(id, parsed.data.imagename);
    }

    // Update tags wenn vorhanden
    if (parsed.data.tags !== undefined) {
      await client.query("DELETE FROM image_tags WHERE image_id = $1", [id]);
      
      if (parsed.data.tags.length > 0) {
        // Check if we have UUIDs (tag IDs) or names
        const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
        
        if (isUUID(parsed.data.tags[0])) {
          // We have tag IDs - use them directly
          const values = parsed.data.tags.map((_, index) => `($1, $${index + 2})`).join(",");
          await client.query(
            `INSERT INTO image_tags (image_id, tag_id) VALUES ${values} ON CONFLICT DO NOTHING`,
            [id, ...parsed.data.tags],
          );
        } else {
          // We have tag names - use upsert
          const tags = await upsertTags(client, parsed.data.tags);
          if (tags.length > 0) {
            const values = tags.map((tag, index) => `($1, $${index + 2})`).join(",");
            await client.query(
              `INSERT INTO image_tags (image_id, tag_id) VALUES ${values} ON CONFLICT DO NOTHING`,
              [id, ...tags.map((tag) => tag.id)],
            );
          }
        }
      }
    }
  });

  const image = await getImageById(id);
  if (!image) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return NextResponse.json({ image });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params; // Await params

  const image = await getImageById(id);
  if (!image) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Prüfe Lösch-Berechtigung
  const isAdmin = session.user.role === "admin";
  const isOwner = image.uploaded_by === session.user.id;
  const uploadTime = new Date(image.created_at).getTime();
  const now = Date.now();
  const oneHourInMs = 60 * 60 * 1000; // 1 Stunde in Millisekunden
  const canDeleteAsOwner = isOwner && (now - uploadTime) <= oneHourInMs;

  if (!isAdmin && !canDeleteAsOwner) {
    return new NextResponse("Forbidden: You can only delete your own images within 1 hour of upload", { status: 403 });
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
    await client.query("DELETE FROM image_tags WHERE image_id = $1", [id]);
    await client.query("DELETE FROM images WHERE id = $1", [id]);
  });

  return new NextResponse(null, { status: 204 });
}
