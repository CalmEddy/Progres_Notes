-- Add search collection support to collections table
-- This enables collections to be dynamic search queries that execute when opened

-- Add is_search_collection flag
ALTER TABLE collections 
  ADD COLUMN IF NOT EXISTS is_search_collection boolean DEFAULT false NOT NULL;

-- Add search_criteria JSONB column to store search parameters
ALTER TABLE collections 
  ADD COLUMN IF NOT EXISTS search_criteria jsonb;

-- Create index on is_search_collection for faster filtering
CREATE INDEX IF NOT EXISTS collections_is_search_collection_idx 
  ON collections(is_search_collection) 
  WHERE is_search_collection = true;

-- Add constraint: search collections must have search_criteria
ALTER TABLE collections
  ADD CONSTRAINT search_collection_requires_criteria CHECK (
    (is_search_collection = false) OR 
    (is_search_collection = true AND search_criteria IS NOT NULL)
  );

