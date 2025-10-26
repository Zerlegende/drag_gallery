import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { withTransaction } from "@/lib/db";

const bodySchema = z.object({
  positions: z.array(z.object({ id: z.string().uuid(), position: z.number().int().nonnegative() })),
});

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

  await withTransaction(async (client) => {
    for (const { id, position } of parsed.data.positions) {
      await client.query("UPDATE images SET position = $1 WHERE id = $2", [position, id]);
    }
  });

  return NextResponse.json({ ok: true });
}
