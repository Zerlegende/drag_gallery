import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getArchives, createArchive } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const archives = await getArchives();
  return NextResponse.json({ archives });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
  }

  const archive = await createArchive(name, session.user.id);
  return NextResponse.json({ archive }, { status: 201 });
}
