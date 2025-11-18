-- Erweitere das Datenbankschema um users-Tabelle für Credentials Auth

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Tabelle (Username + gehashtes Passwort)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT UNIQUE NOT NULL,
  hashed_password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index für schnellere Username-Lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Images Tabelle (Metadaten der Bilder)
CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT NOT NULL,
  key TEXT NOT NULL,
  mime TEXT,
  size BIGINT,
  width INT,
  height INT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL
);

-- Many-to-many: Images <-> Tags
CREATE TABLE IF NOT EXISTS image_tags (
  image_id UUID REFERENCES images(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (image_id, tag_id)
);

-- Indizes für Performance
CREATE INDEX IF NOT EXISTS idx_images_uploaded_by ON images(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_images_position ON images(position);
CREATE INDEX IF NOT EXISTS idx_image_tags_image_id ON image_tags(image_id);
CREATE INDEX IF NOT EXISTS idx_image_tags_tag_id ON image_tags(tag_id);

-- Likes Tabelle (User-Likes auf Bilder)
CREATE TABLE IF NOT EXISTS likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, image_id)
);

-- Indizes für Performance
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_image_id ON likes(image_id);
CREATE INDEX IF NOT EXISTS idx_likes_created_at ON likes(created_at DESC);

