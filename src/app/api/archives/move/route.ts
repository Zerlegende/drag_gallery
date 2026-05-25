import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { moveImagesToArchive } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const imageIds: string[] = Array.isArray(body.imageIds) ? body.imageIds : [];
  // archiveId = null bedeutet: zurück in Hauptgalerie
  const archiveId: string | null = body.archiveId ?? null;

  if (imageIds.length === 0) {
    return NextResponse.json({ error: "Keine Bilder angegeben" }, { status: 400 });
  }

  await moveImagesToArchive(imageIds, archiveId);
  return NextResponse.json({ success: true, moved: imageIds.length });
}
