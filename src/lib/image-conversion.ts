import sharp from 'sharp';

/**
 * Convert an image buffer to AVIF format
 * Supports: JPEG, PNG, WebP, HEIC, HEIF
 */
export async function convertToAvif(buffer: Buffer, quality: number = 80): Promise<Buffer> {
  try {
    const avifBuffer = await sharp(buffer)
      .avif({
        quality,
        effort: 4, // 0-9, higher = better compression but slower
      })
      .toBuffer();
    
    return avifBuffer;
  } catch (error) {
    console.error('Error converting image to AVIF:', error);
    throw new Error('Failed to convert image to AVIF format');
  }
}

/**
 * Get image metadata without converting
 */
export async function getImageMetadata(buffer: Buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: buffer.length,
    };
  } catch (error) {
    console.error('Error reading image metadata:', error);
    throw new Error('Failed to read image metadata');
  }
}
