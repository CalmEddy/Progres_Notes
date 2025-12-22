import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabaseServerClient';
import { generateEmbedding } from '../embeddings';
import { getChunksForNote, NoteChunk } from './chunking';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
 * Generate embeddings for chunks that don't have them
 * Processes chunks in batches to respect API rate limits
 * 
 * @param noteId - The note ID
 * @param accessToken - Optional access token for authenticated requests
 * @param batchSize - Number of chunks to process per batch (default: 10)
 * @returns Number of embeddings generated
 */
export async function generateEmbeddingsForNoteChunks(
  noteId: string,
  accessToken?: string,
  batchSize: number = 10
): Promise<number> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Get all chunks without embeddings
  const chunks = await getChunksForNote(noteId, accessToken);
  const chunksWithoutEmbeddings = chunks.filter(
    chunk => !chunk.embedding || chunk.embedding.length === 0
  );

  if (chunksWithoutEmbeddings.length === 0) {
    return 0;
  }

  let generatedCount = 0;

  // Process in batches
  for (let i = 0; i < chunksWithoutEmbeddings.length; i += batchSize) {
    const batch = chunksWithoutEmbeddings.slice(i, i + batchSize);

    // Generate embeddings for batch
    const embeddingPromises = batch.map(async (chunk) => {
      try {
        const embedding = await generateEmbedding(chunk.chunk_text);
        return { chunkId: chunk.id, embedding };
      } catch (error) {
        console.error(`Error generating embedding for chunk ${chunk.id}:`, error);
        return null;
      }
    });

    const results = await Promise.all(embeddingPromises);

    // Update chunks with embeddings
    for (const result of results) {
      if (result) {
        const { error } = await supabase
          .from('note_chunks')
          .update({ embedding: result.embedding })
          .eq('id', result.chunkId);

        if (error) {
          console.error(`Error updating chunk ${result.chunkId} with embedding:`, error);
        } else {
          generatedCount++;
        }
      }
    }

    // Small delay between batches to respect rate limits
    if (i + batchSize < chunksWithoutEmbeddings.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return generatedCount;
}

/**
 * Generate embedding for a single chunk
 */
export async function generateEmbeddingForChunk(
  chunkId: string,
  chunkText: string,
  accessToken?: string
): Promise<void> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const embedding = await generateEmbedding(chunkText);

  const { error } = await supabase
    .from('note_chunks')
    .update({ embedding })
    .eq('id', chunkId);

  if (error) {
    console.error(`Error updating chunk ${chunkId} with embedding:`, error);
    throw new Error(`Failed to update chunk embedding: ${error.message}`);
  }
}

/**
 * Backfill embeddings for multiple notes
 * Processes notes in batches
 * 
 * @param noteIds - Array of note IDs to process
 * @param accessToken - Optional access token for authenticated requests
 * @param batchSize - Number of chunks to process per batch (default: 10)
 * @returns Total number of embeddings generated
 */
export async function backfillEmbeddingsForNotes(
  noteIds: string[],
  accessToken?: string,
  batchSize: number = 10
): Promise<number> {
  let totalGenerated = 0;

  for (const noteId of noteIds) {
    try {
      const count = await generateEmbeddingsForNoteChunks(noteId, accessToken, batchSize);
      totalGenerated += count;
    } catch (error) {
      console.error(`Error processing note ${noteId}:`, error);
      // Continue with next note
    }
  }

  return totalGenerated;
}

