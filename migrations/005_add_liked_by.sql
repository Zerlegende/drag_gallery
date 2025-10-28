-- Migration: Create likes table for many-to-many relationship between users and images
-- This allows multiple users to like multiple images efficiently

CREATE TABLE IF NOT EXISTS likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  image_id UUID NOT NULL REFERENCES images(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure a user can only like an image once
  UNIQUE(user_id, image_id)
);

-- Index for finding all likes by a specific user
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);

-- Index for finding all likes for a specific image
CREATE INDEX IF NOT EXISTS idx_likes_image_id ON likes(image_id);

-- Composite index for checking if a specific user liked a specific image
CREATE INDEX IF NOT EXISTS idx_likes_user_image ON likes(user_id, image_id);
