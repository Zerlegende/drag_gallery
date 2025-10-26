import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { createPresignedUpload } from "@/lib/storage";

const requestSchema = z.object({
  filename: z.string().min(1),
  mime: z.string().min(1).refine((value) => value.startsWith("image/"), "Nur Bildformate sind erlaubt."),
  size: z.number().int().positive().max(50 * 1024 * 1024, "Dateien dürfen maximal 50MB groß sein."),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const json = await request.json();
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const objectKey = `${session.user.id ?? "anonymous"}/${Date.now()}-${randomUUID()}-${parsed.data.filename}`;

  const presigned = await createPresignedUpload({
    key: objectKey,
    contentType: parsed.data.mime,
    maxSize: parsed.data.size,
  });

  return NextResponse.json({
    url: presigned.url,
    fields: presigned.fields,
    objectKey,
  });
}
