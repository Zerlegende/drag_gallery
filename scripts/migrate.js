#!/usr/bin/env node

/**
 * Run all database migrations
 * Usage: node scripts/migrate.js
 * 
 * Migrations are executed in alphabetical order from db/migrations/
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigrations() {
  const client = await pool.connect();
  const migrationsDir = path.join(__dirname, '../db/migrations');
  
  try {
    // Get all SQL files in migrations folder, sorted alphabetically
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }
    
    console.log(`Found ${files.length} migration(s):\n`);
    
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      console.log(`Running: ${file}`);
      await client.query(sql);
      console.log(`  ✅ Done\n`);
    }
    
    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
