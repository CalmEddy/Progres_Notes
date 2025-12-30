-- ============================================================================
-- Phase 1: Collections Schema + Chunk Stability
-- ============================================================================

-- Add chunk stability columns to note_chunks
ALTER TABLE note_chunks 
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

-- Create index for hash-based lookups
CREATE INDEX IF NOT EXISTS note_chunks_content_hash_idx 
  ON note_chunks(note_id, content_hash) 
  WHERE deleted_at IS NULL;

-- Create index for soft-delete filtering
CREATE INDEX IF NOT EXISTS note_chunks_deleted_at_idx 
  ON note_chunks(deleted_at) 
  WHERE deleted_at IS NOT NULL;

-- Collections table
CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  position integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS collections_user_id_idx ON collections(user_id);
CREATE INDEX IF NOT EXISTS collections_user_position_idx ON collections(user_id, position);

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS update_collections_updated_at ON collections;
CREATE TRIGGER update_collections_updated_at
  BEFORE UPDATE ON collections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS for collections
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own collections" ON collections;
CREATE POLICY "Users can view own collections"
  ON collections FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own collections" ON collections;
CREATE POLICY "Users can insert own collections"
  ON collections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own collections" ON collections;
CREATE POLICY "Users can update own collections"
  ON collections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own collections" ON collections;
CREATE POLICY "Users can delete own collections"
  ON collections FOR DELETE
  USING (auth.uid() = user_id);

-- Collection binder items table
CREATE TABLE IF NOT EXISTS collection_binder_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  collection_id uuid REFERENCES collections(id) ON DELETE CASCADE NOT NULL,
  parent_id uuid REFERENCES collection_binder_items(id) ON DELETE CASCADE,
  position integer DEFAULT 0 NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('folder', 'chunk_ref')),
  title text, -- For folders and optional chunk labels
  chunk_id uuid REFERENCES note_chunks(id) ON DELETE SET NULL, -- Only for chunk_ref
  is_muted boolean DEFAULT false NOT NULL,
  trashed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT chunk_ref_requires_chunk_id CHECK (
    (item_type = 'chunk_ref' AND chunk_id IS NOT NULL) OR
    (item_type = 'folder' AND chunk_id IS NULL)
  )
);

-- Indexes for collection_binder_items
CREATE INDEX IF NOT EXISTS collection_binder_items_user_id_idx 
  ON collection_binder_items(user_id);
CREATE INDEX IF NOT EXISTS collection_binder_items_collection_id_idx 
  ON collection_binder_items(collection_id);
CREATE INDEX IF NOT EXISTS collection_binder_items_parent_position_idx 
  ON collection_binder_items(collection_id, parent_id, position) 
  WHERE trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS collection_binder_items_chunk_id_idx 
  ON collection_binder_items(chunk_id) 
  WHERE chunk_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS collection_binder_items_trashed_at_idx 
  ON collection_binder_items(trashed_at) 
  WHERE trashed_at IS NOT NULL;

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS update_collection_binder_items_updated_at ON collection_binder_items;
CREATE TRIGGER update_collection_binder_items_updated_at
  BEFORE UPDATE ON collection_binder_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS for collection_binder_items
ALTER TABLE collection_binder_items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view binder items for their own collections
-- AND only if chunk_id references a chunk from their own notes
DROP POLICY IF EXISTS "Users can view own collection binder items" ON collection_binder_items;
CREATE POLICY "Users can view own collection binder items"
  ON collection_binder_items FOR SELECT
  USING (
    auth.uid() = user_id AND
    (
      chunk_id IS NULL OR
      EXISTS (
        SELECT 1 FROM note_chunks nc
        JOIN notes n ON nc.note_id = n.id
        WHERE nc.id = collection_binder_items.chunk_id
          AND n.user_id = auth.uid()
      )
    )
  );

-- Policy: Users can insert binder items for their own collections
DROP POLICY IF EXISTS "Users can insert own collection binder items" ON collection_binder_items;
CREATE POLICY "Users can insert own collection binder items"
  ON collection_binder_items FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM collections WHERE id = collection_id AND user_id = auth.uid()) AND
    (
      chunk_id IS NULL OR
      EXISTS (
        SELECT 1 FROM note_chunks nc
        JOIN notes n ON nc.note_id = n.id
        WHERE nc.id = collection_binder_items.chunk_id
          AND n.user_id = auth.uid()
      )
    )
  );

-- Policy: Users can update their own binder items
DROP POLICY IF EXISTS "Users can update own collection binder items" ON collection_binder_items;
CREATE POLICY "Users can update own collection binder items"
  ON collection_binder_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id AND
    (
      chunk_id IS NULL OR
      EXISTS (
        SELECT 1 FROM note_chunks nc
        JOIN notes n ON nc.note_id = n.id
        WHERE nc.id = collection_binder_items.chunk_id
          AND n.user_id = auth.uid()
      )
    )
  );

-- Policy: Users can delete their own binder items
DROP POLICY IF EXISTS "Users can delete own collection binder items" ON collection_binder_items;
CREATE POLICY "Users can delete own collection binder items"
  ON collection_binder_items FOR DELETE
  USING (auth.uid() = user_id);

