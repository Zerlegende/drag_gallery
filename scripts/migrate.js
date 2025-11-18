#!/usr/bin/env node

/**
 * Run database migrations
 * Usage: node scripts/migrate.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    const migrationFile = path.join(__dirname, '../db/migrations/001_add_likes_table.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    console.log('Running migration: 001_add_likes_table.sql');
    await client.query(sql);
    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
