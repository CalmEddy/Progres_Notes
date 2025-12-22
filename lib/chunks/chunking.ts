import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabaseServerClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface NoteChunk {
  id: string;
  note_id: string;
  chunk_text: string;
  chunk_index: number;
  embedding: number[] | null;
  created_at: string;
  updated_at: string;
}

/**
 * Split note body into paragraph-based chunks
 * Chunks are delimited by blank lines (double newline)
 * 
 * @param body - The note body text to chunk
 * @returns Array of chunk text strings in order
 */
export function chunkNoteBody(body: string): string[] {
  if (!body || body.trim().length === 0) {
    return [];
  }

  // Split by blank lines (double newline or double carriage return + newline)
  // This handles both \n\n and \r\n\r\n patterns
  const chunks = body.split(/\r?\n\r?\n/);
  
  // Filter out empty chunks and trim whitespace
  return chunks
    .map(chunk => chunk.trim())
    .filter(chunk => chunk.length > 0);
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
 * Create or update chunks for a note
 * This is idempotent - can be run multiple times safely
 * 
 * @param noteId - The note ID
 * @param body - The note body text to chunk
 * @param accessToken - Optional access token for authenticated requests
 * @returns Array of created/updated chunk IDs
 */
export async function createChunksForNote(
  noteId: string,
  body: string,
  accessToken?: string
): Promise<string[]> {
  const chunks = chunkNoteBody(body);
  
  if (chunks.length === 0) {
    // No chunks to create, but ensure any existing chunks are deleted
    const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
    await supabase
      .from('note_chunks')
      .delete()
      .eq('note_id', noteId);
    return [];
  }

  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  
  // Get existing chunks to compare
  const { data: existingChunks } = await supabase
    .from('note_chunks')
    .select('id, chunk_index, chunk_text')
    .eq('note_id', noteId)
    .order('chunk_index', { ascending: true });

  const existingChunksMap = new Map(
    (existingChunks || []).map(chunk => [chunk.chunk_index, chunk])
  );

  const chunkIds: string[] = [];
  const chunksToInsert: Array<{ note_id: string; chunk_text: string; chunk_index: number }> = [];
  const chunksToUpdate: Array<{ id: string; chunk_text: string }> = [];
  const existingIndices = new Set<number>();

  // Process each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    const chunkIndex = i;
    existingIndices.add(chunkIndex);

    const existingChunk = existingChunksMap.get(chunkIndex);
    
    if (existingChunk) {
      // Check if text changed (simple comparison - could use hash for efficiency)
      if (existingChunk.chunk_text !== chunkText) {
        chunksToUpdate.push({
          id: existingChunk.id,
          chunk_text: chunkText,
        });
        chunkIds.push(existingChunk.id);
      } else {
        // Text unchanged, keep existing chunk
        chunkIds.push(existingChunk.id);
      }
    } else {
      // New chunk - will be inserted
      chunksToInsert.push({
        note_id: noteId,
        chunk_text: chunkText,
        chunk_index: chunkIndex,
      });
    }
  }

  // Delete chunks that no longer exist (chunk_index not in current set)
  const indicesToDelete = Array.from(existingChunksMap.keys())
    .filter(idx => !existingIndices.has(idx));
  
  if (indicesToDelete.length > 0) {
    const chunksToDelete = Array.from(existingChunksMap.entries())
      .filter(([idx]) => indicesToDelete.includes(idx))
      .map(([, chunk]) => chunk.id);

    if (chunksToDelete.length > 0) {
      await supabase
        .from('note_chunks')
        .delete()
        .in('id', chunksToDelete);
    }
  }

  // Update existing chunks
  for (const update of chunksToUpdate) {
    const { data, error } = await supabase
      .from('note_chunks')
      .update({ chunk_text: update.chunk_text })
      .eq('id', update.id)
      .select('id')
      .single();

    if (error) {
      console.error(`Error updating chunk ${update.id}:`, error);
    } else if (data) {
      // ID already in chunkIds from above
    }
  }

  // Insert new chunks using upsert to handle race conditions
  if (chunksToInsert.length > 0) {
    const { data: insertedChunks, error } = await supabase
      .from('note_chunks')
      .upsert(chunksToInsert, {
        onConflict: 'note_id,chunk_index',
        ignoreDuplicates: false,
      })
      .select('id, chunk_index');

    if (error) {
      console.error('Error inserting chunks:', error);
      throw new Error(`Failed to insert chunks: ${error.message}`);
    }

    // Map inserted chunks to their indices for ordering
    const insertedMap = new Map(
      (insertedChunks || []).map(chunk => [chunk.chunk_index, chunk.id])
    );

    // Insert chunk IDs in correct order
    for (let i = 0; i < chunks.length; i++) {
      const insertedId = insertedMap.get(i);
      if (insertedId && !chunkIds.includes(insertedId)) {
        // Find the correct position to insert
        const insertIndex = i;
        chunkIds.splice(insertIndex, 0, insertedId);
      }
    }
  }

  return chunkIds;
}

/**
 * Get all chunks for a note
 */
export async function getChunksForNote(
  noteId: string,
  accessToken?: string
): Promise<NoteChunk[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('note_chunks')
    .select('*')
    .eq('note_id', noteId)
    .order('chunk_index', { ascending: true });

  if (error) {
    console.error('Error getting chunks:', error);
    throw new Error(`Failed to get chunks: ${error.message}`);
  }

  return (data || []) as NoteChunk[];
}

/**
 * Delete all chunks for a note
 */
export async function deleteChunksForNote(
  noteId: string,
  accessToken?: string
): Promise<void> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { error } = await supabase
    .from('note_chunks')
    .delete()
    .eq('note_id', noteId);

  if (error) {
    console.error('Error deleting chunks:', error);
    throw new Error(`Failed to delete chunks: ${error.message}`);
  }
}

