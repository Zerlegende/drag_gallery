# Drag Gallery

Eine installierbare Web-App (PWA) zur Bildverwaltung mit Drag & Drop, Tagging und Galerie-Ansichten. Gebaut mit Next.js, Postgres und S3-kompatibler Objektspeicherung.

---

## Features im Überblick

### Drag & Drop Tag-Zuweisung

Bilder per Drag & Drop auf Tags ziehen, um sie zuzuordnen — einzeln oder als Batch-Auswahl.

<!-- TODO: GIF aufnehmen -->
![Drag & Drop Demo](docs/gifs/drag-and-drop.gif)

---

### Upload per Dropzone

Dateien einfach irgendwo auf die Seite ziehen — ein Fullscreen-Overlay öffnet sich und der Upload startet. Vorschau-Thumbnails, Duplikaterkennung und automatische AVIF-Konvertierung inklusive.

<!-- TODO: GIF aufnehmen -->
![Upload Dropzone Demo](docs/gifs/upload-dropzone.gif)

---

### Insta Mode

Fullscreen-Ansicht im Instagram-Stil: Bilder durchswipen, per Doppeltipp liken (mit Herz-Animation), Like-Zähler und Liker-Avatare sehen.

<!-- TODO: GIF aufnehmen -->
![Insta Mode Demo](docs/gifs/insta-mode.gif)

---

### Tag-Filter & Suche

Tags als Badges anklicken, Textsuche über Titel und Tags, Filter für ungetaggte Bilder — alles kombinierbar.

<!-- TODO: GIF aufnehmen -->
![Tag Filter Demo](docs/gifs/tag-filter.gif)

---

### Bilddetail mit Inline-Bearbeitung

Bild anklicken → Dialog mit voller Auflösung, editierbarem Namen und Tag-Autocomplete.

<!-- TODO: GIF aufnehmen -->
![Image Detail Demo](docs/gifs/image-detail.gif)

---

### Grid-Layout anpassen

Zwischen drei Dichte-Stufen wechseln, Bilder pro Seite einstellen und nach Datum oder Name sortieren.

<!-- TODO: GIF aufnehmen -->
![Grid Layout Demo](docs/gifs/grid-layout.gif)

---

## Tech Stack

| Bereich | Technologie |
|---|---|
| Framework | Next.js (App Router), TypeScript, React 19 |
| Styling | Tailwind CSS, shadcn/ui, Radix Primitives |
| Drag & Drop | @dnd-kit |
| Datenbank | PostgreSQL |
| Objektspeicher | MinIO / S3-kompatibel (Presigned Uploads) |
| Auth | Auth.js (NextAuth) — Credentials + optional GitHub |
| PWA | next-pwa, Service Worker, Manifest |

## Erste Schritte

```bash
npm install
cp .env.example .env   # anpassen
npm run dev
```

> Benötigt Node.js ≥ 18.

### User anlegen

```bash
node scripts/create-user.js admin MySecurePass123
```

## Projektstruktur

```
src/
├── app/           # Pages, API-Routen, Auth
├── components/    # Gallery, UI-Komponenten, Admin
├── lib/           # DB, Storage, Auth, Utilities
├── styles/        # Tailwind importieren, Basis Styles
└── types/         # TypeScript-Definitionen
```

