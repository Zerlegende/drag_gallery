import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getImageById, updateImageSize } from "@/lib/db";
import { getObject, putObject } from "@/lib/storage";
import { auth } from "@/lib/auth";
import { getImageVariantKey, VARIANT_SIZES } from "@/lib/image-variants-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication and admin role
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Only admins can rotate images" }, { status: 403 });
    }

    const { id } = await params;
    const { degrees } = await request.json();

    console.log(`🔄 Rotating image ${id} by ${degrees}°`);

    // Validate rotation degrees (only 90, 180, 270 allowed)
    if (![90, 180, 270].includes(degrees)) {
      console.error(`❌ Invalid rotation degrees: ${degrees}`);
      return NextResponse.json(
        { error: "Invalid rotation. Only 90, 180, 270 degrees allowed." },
        { status: 400 }
      );
    }

    // Get image from database
    const image = await getImageById(id);
    console.log(`📸 Image found:`, image ? `${image.filename} (${image.key})` : 'null');

    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // Download image from MinIO
    console.log(`⬇️ Downloading image from MinIO: ${image.key}`);
    const stream = await getObject(image.key);
    
    if (!stream) {
      console.error(`❌ Failed to get stream from MinIO`);
      return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
    }

    const chunks: Uint8Array[] = [];
    
    for await (const chunk of stream as any) {
      chunks.push(chunk);
    }
    
    const originalBuffer = Buffer.concat(chunks);
    console.log(`✅ Downloaded ${originalBuffer.length} bytes`);
    console.log(`📄 Original file: ${image.filename}`);
    console.log(`📦 Original size: ${(originalBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Rotate image using sharp
    console.log(`🔄 Rotating with sharp...`);
    
    // Rotate without re-encoding for lossless rotation
    // Use withMetadata to preserve EXIF data
    let rotatedBuffer: Buffer;
    
    if (image.mime === 'image/jpeg' || image.mime === 'image/jpg') {
      // For JPEG: use quality 100 to minimize quality loss
      rotatedBuffer = await sharp(originalBuffer)
        .rotate(degrees)
        .jpeg({ quality: 100, mozjpeg: true })
        .toBuffer();
    } else if (image.mime === 'image/png') {
      // For PNG: use compressionLevel 9 for best quality
      rotatedBuffer = await sharp(originalBuffer)
        .rotate(degrees)
        .png({ compressionLevel: 9 })
        .toBuffer();
    } else if (image.mime === 'image/webp') {
      // For WebP: use quality 90 for good balance
      rotatedBuffer = await sharp(originalBuffer)
        .rotate(degrees)
        .webp({ quality: 90 })
        .toBuffer();
    } else if (image.mime === 'image/avif') {
      // For AVIF: use quality 80 with effort 4 (same as conversion settings)
      rotatedBuffer = await sharp(originalBuffer)
        .rotate(degrees)
        .avif({ quality: 80, effort: 4 })
        .toBuffer();
    } else {
      // Fallback for other formats
      rotatedBuffer = await sharp(originalBuffer)
        .rotate(degrees)
        .toBuffer();
    }
    
    console.log(`✅ Rotated to ${rotatedBuffer.length} bytes`);
    console.log(`📦 Rotated size: ${(rotatedBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Size change: ${rotatedBuffer.length > originalBuffer.length ? '+' : ''}${((rotatedBuffer.length - originalBuffer.length) / 1024).toFixed(2)} KB`);

    // Upload rotated image back to MinIO (replace original)
    console.log(`⬆️ Uploading rotated image back to MinIO...`);
    await putObject(
      image.key,
      rotatedBuffer,
      image.mime || "image/jpeg"
    );
    console.log(`✅ Upload complete`);

    // Rotate and upload all variants (@300, @800, @1600)
    console.log(`🔄 Rotating variants...`);
    const variantSizes: ('grid' | 'preview' | 'fullscreen')[] = ['grid', 'preview', 'fullscreen'];
    
    await Promise.all(
      variantSizes.map(async (size) => {
        try {
          const variantKey = getImageVariantKey(image.key, size);
          const targetWidth = VARIANT_SIZES[size];
          
          // Download existing variant
          const variantStream = await getObject(variantKey);
          if (!variantStream) {
            console.log(`⚠️ Variant ${size} not found, skipping`);
            return;
          }
          
          const variantChunks: Uint8Array[] = [];
          for await (const chunk of variantStream as any) {
            variantChunks.push(chunk);
          }
          const variantBuffer = Buffer.concat(variantChunks);
          
          // Rotate variant
          const rotatedVariant = await sharp(variantBuffer)
            .rotate(degrees)
            .resize(targetWidth, targetWidth, {
              fit: 'inside',
              withoutEnlargement: true
            })
            .avif({ quality: 80, effort: 4 })
            .toBuffer();
          
          // Upload rotated variant
          await putObject(variantKey, rotatedVariant, 'image/avif');
          console.log(`✅ Rotated variant ${size} (${targetWidth}px)`);
        } catch (error) {
          console.error(`❌ Failed to rotate variant ${size}:`, error);
          // Continue with other variants even if one fails
        }
      })
    );

    // Update size in database (might have changed slightly due to rotation)
    console.log(`💾 Updating size in database...`);
    await updateImageSize(id, rotatedBuffer.length);
    console.log(`✅ Database updated`);

    // Get updated image with new timestamp
    const updatedImage = await getImageById(id);

    return NextResponse.json({ 
      success: true,
      updated_at: updatedImage?.updated_at || new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Error rotating image:", error);
    console.error("Stack:", error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to rotate image" },
      { status: 500 }
    );
  }
}
