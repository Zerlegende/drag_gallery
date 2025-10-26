#!/usr/bin/env node
/**
 * Utility Script: User erstellen oder Passwort zurücksetzen
 * 
 * Verwendung:
 *   node scripts/create-user.js <username> <password> [role]
 * 
 * Beispiel:
 *   node scripts/create-user.js admin MySecurePass123 admin
 *   node scripts/create-user.js user1 pass123 user
 */

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

// DATABASE_URL aus .env laden
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function createOrUpdateUser(username, password, role = 'user') {
  try {
    // Passwort hashen (10 rounds)
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // User erstellen oder updaten
    const result = await pool.query(
      `INSERT INTO users (username, hashed_password, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) 
       DO UPDATE SET hashed_password = $2, role = $3
       RETURNING id, username, role, created_at`,
      [username, hashedPassword, role]
    );

    const user = result.rows[0];
    console.log('✅ User erfolgreich erstellt/aktualisiert:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Erstellt: ${user.created_at}`);
    
  } catch (error) {
    console.error('❌ Fehler beim Erstellen des Users:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// CLI Args parsen
const [,, username, password, role] = process.argv;

if (!username || !password) {
  console.error('Usage: node scripts/create-user.js <username> <password> [role]');
  console.error('Role: admin | user (default: user)');
  process.exit(1);
}

createOrUpdateUser(username, password, role);
