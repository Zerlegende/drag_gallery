import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { s3Client } from "@/lib/storage";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";
import { randomBytes } from "crypto";

const { MINIO_BUCKET } = env.server();
const BUCKET_NAME = MINIO_BUCKET;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const userId = formData.get("userId") as string;

    // Verify user is updating their own avatar (or is admin)
    if (userId !== session.user.id && session.user.role !== "admin") {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
    }

    if (!file) {
      return NextResponse.json({ error: "Keine Datei hochgeladen" }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Nur Bilddateien erlaubt" }, { status: 400 });
    }

    // Generate unique filename
    const ext = file.name.split(".").pop() || "jpg";
    const uniqueKey = `avatars/${userId}-${randomBytes(8).toString("hex")}.${ext}`;

    // Convert File to Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to MinIO using S3 Client
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: uniqueKey,
        Body: buffer,
        ContentType: file.type,
        CacheControl: 'public, max-age=31536000',
      })
    );

    // Get old avatar if exists
    const userResult = await query<{ avatar: string | null }>(
      "SELECT avatar FROM users WHERE id = $1",
      [userId]
    );
    const oldAvatar = userResult[0]?.avatar;

    // Delete old avatar if exists
    if (oldAvatar) {
      try {
        const oldKey = oldAvatar.includes("/") 
          ? oldAvatar.split("/").slice(-2).join("/")
          : oldAvatar;
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: oldKey,
          })
        );
      } catch (error) {
        console.error("Failed to delete old avatar:", error);
      }
    }

    // Update user in database
    await query(
      "UPDATE users SET avatar = $1 WHERE id = $2",
      [uniqueKey, userId]
    );

    const avatarUrl = `${process.env.NEXT_PUBLIC_MINIO_BASE_URL}/${uniqueKey}`;

    return NextResponse.json({ 
      success: true, 
      avatarUrl,
      message: "Avatar erfolgreich hochgeladen" 
    });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return NextResponse.json(
      { error: "Fehler beim Hochladen des Avatars" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { userId } = await req.json();

    // Verify user is updating their own avatar (or is admin)
    if (userId !== session.user.id && session.user.role !== "admin") {
      return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
    }

    // Get current avatar
    const userResult = await query<{ avatar: string | null }>(
      "SELECT avatar FROM users WHERE id = $1",
      [userId]
    );
    const avatar = userResult[0]?.avatar;

    if (avatar) {
      try {
        const key = avatar.includes("/") 
          ? avatar.split("/").slice(-2).join("/")
          : avatar;
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
          })
        );
      } catch (error) {
        console.error("Failed to delete avatar from MinIO:", error);
      }
    }

    // Remove avatar from database
    await query(
      "UPDATE users SET avatar = NULL WHERE id = $1",
      [userId]
    );

    return NextResponse.json({ 
      success: true,
      message: "Avatar erfolgreich entfernt" 
    });
  } catch (error) {
    console.error("Avatar delete error:", error);
    return NextResponse.json(
      { error: "Fehler beim Löschen des Avatars" },
      { status: 500 }
    );
  }
}
