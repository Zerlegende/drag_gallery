-- Migration: Add variant_status column to track image variant processing
-- Status values: 'pending', 'processing', 'completed', 'failed'

ALTER TABLE images 
ADD COLUMN variant_status VARCHAR(20) DEFAULT 'pending';

-- Set existing images to completed (they already have variants or don't need them)
UPDATE images SET variant_status = 'completed';

-- Add index for faster queries filtering by status
CREATE INDEX idx_images_variant_status ON images(variant_status);

-- Add index for filtering by user and status (for UI status display)
CREATE INDEX idx_images_uploaded_by_status ON images(uploaded_by, variant_status);
