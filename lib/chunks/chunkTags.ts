import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabaseServerClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface ChunkTag {
  id: string;
  chunk_id: string;
  tag_id: string;
  created_at: string;
}

/**
 * Helper to create an authenticated Supabase client with user session
 */
function createAuthenticatedClient(accessToken?: string) {
  if (accessToken) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }
  return null;
}

/**
 * Add tags to a chunk
 */
export async function addTagsToChunk(
  chunkId: string,
  tagIds: string[],
  accessToken?: string
): Promise<ChunkTag[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  if (tagIds.length === 0) {
    return [];
  }

  const chunkTags = tagIds.map(tagId => ({
    chunk_id: chunkId,
    tag_id: tagId,
  }));

  const { data, error } = await supabase
    .from('chunk_tags')
    .upsert(chunkTags, {
      onConflict: 'chunk_id,tag_id',
      ignoreDuplicates: false,
    })
    .select();

  if (error) {
    console.error('Error adding tags to chunk:', error);
    throw new Error(`Failed to add tags to chunk: ${error.message}`);
  }

  return (data || []) as ChunkTag[];
}

/**
 * Remove tags from a chunk
 */
export async function removeTagsFromChunk(
  chunkId: string,
  tagIds: string[],
  accessToken?: string
): Promise<void> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  if (tagIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from('chunk_tags')
    .delete()
    .eq('chunk_id', chunkId)
    .in('tag_id', tagIds);

  if (error) {
    console.error('Error removing tags from chunk:', error);
    throw new Error(`Failed to remove tags from chunk: ${error.message}`);
  }
}

/**
 * Set tags for a chunk (replaces existing tags)
 */
export async function setTagsForChunk(
  chunkId: string,
  tagIds: string[],
  accessToken?: string
): Promise<ChunkTag[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Delete existing tags
  await supabase
    .from('chunk_tags')
    .delete()
    .eq('chunk_id', chunkId);

  // Add new tags
  if (tagIds.length > 0) {
    return addTagsToChunk(chunkId, tagIds, accessToken);
  }

  return [];
}

/**
 * Get all tags for a chunk
 */
export async function getTagsForChunk(
  chunkId: string,
  accessToken?: string
): Promise<ChunkTag[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('chunk_tags')
    .select('*')
    .eq('chunk_id', chunkId);

  if (error) {
    console.error('Error getting tags for chunk:', error);
    throw new Error(`Failed to get tags for chunk: ${error.message}`);
  }

  return (data || []) as ChunkTag[];
}

/**
 * Get all chunks with a specific tag
 */
export async function getChunksWithTag(
  tagId: string,
  accessToken?: string
): Promise<string[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('chunk_tags')
    .select('chunk_id')
    .eq('tag_id', tagId);

  if (error) {
    console.error('Error getting chunks with tag:', error);
    throw new Error(`Failed to get chunks with tag: ${error.message}`);
  }

  return (data || []).map(item => item.chunk_id);
}

