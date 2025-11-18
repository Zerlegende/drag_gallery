#!/usr/bin/env node

/**
 * Migration Script: Convert all existing images in MinIO to AVIF format
 * 
 * This script:
 * 1. Fetches all images from the database
 * 2. Downloads each image from MinIO
 * 3. Converts to AVIF using Sharp
 * 4. Uploads the AVIF version back to MinIO
 * 5. Updates the database with new filename and metadata
 * 6. Optionally deletes the old image
 */

const { Pool } = require('pg');
const sharp = require('sharp');
// Using Node.js built-in fetch (available in Node 18+)
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const MINIO_BASE_URL = process.env.MINIO_BASE_URL;
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT;
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY;
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'images';

// MinIO Client Setup
const Minio = require('minio');
const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT.replace('https://', '').replace('http://', ''),
  port: MINIO_ENDPOINT.startsWith('https') ? 443 : 80,
  useSSL: MINIO_ENDPOINT.startsWith('https'),
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

async function convertImageToAvif(buffer) {
  return await sharp(buffer)
    .avif({
      quality: 80,
      effort: 4,
    })
    .toBuffer();
}

async function getImageMetadata(buffer) {
  const metadata = await sharp(buffer).metadata();
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
  };
}

async function migrateImage(image) {
  try {
    console.log(`\n📸 Processing: ${image.filename} (${image.mime})`);
    
    // Skip if already AVIF
    if (image.mime === 'image/avif' || image.key.endsWith('.avif')) {
      console.log('  ✅ Already AVIF');
      
      // Try to delete old non-AVIF version if it exists
      const oldKey = image.key.replace('.avif', '.jpeg');
      const oldKeyPNG = image.key.replace('.avif', '.png');
      const oldKeyJPG = image.key.replace('.avif', '.JPG');
      
      for (const possibleOldKey of [oldKey, oldKeyPNG, oldKeyJPG]) {
        if (possibleOldKey !== image.key) {
          try {
            await minioClient.statObject(MINIO_BUCKET, possibleOldKey);
            console.log(`  🗑️  Deleting old version: ${possibleOldKey}`);
            await minioClient.removeObject(MINIO_BUCKET, possibleOldKey);
            console.log('  ✓ Old version deleted');
          } catch (err) {
            // File doesn't exist, which is fine
          }
        }
      }
      
      return { status: 'skipped', reason: 'already_avif' };
    }

    // Skip GIFs (not supported)
    if (image.mime === 'image/gif') {
      console.log('  ⚠️  GIF format not supported, skipping');
      return { status: 'skipped', reason: 'gif_not_supported' };
    }

    // 1. Download image from MinIO
    console.log(`  📥 Downloading from MinIO: ${image.key}`);
    const chunks = [];
    const stream = await minioClient.getObject(MINIO_BUCKET, image.key);
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const originalBuffer = Buffer.concat(chunks);
    console.log(`  ✓ Downloaded ${originalBuffer.length} bytes`);

    // 2. Get metadata
    const metadata = await getImageMetadata(originalBuffer);
    console.log(`  📊 Original: ${metadata.format}, ${metadata.width}x${metadata.height}`);

    // 3. Convert to AVIF
    console.log('  🔄 Converting to AVIF...');
    const avifBuffer = await convertImageToAvif(originalBuffer);
    const compressionRatio = ((1 - avifBuffer.length / originalBuffer.length) * 100).toFixed(1);
    console.log(`  ✓ Converted: ${avifBuffer.length} bytes (${compressionRatio}% smaller)`);

    // 4. Generate new key (replace extension with .avif)
    const newKey = image.key.replace(/\.[^.]+$/, '.avif');
    const newFilename = image.filename.replace(/\.[^.]+$/, '.avif');
    
    // 5. Upload AVIF to MinIO
    console.log(`  📤 Uploading to MinIO: ${newKey}`);
    await minioClient.putObject(
      MINIO_BUCKET,
      newKey,
      avifBuffer,
      avifBuffer.length,
      {
        'Content-Type': 'image/avif',
      }
    );
    console.log('  ✓ Uploaded to MinIO');

    // 6. Update database
    console.log('  💾 Updating database...');
    await pool.query(
      `UPDATE images 
       SET filename = $1, key = $2, mime = $3, size = $4, width = $5, height = $6 
       WHERE id = $7`,
      [newFilename, newKey, 'image/avif', avifBuffer.length, metadata.width, metadata.height, image.id]
    );
    console.log('  ✓ Database updated');

    // 7. Delete old image from MinIO (optional - uncomment to enable)
    console.log(`  🗑️  Deleting old image: ${image.key}`);
    await minioClient.removeObject(MINIO_BUCKET, image.key);
    console.log('  ✓ Old image deleted');

    console.log('  ✅ Migration successful!');
    return { 
      status: 'success', 
      originalSize: originalBuffer.length, 
      avifSize: avifBuffer.length,
      compressionRatio: parseFloat(compressionRatio),
    };
  } catch (error) {
    console.error(`  ❌ Error migrating ${image.filename}:`, error.message);
    return { status: 'error', error: error.message };
  }
}

async function runMigration() {
  console.log('🚀 Starting AVIF Migration\n');
  console.log('=' .repeat(60));
  
  try {
    // Get all images from database
    const result = await pool.query(
      'SELECT id, filename, key, mime, size FROM images ORDER BY created_at ASC'
    );
    
    const images = result.rows;
    console.log(`\n📊 Found ${images.length} images in database\n`);

    const stats = {
      total: images.length,
      success: 0,
      skipped: 0,
      errors: 0,
      totalOriginalSize: 0,
      totalAvifSize: 0,
    };

    // Process each image
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      console.log(`\n[${i + 1}/${images.length}] ---`);
      
      const result = await migrateImage(image);
      
      if (result.status === 'success') {
        stats.success++;
        stats.totalOriginalSize += result.originalSize;
        stats.totalAvifSize += result.avifSize;
      } else if (result.status === 'skipped') {
        stats.skipped++;
      } else {
        stats.errors++;
      }

      // Small delay to avoid overwhelming MinIO
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Migration Summary:');
    console.log(`  Total Images:       ${stats.total}`);
    console.log(`  ✅ Converted:       ${stats.success}`);
    console.log(`  ⏭️  Skipped:         ${stats.skipped}`);
    console.log(`  ❌ Errors:          ${stats.errors}`);
    
    if (stats.success > 0) {
      const totalSaved = stats.totalOriginalSize - stats.totalAvifSize;
      const avgCompression = ((totalSaved / stats.totalOriginalSize) * 100).toFixed(1);
      console.log(`\n💾 Storage Saved:`);
      console.log(`  Original Size:      ${(stats.totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  AVIF Size:          ${(stats.totalAvifSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Saved:              ${(totalSaved / 1024 / 1024).toFixed(2)} MB (${avgCompression}%)`);
    }
    
    console.log('\n✅ Migration completed!\n');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration();
