import pkg from "pg";
const { Pool } = pkg;
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, readdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// DB-Verbindung
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigrations() {
  const migrationsDir = join(__dirname, "..", "db", "migrations");
  
  try {
    // Alle .sql Dateien im migrations-Ordner finden
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort(); // Alphabetisch sortiert

    console.log(`📦 Gefundene Migrationen: ${files.length}`);

    for (const file of files) {
      const filePath = join(migrationsDir, file);
      const sql = readFileSync(filePath, "utf8");

      console.log(`\n🔄 Führe Migration aus: ${file}`);
      
      await pool.query(sql);
      
      console.log(`✅ Migration erfolgreich: ${file}`);
    }

    console.log("\n✨ Alle Migrationen erfolgreich ausgeführt!");
  } catch (error) {
    console.error("\n❌ Fehler beim Ausführen der Migrationen:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
