#!/usr/bin/env node

/**
 * Restore Script: Restore from backup
 * 
 * Usage: node scripts/restore-from-backup.js [backup-directory]
 * Example: node scripts/restore-from-backup.js backups/backup-2025-11-18T14-30-00
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

const Minio = require('minio');
const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT.replace('https://', '').replace('http://', ''),
  port: MINIO_ENDPOINT.startsWith('https') ? 443 : 80,
  useSSL: MINIO_ENDPOINT.startsWith('https'),
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

function getFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function restoreDatabase(backupDir) {
  console.log('\n📊 Restoring database...');
  
  try {
    const dbDir = path.join(backupDir, 'database');
    
    // Read backup files
    const images = JSON.parse(fs.readFileSync(path.join(dbDir, 'images.json'), 'utf8'));
    const tags = JSON.parse(fs.readFileSync(path.join(dbDir, 'tags.json'), 'utf8'));
    const imageTags = JSON.parse(fs.readFileSync(path.join(dbDir, 'image_tags.json'), 'utf8'));
    const likes = JSON.parse(fs.readFileSync(path.join(dbDir, 'likes.json'), 'utf8'));

    // Clear existing data (DANGEROUS!)
    console.log('  ⚠️  Clearing existing data...');
    await pool.query('TRUNCATE image_tags, likes, images, tags CASCADE');
    
    // Restore images
    for (const img of images) {
      await pool.query(
        `INSERT INTO images (id, filename, key, mime, size, width, height, uploaded_by, position, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [img.id, img.filename, img.key, img.mime, img.size, img.width, img.height, img.uploaded_by, img.position, img.created_at]
      );
    }
    console.log(`  ✓ Restored ${images.length} images`);

    // Restore tags
    for (const tag of tags) {
      await pool.query(
        `INSERT INTO tags (id, name) VALUES ($1, $2)`,
        [tag.id, tag.name]
      );
    }
    console.log(`  ✓ Restored ${tags.length} tags`);

    // Restore image_tags
    for (const it of imageTags) {
      await pool.query(
        `INSERT INTO image_tags (image_id, tag_id) VALUES ($1, $2)`,
        [it.image_id, it.tag_id]
      );
    }
    console.log(`  ✓ Restored ${imageTags.length} image-tag relations`);

    // Restore likes
    for (const like of likes) {
      await pool.query(
        `INSERT INTO likes (id, user_id, image_id, created_at) VALUES ($1, $2, $3, $4)`,
        [like.id, like.user_id, like.image_id, like.created_at]
      );
    }
    console.log(`  ✓ Restored ${likes.length} likes`);

    return images;
  } catch (error) {
    console.error('  ❌ Database restore failed:', error);
    throw error;
  }
}

async function restoreImage(imageInfo, backupDir, index, total) {
  try {
    console.log(`\n[${index + 1}/${total}] 📤 ${imageInfo.filename}`);
    
    // Read file from backup
    const filePath = path.join(backupDir, 'images', imageInfo.key);
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠️  File not found in backup: ${filePath}`);
      return { status: 'skipped', reason: 'not_in_backup' };
    }
    
    const buffer = fs.readFileSync(filePath);
    
    // Verify hash if available
    if (imageInfo.hash) {
      const hash = getFileHash(buffer);
      if (hash !== imageInfo.hash) {
        console.log(`  ⚠️  Hash mismatch! Expected: ${imageInfo.hash}, Got: ${hash}`);
        return { status: 'error', reason: 'hash_mismatch' };
      }
    }
    
    // Upload to MinIO
    await minioClient.putObject(
      MINIO_BUCKET,
      imageInfo.key,
      buffer,
      buffer.length,
      {
        'Content-Type': imageInfo.mime || 'application/octet-stream',
      }
    );
    
    console.log(`  ✓ Restored: ${(buffer.length / 1024).toFixed(1)} KB`);
    return { status: 'success', size: buffer.length };
  } catch (error) {
    console.error(`  ❌ Failed to restore ${imageInfo.filename}:`, error.message);
    return { status: 'error', error: error.message };
  }
}

async function runRestore() {
  const backupDir = process.argv[2];
  
  if (!backupDir) {
    console.error('❌ Error: Please provide backup directory path');
    console.log('\nUsage: node scripts/restore-from-backup.js <backup-directory>');
    console.log('Example: node scripts/restore-from-backup.js backups/backup-2025-11-18T14-30-00');
    process.exit(1);
  }

  const fullBackupPath = path.isAbsolute(backupDir) 
    ? backupDir 
    : path.join(__dirname, '..', backupDir);

  if (!fs.existsSync(fullBackupPath)) {
    console.error(`❌ Error: Backup directory not found: ${fullBackupPath}`);
    process.exit(1);
  }

  console.log('⚠️  WARNING: This will OVERWRITE all current data!');
  console.log(`📁 Restoring from: ${fullBackupPath}\n`);
  console.log('Press Ctrl+C within 5 seconds to cancel...');
  
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('\n🔄 Starting Restore Process\n');
  console.log('=' .repeat(60));

  try {
    // Read manifest
    const manifest = JSON.parse(fs.readFileSync(path.join(fullBackupPath, 'manifest.json'), 'utf8'));
    console.log(`\n📋 Backup created: ${manifest.timestamp}`);
    console.log(`   Total images: ${manifest.totalImages}`);

    // 1. Restore database
    await restoreDatabase(fullBackupPath);

    // 2. Restore images to MinIO
    console.log(`\n🖼️  Restoring ${manifest.images.length} images to MinIO...\n`);
    
    const stats = {
      success: 0,
      skipped: 0,
      errors: 0,
    };

    for (let i = 0; i < manifest.images.length; i++) {
      const imageInfo = manifest.images[i];
      const result = await restoreImage(imageInfo, fullBackupPath, i, manifest.images.length);
      
      if (result.status === 'success') stats.success++;
      else if (result.status === 'skipped') stats.skipped++;
      else stats.errors++;

      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Restore Complete!\n');
    console.log('📊 Summary:');
    console.log(`  Total Images:       ${manifest.images.length}`);
    console.log(`  ✅ Success:         ${stats.success}`);
    console.log(`  ⏭️  Skipped:         ${stats.skipped}`);
    console.log(`  ❌ Errors:          ${stats.errors}`);
    console.log('');
  } catch (error) {
    console.error('\n❌ Restore failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runRestore();
