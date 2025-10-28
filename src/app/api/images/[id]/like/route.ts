import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// POST /api/images/:id/like - Like/Unlike an image
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { id } = await context.params;
    const userId = session.user.id;

    // Check if image exists
    const images = await query(
      "SELECT id FROM images WHERE id = $1",
      [id]
    );

    if (images.length === 0) {
      return new NextResponse("Image not found", { status: 404 });
    }

    // Check if user already liked this image
    const existingLike = await query(
      "SELECT id FROM likes WHERE user_id = $1 AND image_id = $2",
      [userId, id]
    );

    const isLiked = existingLike.length > 0;

    if (isLiked) {
      // Unlike: Remove the like from likes table
      await query(
        "DELETE FROM likes WHERE user_id = $1 AND image_id = $2",
        [userId, id]
      );
    } else {
      // Like: Insert a new like into likes table
      await query(
        "INSERT INTO likes (user_id, image_id) VALUES ($1, $2)",
        [userId, id]
      );
    }

    return NextResponse.json({ 
      success: true, 
      liked: !isLiked 
    });
  } catch (error) {
    console.error("Error toggling like:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
