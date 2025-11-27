import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { putObject, deleteObject } from "@/lib/storage";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("avatar") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    // Get current avatar to delete old one
    const userResult = await query<{ avatar: string | null }>(
      "SELECT avatar FROM users WHERE id = $1",
      [session.user.id]
    );
    const oldAvatar = userResult[0]?.avatar;

    // Upload new avatar
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `avatars/${session.user.id}-${Date.now()}.${file.name.split('.').pop()}`;
    
    await putObject(filename, buffer, file.type);

    // Update user record
    await query(
      "UPDATE users SET avatar = $1 WHERE id = $2",
      [filename, session.user.id]
    );

    // Delete old avatar if exists
    if (oldAvatar) {
      try {
        await deleteObject(oldAvatar);
      } catch (error) {
        console.error("Error deleting old avatar:", error);
        // Don't fail the request if old avatar deletion fails
      }
    }

    return NextResponse.json({ 
      success: true, 
      avatar: filename 
    });
  } catch (error) {
    console.error("Error uploading avatar:", error);
    return NextResponse.json(
      { error: "Failed to upload avatar" },
      { status: 500 }
    );
  }
}
