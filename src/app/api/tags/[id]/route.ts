import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withTransaction } from "@/lib/db";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin role
    const user = session.user as any;
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const tagId = params.id;

    await withTransaction(async (client) => {
      // Delete tag (CASCADE will remove from image_tags)
      await client.query("DELETE FROM tags WHERE id = $1", [tagId]);
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error deleting tag:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
