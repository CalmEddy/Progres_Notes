import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabaseServerClient';
import { generateEmbedding } from '../embeddings';
import { NoteChunk } from './chunking';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface ChunkWithSimilarity extends NoteChunk {
  similarity: number;
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
 * Search chunks within a specific note using semantic similarity
 */
export async function searchChunksInNote(
  noteId: string,
  query: string,
  matchThreshold: number = 0.7,
  limit: number = 10,
  accessToken?: string
): Promise<ChunkWithSimilarity[]> {
  if (!query || query.trim().length === 0) {
    throw new Error('Search query cannot be empty');
  }

  const queryEmbedding = await generateEmbedding(query.trim());
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Use pgvector similarity search
  const { data, error } = await supabase.rpc('match_chunks_in_note', {
    p_note_id: noteId,
    p_query_embedding: queryEmbedding,
    p_match_threshold: matchThreshold,
    p_limit: limit,
  });

  if (error) {
    // If function doesn't exist, fall back to manual query
    console.warn('match_chunks_in_note function not found, using manual query:', error);
    return searchChunksInNoteManual(noteId, queryEmbedding, matchThreshold, limit, accessToken);
  }

  return (data || []) as ChunkWithSimilarity[];
}

/**
 * Manual search implementation (fallback if RPC function doesn't exist)
 */
async function searchChunksInNoteManual(
  noteId: string,
  queryEmbedding: number[],
  matchThreshold: number,
  limit: number,
  accessToken?: string
): Promise<ChunkWithSimilarity[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('note_chunks')
    .select('*')
    .eq('note_id', noteId)
    .not('embedding', 'is', null);

  if (error) {
    console.error('Error searching chunks:', error);
    throw new Error(`Failed to search chunks: ${error.message}`);
  }

  // Calculate similarity manually
  const chunks = (data || []) as NoteChunk[];
  const chunksWithSimilarity: ChunkWithSimilarity[] = chunks
    .filter(chunk => chunk.embedding && chunk.embedding.length > 0)
    .map(chunk => {
      const similarity = calculateCosineSimilarity(chunk.embedding as number[], queryEmbedding);
      return {
        ...chunk,
        similarity,
      };
    })
    .filter(chunk => chunk.similarity >= matchThreshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return chunksWithSimilarity;
}

/**
 * Theme-aware semantic search: find notes with similar themes, then search chunks
 */
export async function searchChunksWithTheme(
  query: string,
  matchThreshold: number = 0.7,
  themeLimit: number = 20,
  chunkLimit: number = 10,
  accessToken?: string
): Promise<Array<ChunkWithSimilarity & { theme_label: string | null; theme_similarity: number }>> {
  if (!query || query.trim().length === 0) {
    throw new Error('Search query cannot be empty');
  }

  const queryEmbedding = await generateEmbedding(query.trim());
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Stage 1: Find similar themes
  const { data: themes, error: themesError } = await supabase
    .from('note_themes')
    .select('note_id, theme_label, centroid_embedding')
    .not('centroid_embedding', 'is', null);

  if (themesError) {
    console.error('Error fetching themes:', themesError);
    throw new Error(`Failed to fetch themes: ${themesError.message}`);
  }

  // Calculate theme similarities
  const themesWithSimilarity = (themes || [])
    .filter(theme => theme.centroid_embedding && Array.isArray(theme.centroid_embedding))
    .map(theme => {
      const similarity = calculateCosineSimilarity(
        theme.centroid_embedding as number[],
        queryEmbedding
      );
      return {
        ...theme,
        theme_similarity: similarity,
      };
    })
    .sort((a, b) => b.theme_similarity - a.theme_similarity)
    .slice(0, themeLimit);

  if (themesWithSimilarity.length === 0) {
    return [];
  }

  const topNoteIds = themesWithSimilarity.map(t => t.note_id);

  // Stage 2: Search chunks in top notes
  const { data: chunks, error: chunksError } = await supabase
    .from('note_chunks')
    .select('*, note_themes!inner(theme_label)')
    .in('note_id', topNoteIds)
    .not('embedding', 'is', null)
    .limit(chunkLimit * 2); // Get more to filter by similarity

  if (chunksError) {
    console.error('Error fetching chunks:', chunksError);
    throw new Error(`Failed to fetch chunks: ${chunksError.message}`);
  }

  // Calculate chunk similarities and combine with theme info
  const chunksWithSimilarity = (chunks || [])
    .filter(chunk => chunk.embedding && Array.isArray(chunk.embedding))
    .map(chunk => {
      const similarity = calculateCosineSimilarity(
        chunk.embedding as number[],
        queryEmbedding
      );
      const theme = themesWithSimilarity.find(t => t.note_id === chunk.note_id);
      return {
        ...chunk,
        similarity,
        theme_label: theme?.theme_label || null,
        theme_similarity: theme?.theme_similarity || 0,
      };
    })
    .filter(chunk => chunk.similarity >= matchThreshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, chunkLimit);

  return chunksWithSimilarity as Array<ChunkWithSimilarity & { theme_label: string | null; theme_similarity: number }>;
}

/**
 * Search chunks with user tags
 */
export async function searchChunksWithTags(
  query: string,
  tagIds: string[],
  matchThreshold: number = 0.7,
  limit: number = 10,
  accessToken?: string
): Promise<ChunkWithSimilarity[]> {
  if (!query || query.trim().length === 0) {
    throw new Error('Search query cannot be empty');
  }

  if (tagIds.length === 0) {
    throw new Error('At least one tag ID is required');
  }

  const queryEmbedding = await generateEmbedding(query.trim());
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Step 1: Get chunk IDs with tags (relational filter)
  const { data: taggedChunks, error: tagsError } = await supabase
    .from('chunk_tags')
    .select('chunk_id')
    .in('tag_id', tagIds);

  if (tagsError) {
    console.error('Error fetching tagged chunks:', tagsError);
    throw new Error(`Failed to fetch tagged chunks: ${tagsError.message}`);
  }

  const chunkIds = Array.from(new Set((taggedChunks || []).map(item => item.chunk_id)));

  if (chunkIds.length === 0) {
    return [];
  }

  // Step 2: ANN search on filtered chunks
  const { data: chunks, error: chunksError } = await supabase
    .from('note_chunks')
    .select('*')
    .in('id', chunkIds)
    .not('embedding', 'is', null)
    .limit(limit * 2); // Get more to filter by similarity

  if (chunksError) {
    console.error('Error fetching chunks:', chunksError);
    throw new Error(`Failed to fetch chunks: ${chunksError.message}`);
  }

  // Calculate similarities and filter
  const chunksWithSimilarity = (chunks || [])
    .filter(chunk => chunk.embedding && Array.isArray(chunk.embedding))
    .map(chunk => {
      const similarity = calculateCosineSimilarity(
        chunk.embedding as number[],
        queryEmbedding
      );
      return {
        ...chunk,
        similarity,
      };
    })
    .filter(chunk => chunk.similarity >= matchThreshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return chunksWithSimilarity as ChunkWithSimilarity[];
}

/**
 * Calculate cosine similarity between two embeddings
 */
function calculateCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

