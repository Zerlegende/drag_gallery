import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET /api/images/:id/like - Get like information for an image
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    const { id } = await context.params;

    // Get total like count
    const countResult = await query(
      "SELECT COUNT(*)::int as count FROM likes WHERE image_id = $1",
      [id]
    );
    const likeCount = countResult[0]?.count || 0;

    // Check if current user liked it
    let isLiked = false;
    if (session?.user?.id) {
      const likeCheck = await query(
        "SELECT id FROM likes WHERE user_id = $1 AND image_id = $2",
        [session.user.id, id]
      );
      isLiked = likeCheck.length > 0;
    }

    // Get users who liked this image (with their info)
    const likersResult = await query(
      `SELECT u.id, u.username as name, u.avatar as image 
       FROM likes l 
       JOIN users u ON l.user_id::uuid = u.id 
       WHERE l.image_id = $1 
       ORDER BY l.created_at DESC`,
      [id]
    );

    const likers = likersResult.map((row: any) => ({
      userId: row.id,
      userName: row.name,
      userImage: row.image,
    }));

    return NextResponse.json({ 
      likeCount,
      likers,
      isLiked,
    });
  } catch (error) {
    console.error("Error fetching like info:", error);
    return NextResponse.json(
      { error: "Failed to fetch like info", likeCount: 0, likers: [] },
      { status: 500 }
    );
  }
}

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
