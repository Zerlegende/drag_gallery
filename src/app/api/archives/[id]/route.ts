import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArchiveById, updateArchiveName, deleteArchive, moveImagesToArchive } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const archive = await getArchiveById(id);
  if (!archive) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  return NextResponse.json({ archive });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
    await updateArchiveName(id, name);
  }

  if (body.imageIds !== undefined) {
    // Bilder ins Archiv verschieben (oder aus Archiv entfernen wenn archiveId = null)
    const targetArchiveId = body.targetArchiveId ?? id;
    await moveImagesToArchive(body.imageIds, targetArchiveId);
  }

  const archive = await getArchiveById(id);
  return NextResponse.json({ archive });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await deleteArchive(id);
  return NextResponse.json({ success: true });
}
