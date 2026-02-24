import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

import { getImageById } from "@/lib/db";
import { getObject } from "@/lib/storage";

const SUPPORTED_FORMATS = ["original", "jpg", "png", "webp", "avif"] as const;
type DownloadFormat = (typeof SUPPORTED_FORMATS)[number];

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") || "original") as DownloadFormat;

  if (!SUPPORTED_FORMATS.includes(format)) {
    return NextResponse.json(
      { error: `Unsupported format. Supported: ${SUPPORTED_FORMATS.join(", ")}` },
      { status: 400 }
    );
  }

  const image = await getImageById(id);
  if (!image) {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    // Download original from MinIO
    const body = await getObject(image.key);
    if (!body) {
      return new NextResponse("Image not found in storage", { status: 404 });
    }

    const chunks: Uint8Array[] = [];
    // @ts-expect-error - body is a readable stream
    for await (const chunk of body) {
      chunks.push(chunk);
    }
    const originalBuffer = Buffer.concat(chunks);

    // Determine download filename
    const baseName = (image.imagename || image.filename).replace(/\.[^.]+$/, "");

    if (format === "original") {
      // Return the original file as-is
      const ext = image.filename.split(".").pop() || "bin";
      const mime = image.mime || "application/octet-stream";
      return new NextResponse(originalBuffer.buffer as ArrayBuffer, {
        headers: {
          "Content-Type": mime,
          "Content-Disposition": `attachment; filename="${encodeURIComponent(`${baseName}.${ext}`)}"`,
          "Content-Length": originalBuffer.length.toString(),
        },
      });
    }

    // Convert to target format
    let sharpInstance = sharp(originalBuffer);

    let convertedBuffer: Buffer;
    switch (format) {
      case "jpg":
        convertedBuffer = await sharpInstance.jpeg({ quality: 90 }).toBuffer();
        break;
      case "png":
        convertedBuffer = await sharpInstance.png().toBuffer();
        break;
      case "webp":
        convertedBuffer = await sharpInstance.webp({ quality: 90 }).toBuffer();
        break;
      case "avif":
        convertedBuffer = await sharpInstance.avif({ quality: 80, effort: 4 }).toBuffer();
        break;
      default:
        return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
    }

    const mime = MIME_TYPES[format];
    const filename = `${baseName}.${format}`;

    return new NextResponse(convertedBuffer.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": convertedBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Error downloading/converting image:", error);
    return NextResponse.json(
      { error: "Failed to download image" },
      { status: 500 }
    );
  }
}
