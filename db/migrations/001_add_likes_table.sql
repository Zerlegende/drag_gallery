-- Migration: Add likes table
-- Created: 2025-11-18

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
