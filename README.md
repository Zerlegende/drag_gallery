# bz_bilder_collector — Installierbare Web‑App zur Bildverwaltung

Kurzbeschreibung
-----------------
Eine PWA‑Webanwendung zur interaktiven Verwaltung von Bildern: Upload per Drag & Drop, Tags, Filter, Suche und eine Galerie mit Drag‑&‑Drop‑Sortierung. Zielplattform: Railway (Postgres + MinIO auf Railway). Keine externen Dienste außer dem eigenen MinIO auf Railway.

Tech Stack
----------
- Next.js (App Router)
- Tailwind CSS + shadcn/ui
- dnd‑kit (Drag & Drop)
- react‑dropzone (Upload UI)
- PostgreSQL (Railway Add‑on) — Metadaten & Tags
- MinIO (S3‑kompatibel) auf Railway + Volume — Bildspeicher
- PWA (installierbar) — next‑pwa / Service Worker
- Auth.js (E‑Mail / OAuth)

MVP Features
------------
- Bilder hochladen (Drag & Drop, client → presigned URL → direkt zu MinIO)
- Tags hinzufügen, filtern und kombinieren
- Galerie: Grid‑Ansicht, Drag & Drop für Sortierung
- Klick auf ein Bild → Detail‑Ansicht / größeres Vorschaubild
- PWA: installierbar, fullscreen, Offline‑Cache für UI und bereits geladene Bilder

Technische Anforderungen (konkret)
---------------------------------
- PWA manifest + Service Worker (z. B. next‑pwa)
- Offline‑Caching (UI assets + Runtime caching der geladenen Bilder)
- ENV‑Variablen für MinIO, DB, Auth etc. (siehe unten)
- Next.js API Route für Presigned Uploads (`app/api/upload/route.ts`)
- SQL Tabellen: `images`, `tags`, `image_tags` (m:n)

Datenbankschema (beispielhaft)
-----------------------------
-- images: Metadaten der Bilder
CREATE TABLE images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  key TEXT NOT NULL, -- S3/MinIO Objektkey
  mime TEXT,
  size BIGINT,
  width INT,
  height INT,
  uploaded_by UUID, -- user id
  created_at TIMESTAMPTZ DEFAULT now()
);

-- tags
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

-- many-to-many
CREATE TABLE image_tags (
  image_id UUID REFERENCES images(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (image_id, tag_id)
);

Wichtige ENV‑Variablen (Beispiel / `.env.example`)
------------------------------------------------
- DATABASE_URL=postgres://user:pass@host:port/dbname
- MINIO_ENDPOINT=https://minio.example.com
- MINIO_BUCKET=bz-bilder
- MINIO_ACCESS_KEY=...
- MINIO_SECRET_KEY=...
- MINIO_REGION=us-east-1
- NEXTAUTH_URL=https://your-app.example.com
- NEXTAUTH_SECRET=...
- NEXT_PUBLIC_APP_NAME=BZ Bilder Collector
- NEXT_PUBLIC_MINIO_BUCKET=bz-bilder

Hinweise zu Presigned Upload Flow
---------------------------------
1. Client (browser) sendet Metadaten / Dateiinfo an `app/api/upload/route.ts` (auth vorausgesetzt).
2. Server erzeugt einen presigned PUT URL (MinIO/S3) und gibt URL + objectKey zurück.
3. Client lädt die Datei direkt an MinIO (PUT) — reduziert Server‑Traffic.
4. Nach Erfolg ruft Client eine weitere API (z. B. `app/api/images`) zum Persistieren der Metadaten auf (key, filename, size, mime, tags).

Implementierungs‑Tipps
----------------------
- Verwende `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` oder `minio` client, um presigned URLs zu erzeugen.
- Validiere Dateityp und -größe serverseitig in der Upload‑Route (limitieren, checken des MIME‑Typs).
- MinIO auf Railway benötigt ein dazugehöriges Volume; setze `MINIO_BUCKET` und Zugangsvariablen in Railway.
- Verwende `next-pwa` für Service Worker + runtime caching. Konfiguriere Workbox für Bilder (StaleWhileRevalidate) und UI‑Assets (CacheFirst mit Versionierung).
- Auth mit `next-auth` (Auth.js): E‑Mail / OAuth Provider; protecte Upload/Write‑Routen.

PWA / Offline
-------------
- Manifest: `name`, `short_name`, `icons`, `start_url`, `display: fullscreen`.
- Service Worker: Cache UI (build assets) + Runtime cache für bereits geladene Bilder.
- Offline: Zeige gecachte Bildkacheln; blockiere Uploads offline oder queue sie für später (optional).

Railway Deployment Hinweise
---------------------------
- Add Postgres als Railway Add‑on; setze `DATABASE_URL` automatisch.
- MinIO: entweder Railway Marketplace oder Docker Container mit attached volume. Setze `MINIO_*` ENV vars in Railway.
- Build: Next.js wird auf Railway als Node.js App gebaut. Stelle sicher, dass die `NEXTAUTH_URL` auf die produzierte URL zeigt.

Development (lokal)
-------------------
Voraussetzung: Node >= 18 empfohlen

PowerShell Beispiel:
```powershell
npm install
cp .env.example .env
# .env ausfüllen
npm run dev
```

Deployment
----------
- `npm run build` → `npm run start` (in Railway konfigurieren)
- Setze alle ENV Variablen auf Railway und richte MinIO‑Volume ein.

Sicherheit & Skalierung
-----------------------
- Presigned URLs haben kurze TTL (z. B. 5–15 Minuten).
- Limit Upload‑Größe und erlaubte MIME‑Typen.
- Rechte: nur authentifizierte Nutzer dürfen Uploads / Metadaten anlegen.
- Optional: Bildverarbeitung (Thumbs, WebP) via Background Job / Serverless Function.

Optionale Erweiterungen (nach MVP)
----------------------------------
- EXIF‑Metadaten auslesen und anzeigen
- Autosuggest / Tag‑Recommendation (asynchron, ML oder heuristisch)
- Batch‑Operations: Bulk‑Tagging, Bulk‑Delete
- Image transforms (crop, rotate, thumbnails) auf Upload oder on‑the‑fly

Contributing
------------
- Issues / PRs willkommen. Beschreibe bitte Bug, Repro‑Schritte und gewünschtes Verhalten.

License
-------
MIT — siehe `LICENSE` (falls gewünscht).

Kontakt
-------
Fragen / Wünsche bitte per Issue im Repository stellen.
