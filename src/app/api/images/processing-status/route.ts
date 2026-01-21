import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { variantQueue } from "@/lib/variant-queue";

/**
 * GET /api/images/processing-status
 * Returns processing status for current user's images
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's images that are being processed
    const images = await query(
      `SELECT id, filename, key, variant_status, created_at
       FROM images 
       WHERE uploaded_by = $1 
       AND variant_status IN ('pending', 'processing')
       ORDER BY created_at DESC`,
      [session.user.id]
    );

    const queueStatus = variantQueue.getStatus();

    return NextResponse.json({
      images,
      queue: queueStatus,
      total: images.length,
      pending: images.filter(img => img.variant_status === 'pending').length,
      processing: images.filter(img => img.variant_status === 'processing').length,
    });
  } catch (error) {
    console.error("Error fetching processing status:", error);
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 }
    );
  }
}
