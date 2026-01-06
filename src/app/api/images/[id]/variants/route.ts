import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getImageById } from "@/lib/db";
import { generateImageVariants } from "@/lib/image-variants";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const image = await getImageById(id);
    
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    if (!image.key) {
      return NextResponse.json({ error: "Image has no storage key" }, { status: 400 });
    }

    console.log(`🖼️  Generating variants for ${image.filename}`);

    const variants = await generateImageVariants(image.key, image.mime || 'image/avif');

    console.log(`✅ Generated ${Object.keys(variants).length} variants`);

    return NextResponse.json({
      success: true,
      imageId: id,
      originalKey: image.key,
      variants,
    });

  } catch (error) {
    console.error("❌ Error generating variants:", error);
    
    const message = error instanceof Error ? error.message : "Unknown error";
    
    if (message.includes('Failed to fetch original image')) {
      return NextResponse.json({ error: "Original image not found in storage" }, { status: 404 });
    }
    
    if (message.includes('Original image is empty')) {
      return NextResponse.json({ error: "Original image file is empty or corrupted" }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to generate variants", details: message }, { status: 500 });
  }
}
