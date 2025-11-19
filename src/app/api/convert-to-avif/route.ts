import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { convertToAvif, getImageMetadata } from "@/lib/image-conversion";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Get the image file from the request
    const formData = await request.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Get metadata before conversion
    const metadata = await getImageMetadata(buffer);
    console.log(`Converting ${file.name} (${metadata.format}) to AVIF...`);

    // Convert to AVIF
    const avifBuffer = await convertToAvif(buffer, 80);

    // Create a new filename with .avif extension
    const originalName = file.name.replace(/\.[^/.]+$/, "");
    const avifFilename = `${originalName}.avif`;

    console.log(`Converted ${file.name} to AVIF. Original: ${buffer.length} bytes, AVIF: ${avifBuffer.length} bytes`);

    // Return the converted image and metadata
    return new NextResponse(avifBuffer.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/avif",
        "Content-Disposition": `attachment; filename="${avifFilename}"`,
        "X-Original-Format": metadata.format || "unknown",
        "X-Original-Size": buffer.length.toString(),
        "X-AVIF-Size": avifBuffer.length.toString(),
        "X-Width": metadata.width?.toString() || "0",
        "X-Height": metadata.height?.toString() || "0",
      },
    });
  } catch (error) {
    console.error("Error converting image:", error);
    return NextResponse.json(
      { error: "Failed to convert image" },
      { status: 500 }
    );
  }
}
