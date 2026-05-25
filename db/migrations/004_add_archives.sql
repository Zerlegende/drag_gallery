-- Archives Tabelle
CREATE TABLE IF NOT EXISTS archives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Verknüpfung von Bildern mit Archiven
ALTER TABLE images ADD COLUMN IF NOT EXISTS archive_id UUID REFERENCES archives(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_images_archive_id ON images(archive_id);
