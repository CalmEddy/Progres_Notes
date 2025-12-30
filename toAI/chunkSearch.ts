import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabaseServerClient';
import { generateEmbedding } from '../embeddings';
import { NoteChunk } from './chunking';
import { Note } from '../notes';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface ChunkWithSimilarity extends NoteChunk {
  similarity: number;
}

export interface NoteWithChunkMatches {
  note: Note;
  bestChunkSimilarity: number;
  matchingChunksCount: number;
  chunkIds: string[];
  bestChunkText?: string;
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
 * Search chunks across all user notes and aggregate by note
 * Returns notes that contain matching chunks, ranked by best chunk similarity
 * This provides more precise semantic search than note-level embeddings
 */
export async function searchChunksAcrossNotes(
  userId: string,
  query: string,
  matchThreshold: number = 0.7,
  limit: number = 20,
  accessToken?: string
): Promise<NoteWithChunkMatches[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  // Generate embedding for the search query
  const queryEmbedding = await generateEmbedding(query.trim());

  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // First, check if chunks exist with embeddings for this user
  // We need to join with notes to filter by user_id due to RLS
  const { data: chunkCheck, error: chunkCheckError } = await supabase
    .from('note_chunks')
    .select('id, note_id, notes!inner(user_id)')
    .not('embedding', 'is', null)
    .eq('notes.user_id', userId)
    .limit(1);

  const hasChunks = chunkCheck && chunkCheck.length > 0;
  console.log('🔍 [CHUNK SEARCH] Chunk check:', {
    hasChunksWithEmbeddings: hasChunks,
    chunkCheckError: chunkCheckError ? {
      code: chunkCheckError.code,
      message: chunkCheckError.message,
    } : null,
    userId,
    query,
    matchThreshold,
    chunkCount: chunkCheck?.length || 0,
    sampleChunks: chunkCheck?.slice(0, 2).map(c => ({
      chunkId: c.id,
      noteId: c.note_id,
    })),
  });

  if (!hasChunks && !chunkCheckError) {
    console.error('⚠️ CRITICAL: No chunks with embeddings found for user!', {
      userId,
      query,
      suggestion: 'Run the backfill script to generate chunk embeddings: npm run backfill-chunks or ts-node scripts/backfillChunks.ts',
    });
  }

  // Use the PostgreSQL function for chunk-level search
  console.log('🔍 [CHUNK SEARCH] Calling RPC function match_chunks_across_notes:', {
    query,
    matchThreshold,
    limit,
    embeddingLength: queryEmbedding.length,
    userId,
  });

  const { data, error } = await supabase.rpc('match_chunks_across_notes', {
    p_query_embedding: queryEmbedding,
    p_match_threshold: matchThreshold,
    p_limit: limit,
  });

  if (error) {
    console.error('❌ [CHUNK SEARCH] RPC function error:', {
      errorCode: error.code,
      errorMessage: error.message,
      errorDetails: error.details,
      errorHint: error.hint,
      userId,
      query,
      matchThreshold,
      limit,
      isFunctionMissing: error.code === '42883' || error.message?.includes('does not exist'),
    });
    
    // Check if function doesn't exist
    if (error.code === '42883' || error.message?.includes('does not exist')) {
      console.error('SQL function match_chunks_across_notes does not exist. Please run the schema migration.');
      // Fallback to manual search
      return searchChunksAcrossNotesManual(supabase, userId, queryEmbedding, matchThreshold, limit);
    }
    
    // For other errors, still try manual search as fallback
    console.warn('RPC call failed, attempting manual search fallback');
    return searchChunksAcrossNotesManual(supabase, userId, queryEmbedding, matchThreshold, limit);
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    const hasChunks = chunkCheck && chunkCheck.length > 0;
    console.warn('⚠️ [CHUNK SEARCH] No data returned from match_chunks_across_notes', {
      userId,
      query,
      matchThreshold,
      embeddingLength: queryEmbedding.length,
      hasChunksWithEmbeddings: hasChunks,
      dataIsNull: data === null,
      dataIsUndefined: data === undefined,
      dataIsArray: Array.isArray(data),
      dataLength: Array.isArray(data) ? data.length : 'N/A',
      possibleCauses: hasChunks 
        ? [
            '1. SQL function may not exist (check Supabase Functions list)',
            '2. Similarity scores below threshold (try threshold 0.0 to test)',
            '3. RLS policy blocking results',
            '4. Function syntax error (check Supabase SQL editor)',
          ]
        : ['No chunks with embeddings - run: npm run backfill-chunks'],
    });
    
    // If no chunks with embeddings exist, return empty
    if (!hasChunks) {
      console.error('❌ No chunks with embeddings found for user. Chunks may need embeddings generated.');
      console.error('   Solution: Run backfill script to generate embeddings for chunks');
      return [];
    }
    
    // If chunks exist but no matches, try manual search to see if it's a function issue
    console.warn('🔍 Chunks exist but no matches found. Trying manual search to verify...');
    try {
      const manualResults = await searchChunksAcrossNotesManual(supabase, userId, queryEmbedding, matchThreshold, limit);
      console.log('📊 Manual search results:', {
        query,
        matchThreshold,
        manualResultCount: manualResults.length,
        topSimilarities: manualResults.slice(0, 3).map(r => ({
          noteId: r.note.id,
          similarity: r.bestChunkSimilarity,
          matchingChunks: r.matchingChunksCount,
        })),
      });
      
      if (manualResults.length > 0) {
        console.warn('⚠️ Manual search found results but RPC function did not. SQL function may have an issue.');
      }
      
      return manualResults;
    } catch (manualError) {
      console.error('❌ Manual search also failed:', manualError);
      return [];
    }
  }

  console.log('Chunk search results:', {
    query,
    matchThreshold,
    resultCount: data.length,
    results: data.slice(0, 3), // Log first 3 for debugging
  });

  // Convert database results to NoteWithChunkMatches format
  const results: NoteWithChunkMatches[] = data.map((row: any) => ({
    note: {
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      body: row.body,
      folder_id: row.folder_id,
      parent_note_id: row.parent_note_id,
      position: row.position,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    bestChunkSimilarity: row.best_chunk_similarity,
    matchingChunksCount: row.matching_chunks_count,
    chunkIds: row.chunk_ids || [],
    bestChunkText: row.best_chunk_text || undefined,
  }));

  // Filter results to ensure they belong to the user (extra safety check)
  return results.filter(result => result.note.user_id === userId);
}

/**
 * Manual chunk search across notes (fallback if RPC function doesn't exist)
 */
async function searchChunksAcrossNotesManual(
  supabase: any,
  userId: string,
  queryEmbedding: number[],
  matchThreshold: number,
  limit: number
): Promise<NoteWithChunkMatches[]> {
  // Fetch all chunks for the user
  const { data: chunks, error: chunksError } = await supabase
    .from('note_chunks')
    .select('*, notes!inner(*)')
    .eq('notes.user_id', userId)
    .not('embedding', 'is', null);

  if (chunksError) {
    console.error('Error fetching chunks:', chunksError);
    throw new Error(`Failed to fetch chunks: ${chunksError.message}`);
  }

  if (!chunks || chunks.length === 0) {
    return [];
  }

  // Calculate similarities and filter
  const chunksWithSimilarity = chunks
    .filter((chunk: any) => chunk.embedding && Array.isArray(chunk.embedding))
    .map((chunk: any) => {
      const similarity = calculateCosineSimilarity(chunk.embedding as number[], queryEmbedding);
      return {
        ...chunk,
        similarity,
      };
    })
    .filter((chunk: any) => chunk.similarity >= matchThreshold);

  // Group by note_id
  const noteMap = new Map<string, {
    note: Note;
    chunks: Array<{ id: string; similarity: number; chunk_text: string }>;
  }>();

  chunksWithSimilarity.forEach((chunk: any) => {
    const noteId = chunk.note_id;
    if (!noteMap.has(noteId)) {
      noteMap.set(noteId, {
        note: {
          id: chunk.notes.id,
          user_id: chunk.notes.user_id,
          title: chunk.notes.title,
          body: chunk.notes.body,
          folder_id: chunk.notes.folder_id,
          parent_note_id: chunk.notes.parent_note_id,
          position: chunk.notes.position,
          created_at: chunk.notes.created_at,
          updated_at: chunk.notes.updated_at,
        },
        chunks: [],
      });
    }
    noteMap.get(noteId)!.chunks.push({
      id: chunk.id,
      similarity: chunk.similarity,
      chunk_text: chunk.chunk_text || '',
    });
  });

  // Convert to NoteWithChunkMatches format
  const results: NoteWithChunkMatches[] = Array.from(noteMap.values())
    .map(({ note, chunks }) => {
      const similarities = chunks.map(c => c.similarity);
      const bestChunk = chunks.reduce((best, current) => 
        current.similarity > best.similarity ? current : best
      );
      return {
        note,
        bestChunkSimilarity: Math.max(...similarities),
        matchingChunksCount: chunks.length,
        chunkIds: chunks.map(c => c.id),
        bestChunkText: bestChunk.chunk_text,
      };
    })
    .sort((a, b) => {
      // Sort by best similarity, then by count
      if (b.bestChunkSimilarity !== a.bestChunkSimilarity) {
        return b.bestChunkSimilarity - a.bestChunkSimilarity;
      }
      return b.matchingChunksCount - a.matchingChunksCount;
    })
    .slice(0, limit);

  return results;
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

