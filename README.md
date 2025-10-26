# bz_bilder_collector — Installierbare Web‑App zur Bildverwaltung

Eine Progressive Web App (PWA) zum Verwalten, Taggen und Filtern von Bildern. Die Anwendung ist für eine Bereitstellung auf Railway optimiert und nutzt dort Postgres für Metadaten sowie MinIO (S3-kompatibel) für die Speicherung von Bilddateien. Dank Presigned Uploads werden Dateien direkt vom Browser an MinIO gesendet – der Next.js-Server bleibt schlank und dient als Kontroll- und Metadaten-Layer.

## Highlights

- **Next.js 14 (App Router)** mit TypeScript und Server Components.
- **Tailwind CSS + shadcn/ui** für ein flexibles, dunkles UI-Design.
- **Drag & Drop Galerie** via `@dnd-kit` inklusive Sortierung und Filter nach Tags.
- **Upload-Flow mit Presigned S3 URLs** (`react-dropzone`) und anschließender Persistierung der Metadaten in Postgres.
- **Auth.js (NextAuth)** mit GitHub- und E-Mail-Provider; Middleware schützt Upload- und Mutationsrouten.
- **PWA Ready** dank `next-pwa`, Manifest und Service Worker (installierbar, offlinefähig für Assets).
- **Postgres Schema** mit `images`, `tags` und `image_tags` (m:n) – inkl. API-Routen für Upload, Tagging, Reordering und Abfragen.

## Erste Schritte (lokal)

```bash
# Abhängigkeiten installieren
yarn install # oder npm install / pnpm install

# .env Beispiel übernehmen und anpassen
cp .env.example .env

# Next.js Entwicklung starten
yarn dev
```

> **Hinweis:** Im Container wurden keine Abhängigkeiten installiert. Für lokale Tests bitte die Abhängigkeiten mit npm, pnpm oder yarn installieren. Next.js benötigt Node.js ≥ 18.

## Wichtige ENV-Variablen

| Variable | Beschreibung |
| --- | --- |
| `DATABASE_URL` | Postgres Verbindung (Railway Add-on). |
| `MINIO_ENDPOINT` / `MINIO_BUCKET` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | MinIO Konfiguration auf Railway. |
| `NEXT_PUBLIC_MINIO_BASE_URL` | Öffentliche URL, unter der Objekte erreichbar sind (`https://…/bucket`). |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | NextAuth-Setup (Secret, Basis-URL der App). |
| `EMAIL_*`, `GITHUB_*` | Provider-Credentials für Auth.js. |
| `NEXT_PUBLIC_APP_NAME` | Anzeigename der Anwendung. |

Siehe `.env.example` für eine vollständige Vorlage.

## Datenbank

SQL-Definition der benötigten Tabellen (z. B. via `psql` ausführen):

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT NOT NULL,
  key TEXT NOT NULL,
  mime TEXT,
  size BIGINT,
  width INT,
  height INT,
  uploaded_by UUID,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS image_tags (
  image_id UUID REFERENCES images(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (image_id, tag_id)
);
```

## Architekturüberblick

- `src/app/page.tsx` – Server Component, lädt Bilder + Tags und übergibt sie an den Client.
- `src/components/gallery/*` – Client-Komponenten für Upload, Grid, Detail-Dialog und Tagfilter.
- `src/app/api/*` – REST-Endpoints für Upload (Presigned URL), Metadaten, Reordering und Tagliste.
- `src/lib/db.ts` – Postgres Utility mit Connection Pool und Helferfunktionen.
- `src/lib/storage.ts` – MinIO/S3 Presigned Post Helper.
- `src/lib/auth.ts` – Auth.js Konfiguration (GitHub + E-Mail Provider).
- `public/manifest.json` & `next.config.mjs` – PWA Konfiguration (Workbox Caching). 

## Deployment auf Railway

1. **Services bereitstellen:**
   - Node.js Service für Next.js App.
   - Railway Postgres Add-on; `DATABASE_URL` wird automatisch gesetzt.
   - Separater MinIO-Service (Docker/Marketplace) mit persistentem Volume.
2. **Environment Variablen** für App, Postgres und MinIO hinterlegen (siehe oben).
3. **Build & Start Commands:**
   - Build: `npm run build`
   - Start: `npm run start`
4. **Domains & Auth:** `NEXTAUTH_URL` auf die Railway-Domain setzen. Für GitHub-Login OAuth-App konfigurieren.

## Weitere Ideen

- EXIF-Parsing und Anzeige ergänzen.
- Automatische Tag-Vorschläge (z. B. ML-Modelle, Vision APIs).
- Hintergrundjobs für Thumbnails/WebP-Konvertierung.
- Offline-Warteschlange für Uploads in Service Worker integrieren.

## Lizenz

MIT (optional anpassbar). Beiträge sind willkommen!
