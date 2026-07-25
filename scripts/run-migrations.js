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

/**
 * Fehlercodes, die bedeuten "gibt es schon". Die Migrationen hier sind rein
 * additiv (Spalten, Tabellen, Indizes), deshalb heißt so ein Fehler: die
 * Migration wurde bereits angewendet, bevor es die Nachverfolgung gab.
 */
const ALREADY_APPLIED_CODES = new Set([
  "42701", // duplicate_column
  "42P07", // duplicate_table (schließt Indizes ein)
  "42710", // duplicate_object
  "42P16", // invalid_table_definition (z.B. doppelter PRIMARY KEY)
]);

async function runMigrations() {
  const migrationsDir = join(__dirname, "..", "db", "migrations");
  const client = await pool.connect();

  try {
    // Nachverfolgung, welche Migration schon gelaufen ist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    const { rows } = await client.query("SELECT filename FROM schema_migrations");
    const applied = new Set(rows.map((row) => row.filename));

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort(); // Alphabetisch sortiert

    console.log(`📦 Gefundene Migrationen: ${files.length}`);

    let executed = 0;
    let skipped = 0;

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`⏭️  Bereits angewendet: ${file}`);
        skipped++;
        continue;
      }

      const sql = readFileSync(join(migrationsDir, file), "utf8");
      console.log(`\n🔄 Führe Migration aus: ${file}`);

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
          [file],
        );
        await client.query("COMMIT");
        console.log(`✅ Migration erfolgreich: ${file}`);
        executed++;
      } catch (error) {
        await client.query("ROLLBACK");

        if (!ALREADY_APPLIED_CODES.has(error.code)) throw error;

        // Bestandsdatenbank: die Migration lief schon, nur ohne Eintrag.
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
          [file],
        );
        console.log(`⏭️  Struktur existiert bereits, als angewendet vermerkt: ${file}`);
        skipped++;
      }
    }

    console.log(`\n✨ Fertig – ${executed} ausgeführt, ${skipped} übersprungen.`);
  } catch (error) {
    console.error("\n❌ Fehler beim Ausführen der Migrationen:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
