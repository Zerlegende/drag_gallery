/**
 * Server-side image variant generation using Sharp
 * DO NOT import this in client components!
 */
import sharp from 'sharp';
import { getObject, putObject } from './storage';
import { VARIANT_SIZES, type VariantName, getVariantKey } from './image-variants-utils';

/**
 * Generate all image variants from original key
 * Downloads original from MinIO, resizes, and uploads variants
 */
export async function generateImageVariants(
  originalKey: string,
  mime: string = 'image/avif'
): Promise<Record<VariantName, string>> {
  const stream = await getObject(originalKey);
  
  if (!stream) {
    throw new Error(`Failed to fetch original image: ${originalKey}`);
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as any) {
    chunks.push(chunk);
  }
  const originalBuffer = Buffer.concat(chunks);

  if (originalBuffer.length === 0) {
    throw new Error(`Original image is empty: ${originalKey}`);
  }

  const variants: Record<string, string> = {};
  const uploadPromises = Object.entries(VARIANT_SIZES).map(async ([name, width]) => {
    const variantKey = getVariantKey(originalKey, width);
    
    const resizedBuffer = await sharp(originalBuffer)
      .resize(width, null, {
        withoutEnlargement: true,
        fit: 'inside',
      })
      .avif({ quality: 80, effort: 4 })
      .toBuffer();

    await putObject(variantKey, resizedBuffer, 'image/avif');
    
    variants[name] = variantKey;
  });

  await Promise.all(uploadPromises);

  return variants as Record<VariantName, string>;
}
