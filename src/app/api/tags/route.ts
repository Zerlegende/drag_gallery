import { NextResponse } from "next/server";
import { z } from "zod";

import { getAllTags, upsertTags, withTransaction } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  const tags = await getAllTags();
  return NextResponse.json({ tags });
}

const createTagSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function POST(req: Request) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createTagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
      const tags = await upsertTags(client, [parsed.data.name]);
      return tags[0];
    });

    return NextResponse.json({ tag: result }, { status: 201 });
  } catch (error) {
    console.error("Error creating tag:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
