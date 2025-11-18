#!/usr/bin/env node

/**
 * Backup Script: Create a complete backup of all MinIO images and database
 * 
 * This script:
 * 1. Downloads all images from MinIO to a local backup folder
 * 2. Exports the database schema and data
 * 3. Creates a backup manifest with checksums
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

// Create backup directory with timestamp
const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
const BACKUP_DIR = path.join(__dirname, '..', 'backups', `backup-${timestamp}`);
const IMAGES_BACKUP_DIR = path.join(BACKUP_DIR, 'images');
const DB_BACKUP_DIR = path.join(BACKUP_DIR, 'database');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function backupDatabase() {
  console.log('\n📊 Backing up database...');
  
  try {
    // Export images table
    const imagesResult = await pool.query('SELECT * FROM images ORDER BY created_at ASC');
    const imagesJson = JSON.stringify(imagesResult.rows, null, 2);
    fs.writeFileSync(path.join(DB_BACKUP_DIR, 'images.json'), imagesJson);
    console.log(`  ✓ Exported ${imagesResult.rows.length} images to images.json`);

    // Export tags table
    const tagsResult = await pool.query('SELECT * FROM tags');
    const tagsJson = JSON.stringify(tagsResult.rows, null, 2);
    fs.writeFileSync(path.join(DB_BACKUP_DIR, 'tags.json'), tagsJson);
    console.log(`  ✓ Exported ${tagsResult.rows.length} tags to tags.json`);

    // Export image_tags table
    const imageTagsResult = await pool.query('SELECT * FROM image_tags');
    const imageTagsJson = JSON.stringify(imageTagsResult.rows, null, 2);
    fs.writeFileSync(path.join(DB_BACKUP_DIR, 'image_tags.json'), imageTagsJson);
    console.log(`  ✓ Exported ${imageTagsResult.rows.length} image-tag relations to image_tags.json`);

    // Export likes table
    const likesResult = await pool.query('SELECT * FROM likes');
    const likesJson = JSON.stringify(likesResult.rows, null, 2);
    fs.writeFileSync(path.join(DB_BACKUP_DIR, 'likes.json'), likesJson);
    console.log(`  ✓ Exported ${likesResult.rows.length} likes to likes.json`);

    return imagesResult.rows;
  } catch (error) {
    console.error('  ❌ Database backup failed:', error);
    throw error;
  }
}

async function backupImage(image, index, total) {
  try {
    console.log(`\n[${index + 1}/${total}] 📥 ${image.filename}`);
    console.log(`  Key: ${image.key}`);

    // Create directory structure matching MinIO
    const imageDir = path.dirname(path.join(IMAGES_BACKUP_DIR, image.key));
    ensureDir(imageDir);

    // Download image
    const chunks = [];
    const stream = await minioClient.getObject(MINIO_BUCKET, image.key);
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    // Calculate hash
    const hash = getFileHash(buffer);
    
    // Save to disk
    const filePath = path.join(IMAGES_BACKUP_DIR, image.key);
    fs.writeFileSync(filePath, buffer);
    
    console.log(`  ✓ Saved: ${(buffer.length / 1024).toFixed(1)} KB`);
    console.log(`  ✓ SHA256: ${hash.substring(0, 16)}...`);

    return {
      id: image.id,
      filename: image.filename,
      key: image.key,
      size: buffer.length,
      hash: hash,
      backupPath: filePath,
    };
  } catch (error) {
    console.error(`  ❌ Failed to backup ${image.filename}:`, error.message);
    return {
      id: image.id,
      filename: image.filename,
      key: image.key,
      error: error.message,
    };
  }
}

async function runBackup() {
  console.log('🔐 Starting Backup Process\n');
  console.log('=' .repeat(60));
  console.log(`\n📁 Backup Directory: ${BACKUP_DIR}\n`);
  
  try {
    // Create backup directories
    ensureDir(BACKUP_DIR);
    ensureDir(IMAGES_BACKUP_DIR);
    ensureDir(DB_BACKUP_DIR);

    // 1. Backup database
    const images = await backupDatabase();

    // 2. Backup images from MinIO
    console.log(`\n🖼️  Backing up ${images.length} images from MinIO...\n`);
    
    const manifest = {
      timestamp: new Date().toISOString(),
      totalImages: images.length,
      images: [],
      stats: {
        success: 0,
        failed: 0,
        totalSize: 0,
      },
    };

    for (let i = 0; i < images.length; i++) {
      const result = await backupImage(images[i], i, images.length);
      manifest.images.push(result);
      
      if (result.error) {
        manifest.stats.failed++;
      } else {
        manifest.stats.success++;
        manifest.stats.totalSize += result.size;
      }

      // Small delay to avoid overwhelming MinIO
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // 3. Save manifest
    const manifestPath = path.join(BACKUP_DIR, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`\n📋 Saved backup manifest: ${manifestPath}`);

    // 4. Create README
    const readme = `# Backup ${timestamp}

## Summary
- **Total Images**: ${manifest.totalImages}
- **Successfully Backed Up**: ${manifest.stats.success}
- **Failed**: ${manifest.stats.failed}
- **Total Size**: ${(manifest.stats.totalSize / 1024 / 1024).toFixed(2)} MB

## Directory Structure
- \`database/\` - Database exports (JSON format)
- \`images/\` - All MinIO images (original format)
- \`manifest.json\` - Complete backup manifest with checksums

## Restore Instructions
To restore from this backup:
1. Restore database from JSON files
2. Upload images back to MinIO
3. Verify checksums from manifest.json

## Notes
- Created: ${new Date().toLocaleString()}
- MinIO Bucket: ${MINIO_BUCKET}
- Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}
`;
    fs.writeFileSync(path.join(BACKUP_DIR, 'README.md'), readme);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Backup Complete!\n');
    console.log('📊 Summary:');
    console.log(`  Total Images:       ${manifest.totalImages}`);
    console.log(`  ✅ Success:         ${manifest.stats.success}`);
    console.log(`  ❌ Failed:          ${manifest.stats.failed}`);
    console.log(`  💾 Total Size:      ${(manifest.stats.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`\n📁 Backup Location:  ${BACKUP_DIR}`);
    console.log(`\n💡 You can now safely run the AVIF migration with:`);
    console.log(`   node scripts/migrate-to-avif.js`);
    console.log('');
  } catch (error) {
    console.error('\n❌ Backup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run backup
runBackup();
