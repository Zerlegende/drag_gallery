import pkg from "pg";
const { Pool } = pkg;
import { readFileSync } from "fs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  try {
    const sql = readFileSync("db/migrations/003_add_system_settings.sql", "utf8");
    
    console.log("🔄 Führe Migration 003_add_system_settings.sql aus...");
    
    await pool.query(sql);
    
    console.log("✅ Migration erfolgreich ausgeführt!");
  } catch (error) {
    console.error("❌ Fehler beim Ausführen der Migration:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
