import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getImageById, updateImageTimestamp } from "@/lib/db";
import { getObject, putObject } from "@/lib/storage";
import { auth } from "@/lib/auth";
import { getImageVariantKey, VARIANT_SIZES } from "@/lib/image-variants-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Only admins can rotate images" }, { status: 403 });
    }

    const { id } = await params;
    const { degrees, variant } = await request.json();

    // Validate rotation degrees
    if (![90, 180, 270].includes(degrees)) {
      return NextResponse.json(
        { error: "Invalid rotation. Only 90, 180, 270 degrees allowed." },
        { status: 400 }
      );
    }

    // Validate variant type
    if (!['original', 'grid', 'preview', 'fullscreen'].includes(variant)) {
      return NextResponse.json(
        { error: "Invalid variant. Must be 'original', 'grid', 'preview', or 'fullscreen'." },
        { status: 400 }
      );
    }

    const image = await getImageById(id);
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // Determine the key to rotate
    const keyToRotate = variant === 'original' 
      ? image.key 
      : getImageVariantKey(image.key, variant as 'grid' | 'preview' | 'fullscreen');

    // Download image/variant from MinIO
    const stream = await getObject(keyToRotate);
    if (!stream) {
      return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as any) {
      chunks.push(chunk);
    }
    const originalBuffer = Buffer.concat(chunks);

    // Rotate based on variant type
    let rotatedBuffer: Buffer;
    
    if (variant === 'original') {
      // Rotate original with format-specific settings
      if (image.mime === 'image/jpeg' || image.mime === 'image/jpg') {
        rotatedBuffer = await sharp(originalBuffer)
          .rotate(degrees)
          .jpeg({ quality: 100, mozjpeg: true })
          .toBuffer();
      } else if (image.mime === 'image/png') {
        rotatedBuffer = await sharp(originalBuffer)
          .rotate(degrees)
          .png({ compressionLevel: 9 })
          .toBuffer();
      } else if (image.mime === 'image/webp') {
        rotatedBuffer = await sharp(originalBuffer)
          .rotate(degrees)
          .webp({ quality: 90 })
          .toBuffer();
      } else if (image.mime === 'image/avif') {
        rotatedBuffer = await sharp(originalBuffer)
          .rotate(degrees)
          .avif({ quality: 80, effort: 4 })
          .toBuffer();
      } else {
        rotatedBuffer = await sharp(originalBuffer)
          .rotate(degrees)
          .toBuffer();
      }
    } else {
      // Rotate variant (always AVIF)
      const targetWidth = VARIANT_SIZES[variant as 'grid' | 'preview' | 'fullscreen'];
      rotatedBuffer = await sharp(originalBuffer)
        .rotate(degrees)
        .resize(targetWidth, targetWidth, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .avif({ quality: 80, effort: 4 })
        .toBuffer();
    }

    // Upload rotated image back
    const mimeType = variant === 'original' ? (image.mime || 'image/jpeg') : 'image/avif';
    await putObject(keyToRotate, rotatedBuffer, mimeType);

    // Update database timestamp to invalidate cache
    await updateImageTimestamp(id);

    return NextResponse.json({ 
      success: true,
      variant,
      size: rotatedBuffer.length
    });
  } catch (error) {
    console.error("Error rotating variant:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to rotate variant" },
      { status: 500 }
    );
  }
}
