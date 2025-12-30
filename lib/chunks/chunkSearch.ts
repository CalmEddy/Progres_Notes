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
 * Get a chunk by ID (helper function for chunk-based search)
 */
async function getChunkById(
  chunkId: string,
  accessToken?: string
): Promise<NoteChunk> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('note_chunks')
    .select('*')
    .eq('id', chunkId)
    .is('deleted_at', null)
    .single();

  if (error) {
    console.error('Error fetching chunk:', error);
    throw new Error(`Failed to fetch chunk: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Chunk with ID ${chunkId} not found`);
  }

  return data as NoteChunk;
}

/**
 * Search chunks using another chunk's embedding as the query criterion
 * Supports both all chunks and note-specific scopes
 * 
 * @param chunkId - The ID of the chunk to use as the search query
 * @param scope - 'all' to search across all chunks, 'note' to search within the chunk's note
 * @param matchThreshold - Similarity threshold (default: 0.7)
 * @param limit - Maximum number of results (default: 10)
 * @param accessToken - Optional access token for authenticated requests
 * @returns Array of chunks with similarity scores
 */
export async function searchChunksByChunk(
  chunkId: string,
  scope: 'all' | 'note' = 'all',
  matchThreshold: number = 0.7,
  limit: number = 10,
  accessToken?: string
): Promise<ChunkWithSimilarity[]> {
  console.log(`🔍 [CHUNK BY CHUNK SEARCH] Starting search:`, {
    chunkId,
    scope,
    matchThreshold,
    limit,
  });

  // Fetch the source chunk
  const sourceChunk = await getChunkById(chunkId, accessToken);

  console.log(`🔍 [CHUNK BY CHUNK SEARCH] Source chunk retrieved:`, {
    chunkId: sourceChunk.id,
    noteId: sourceChunk.note_id,
    chunkText: sourceChunk.chunk_text?.substring(0, 100) + '...',
    hasEmbedding: !!sourceChunk.embedding,
    embeddingType: typeof sourceChunk.embedding,
    embeddingIsArray: Array.isArray(sourceChunk.embedding),
    embeddingLength: sourceChunk.embedding ? (Array.isArray(sourceChunk.embedding) ? sourceChunk.embedding.length : 'not array') : 'null/undefined',
  });

  // Ensure the chunk has an embedding
  if (!sourceChunk.embedding || (Array.isArray(sourceChunk.embedding) && sourceChunk.embedding.length === 0)) {
    throw new Error(`Chunk ${chunkId} does not have an embedding. Please generate embeddings for this chunk first.`);
  }

  // Normalize the source embedding
  let queryEmbeddingRaw = sourceChunk.embedding;
  if (typeof queryEmbeddingRaw === 'string') {
    try {
      queryEmbeddingRaw = JSON.parse(queryEmbeddingRaw);
    } catch (e) {
      console.error(`🔍 [CHUNK BY CHUNK SEARCH] Failed to parse source chunk embedding:`, e);
      throw new Error(`Source chunk embedding is not in valid format`);
    }
  }
  
  if (!Array.isArray(queryEmbeddingRaw) || queryEmbeddingRaw.length === 0) {
    console.error(`🔍 [CHUNK BY CHUNK SEARCH] Source embedding is not a valid array:`, {
      type: typeof queryEmbeddingRaw,
      isArray: Array.isArray(queryEmbeddingRaw),
      length: queryEmbeddingRaw?.length,
    });
    throw new Error(`Source chunk embedding is not a valid array`);
  }

  const queryEmbedding = queryEmbeddingRaw as number[];
  console.log(`🔍 [CHUNK BY CHUNK SEARCH] Query embedding normalized:`, {
    length: queryEmbedding.length,
    first5: queryEmbedding.slice(0, 5),
    last5: queryEmbedding.slice(-5),
    allNumbers: queryEmbedding.every(v => typeof v === 'number'),
  });

  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  if (scope === 'note') {
    // Search within the chunk's note
    const { data, error } = await supabase.rpc('match_chunks_in_note', {
      p_note_id: sourceChunk.note_id,
      p_query_embedding: queryEmbedding,
      p_match_threshold: matchThreshold,
      p_limit: limit + 1, // Get one extra to exclude the source chunk
    });

    if (error) {
      // Fallback to manual search
      console.warn('match_chunks_in_note function not found, using manual query:', error);
      const results = await searchChunksInNoteManual(
        sourceChunk.note_id,
        queryEmbedding,
        matchThreshold,
        limit + 1,
        accessToken
      );
      // Exclude the source chunk from results
      return results.filter(chunk => chunk.id !== chunkId).slice(0, limit);
    }

    // Exclude the source chunk from results
    const allResults = (data || []) as ChunkWithSimilarity[];
    return allResults.filter(chunk => chunk.id !== chunkId).slice(0, limit);
  } else {
    // Search across all chunks
    // Get the note's user_id first
    const { data: note, error: noteError } = await supabase
      .from('notes')
      .select('user_id')
      .eq('id', sourceChunk.note_id)
      .single();

    if (noteError || !note) {
      throw new Error(`Failed to fetch note for chunk: ${noteError?.message || 'Note not found'}`);
    }

    // Fallback to manual search: Get chunks for this user's notes
    // Note: We could use match_chunks_across_notes RPC, but it returns note-level results
    // For chunk-to-chunk search, we need chunk-level results, so manual search is more appropriate
    // First get all note IDs for the user
    const { data: userNotes, error: notesError } = await supabase
      .from('notes')
      .select('id')
      .eq('user_id', note.user_id);

    if (notesError) {
      console.error('Error fetching user notes:', notesError);
      throw new Error(`Failed to fetch user notes: ${notesError.message}`);
    }

    if (!userNotes || userNotes.length === 0) {
      return [];
    }

    const noteIds = userNotes.map(n => n.id);

    // Fetch chunks for these notes - use join to satisfy RLS, but select embedding explicitly
    // Split into batches if there are too many note IDs to avoid query limits
    const BATCH_SIZE = 100;
    let allChunks: any[] = [];
    
    for (let i = 0; i < noteIds.length; i += BATCH_SIZE) {
      const batch = noteIds.slice(i, i + BATCH_SIZE);
      
      // Use join with notes to satisfy RLS policies - but select only chunk fields
      const { data: chunks, error: chunksError } = await supabase
        .from('note_chunks')
        .select('id, note_id, chunk_text, chunk_index, embedding, created_at, updated_at, notes!inner(id)')
        .in('note_id', batch)
        .not('embedding', 'is', null)
        .is('deleted_at', null);

      if (chunksError) {
        console.error('Error fetching chunks batch:', {
          error: chunksError,
          batchSize: batch.length,
          batchIndex: i,
          totalNoteIds: noteIds.length,
        });
        throw new Error(`Failed to fetch chunks: ${chunksError.message}`);
      }

      if (chunks && chunks.length > 0) {
        allChunks = allChunks.concat(chunks);
      }
    }

    const chunks = allChunks;

    if (!chunks || chunks.length === 0) {
      console.log(`🔍 [CHUNK BY CHUNK SEARCH] No chunks found for ${noteIds.length} notes`);
      return [];
    }

    console.log(`🔍 [CHUNK BY CHUNK SEARCH] Fetched ${chunks.length} chunks to compare`);
    console.log(`🔍 [CHUNK BY CHUNK SEARCH] Source chunk embedding length: ${queryEmbedding.length}`);
    console.log(`🔍 [CHUNK BY CHUNK SEARCH] Source chunk embedding sample (first 5):`, queryEmbedding.slice(0, 5));

    // Calculate similarities and filter (exclude source chunk)
    let validEmbeddingCount = 0;
    let invalidEmbeddingCount = 0;
    const similarityScores: number[] = [];
    
    const chunksWithSimilarity = (chunks as any[])
      .filter((chunk: any) => {
        // Exclude source chunk
        if (chunk.id === chunkId) return false;
        
        // Ensure embedding exists and is properly formatted
        if (!chunk.embedding) {
          invalidEmbeddingCount++;
          return false;
        }
        
        // Handle embedding format - Supabase vectors should come as arrays
        // but sometimes they might need parsing
        let embedding = chunk.embedding;
        if (typeof embedding === 'string') {
          try {
            embedding = JSON.parse(embedding);
          } catch (e) {
            console.warn(`Failed to parse embedding for chunk ${chunk.id}:`, e);
            invalidEmbeddingCount++;
            return false;
          }
        }
        
        if (!Array.isArray(embedding) || embedding.length === 0) {
          invalidEmbeddingCount++;
          if (invalidEmbeddingCount <= 3) {
            console.warn(`🔍 [CHUNK BY CHUNK SEARCH] Chunk ${chunk.id} has invalid embedding:`, {
              type: typeof embedding,
              isArray: Array.isArray(embedding),
              length: embedding?.length,
              embeddingSample: embedding?.slice ? embedding.slice(0, 3) : embedding,
            });
          }
          return false;
        }
        
        // Normalize to ensure it's a number array
        if (!embedding.every((val: any) => typeof val === 'number')) {
          console.warn(`Embedding for chunk ${chunk.id} contains non-numeric values`);
          invalidEmbeddingCount++;
          return false;
        }
        
        // Check embedding dimension matches
        if (embedding.length !== queryEmbedding.length) {
          console.warn(`🔍 [CHUNK BY CHUNK SEARCH] Chunk ${chunk.id} embedding dimension mismatch:`, {
            chunkEmbeddingLength: embedding.length,
            queryEmbeddingLength: queryEmbedding.length,
          });
          invalidEmbeddingCount++;
          return false;
        }
        
        chunk.embedding = embedding; // Store normalized embedding
        validEmbeddingCount++;
        return true;
      })
      .map((chunk: any) => {
        try {
          const similarity = calculateCosineSimilarity(chunk.embedding as number[], queryEmbedding);
          similarityScores.push(similarity);
          
          // Log first few similarities for debugging
          if (similarityScores.length <= 10) {
            console.log(`🔍 [CHUNK BY CHUNK SEARCH] Similarity for chunk ${chunk.id.substring(0, 8)}...: ${similarity.toFixed(4)}`, {
              chunkText: chunk.chunk_text?.substring(0, 50) + '...',
            });
          }
          
          return {
            id: chunk.id,
            note_id: chunk.note_id,
            chunk_text: chunk.chunk_text,
            chunk_index: chunk.chunk_index,
            embedding: chunk.embedding,
            created_at: chunk.created_at,
            updated_at: chunk.updated_at,
            similarity,
          };
        } catch (error) {
          console.error(`Error calculating similarity for chunk ${chunk.id}:`, error, {
            embeddingLength: chunk.embedding?.length,
            queryEmbeddingLength: queryEmbedding.length,
            embeddingType: typeof chunk.embedding,
            embeddingIsArray: Array.isArray(chunk.embedding),
          });
          invalidEmbeddingCount++;
          return null;
        }
      })
      .filter((chunk: any): chunk is ChunkWithSimilarity => {
        if (chunk === null) return false;
        const passes = chunk.similarity >= matchThreshold;
        if (!passes && similarityScores.length <= 20) {
          // Log why chunks are being filtered out
          console.log(`🔍 [CHUNK BY CHUNK SEARCH] Chunk filtered (similarity ${chunk.similarity.toFixed(4)} < threshold ${matchThreshold}):`, {
            chunkId: chunk.id.substring(0, 8) + '...',
            chunkText: chunk.chunk_text?.substring(0, 50) + '...',
          });
        }
        return passes;
      })
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, limit);

    // Log summary statistics
    if (similarityScores.length > 0) {
      const sortedScores = [...similarityScores].sort((a, b) => b - a);
      console.log(`🔍 [CHUNK BY CHUNK SEARCH] Similarity Statistics:`, {
        totalChunks: chunks.length,
        validEmbeddings: validEmbeddingCount,
        invalidEmbeddings: invalidEmbeddingCount,
        chunksWithSimilarityCalculated: similarityScores.length,
        threshold: matchThreshold,
        resultsAboveThreshold: chunksWithSimilarity.length,
        maxSimilarity: sortedScores[0],
        minSimilarity: sortedScores[sortedScores.length - 1],
        medianSimilarity: sortedScores[Math.floor(sortedScores.length / 2)],
        top10Similarities: sortedScores.slice(0, 10),
        bottom10Similarities: sortedScores.slice(-10),
      });
    } else {
      console.warn(`🔍 [CHUNK BY CHUNK SEARCH] No similarity scores calculated!`, {
        totalChunks: chunks.length,
        validEmbeddings: validEmbeddingCount,
        invalidEmbeddings: invalidEmbeddingCount,
      });
    }

    console.log(`🔍 [CHUNK BY CHUNK SEARCH] Found ${chunksWithSimilarity.length} results above threshold ${matchThreshold}`, {
      totalChunks: chunks.length,
      filteredChunks: chunksWithSimilarity.length,
      topSimilarities: chunksWithSimilarity.slice(0, 3).map(c => c.similarity),
    });

    return chunksWithSimilarity as ChunkWithSimilarity[];
  }
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

