-- Content-Hash (SHA-256 des Originals, hex) für echte Duplikaterkennung.
-- Wird beim Upload vom Client mitgeschickt; fehlt er, holt ihn die
-- Variant-Pipeline serverseitig nach.
-- TEXT statt CHAR(64): bpchar würde beim Vergleich mit text[] gecastet werden
-- und den Index nicht sauber nutzen. Die Länge erzwingt ohnehin die API.
ALTER TABLE images ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Bewusst kein UNIQUE: dasselbe Bild darf z.B. in mehreren Archiven liegen,
-- und der User kann ein erkanntes Duplikat trotzdem hochladen.
CREATE INDEX IF NOT EXISTS idx_images_content_hash ON images(content_hash);
