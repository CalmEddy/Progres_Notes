import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabaseServerClient';
import { updateNoteForUser } from '../notes';

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

/**
 * Reconstruct note body from chunks
 * Joins chunks in chunk_index order with double newlines between them
 * 
 * @param chunks - Array of chunks ordered by chunk_index
 * @returns Reconstructed note body string
 */
export function reconstructNoteBodyFromChunks(chunks: NoteChunk[]): string {
  // Sort by chunk_index to ensure correct order
  const sortedChunks = [...chunks].sort((a, b) => a.chunk_index - b.chunk_index);
  
  // Join chunks with double newlines (matching chunkNoteBody delimiter)
  return sortedChunks.map(chunk => chunk.chunk_text.trim()).join('\n\n');
}

/**
 * Sync chunks to note body
 * Reconstructs note body from all chunks and updates the note
 * 
 * @param noteId - The note ID
 * @param userId - The user ID (required for updateNoteForUser)
 * @param accessToken - Optional access token for authenticated requests
 * @returns Updated note
 */
export async function syncChunksToNote(
  noteId: string,
  userId: string,
  accessToken?: string
) {
  // Get all chunks for the note
  const chunks = await getChunksForNote(noteId, accessToken);
  
  // Reconstruct note body from chunks
  const reconstructedBody = reconstructNoteBodyFromChunks(chunks);
  
  // Get current note to preserve title
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('title')
    .eq('id', noteId)
    .eq('user_id', userId)
    .single();
  
  if (noteError || !note) {
    throw new Error(`Failed to get note: ${noteError?.message || 'Note not found'}`);
  }
  
  // Update note with reconstructed body
  return await updateNoteForUser(
    noteId,
    userId,
    note.title,
    reconstructedBody,
    accessToken
  );
}

/**
 * Update a single chunk's text
 * Also syncs the updated chunks to the note body
 * 
 * @param chunkId - The chunk ID to update
 * @param chunkText - The new chunk text
 * @param userId - The user ID (required for syncing to note)
 * @param accessToken - Optional access token for authenticated requests
 * @returns Updated chunk
 */
export async function updateChunk(
  chunkId: string,
  chunkText: string,
  userId: string,
  accessToken?: string
): Promise<NoteChunk> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  
  // Get the chunk to find note_id
  const { data: chunk, error: getError } = await supabase
    .from('note_chunks')
    .select('note_id')
    .eq('id', chunkId)
    .single();
  
  if (getError || !chunk) {
    throw new Error(`Failed to get chunk: ${getError?.message || 'Chunk not found'}`);
  }
  
  // Verify user owns the note
  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('id')
    .eq('id', chunk.note_id)
    .eq('user_id', userId)
    .single();
  
  if (noteError || !note) {
    throw new Error(`Unauthorized: ${noteError?.message || 'Note not found'}`);
  }
  
  // Update the chunk
  const { data: updatedChunk, error: updateError } = await supabase
    .from('note_chunks')
    .update({ chunk_text: chunkText.trim() })
    .eq('id', chunkId)
    .select()
    .single();
  
  if (updateError || !updatedChunk) {
    throw new Error(`Failed to update chunk: ${updateError?.message || 'Update failed'}`);
  }
  
  // Sync chunks to note body (non-blocking, but we wait for it)
  try {
    await syncChunksToNote(chunk.note_id, userId, accessToken);
  } catch (error) {
    console.error('Error syncing chunks to note (non-blocking):', error);
    // Don't throw - chunk update succeeded, note sync can retry
  }
  
  return updatedChunk as NoteChunk;
}

/**
 * Delete a single chunk
 * Also syncs the remaining chunks to the note body
 * 
 * @param chunkId - The chunk ID to delete
 * @param userId - The user ID (required for syncing to note)
 * @param accessToken - Optional access token for authenticated requests
 * @returns The note ID of the deleted chunk
 */
export async function deleteChunk(
  chunkId: string,
  userId: string,
  accessToken?: string
): Promise<string> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  
  // Get the chunk to find note_id
  const { data: chunk, error: getError } = await supabase
    .from('note_chunks')
    .select('note_id')
    .eq('id', chunkId)
    .single();
  
  if (getError || !chunk) {
    throw new Error(`Failed to get chunk: ${getError?.message || 'Chunk not found'}`);
  }
  
  const noteId = chunk.note_id;
  
  // Verify user owns the note
  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .eq('user_id', userId)
    .single();
  
  if (noteError || !note) {
    throw new Error(`Unauthorized: ${noteError?.message || 'Note not found'}`);
  }
  
  // Delete the chunk
  const { error: deleteError } = await supabase
    .from('note_chunks')
    .delete()
    .eq('id', chunkId);
  
  if (deleteError) {
    throw new Error(`Failed to delete chunk: ${deleteError.message}`);
  }
  
  // Re-index remaining chunks to maintain sequential indices
  const remainingChunks = await getChunksForNote(noteId, accessToken);
  
  // Update chunk indices to be sequential (0, 1, 2, ...)
  if (remainingChunks.length > 0) {
    const updates = remainingChunks.map((chunk, index) => ({
      id: chunk.id,
      chunk_index: index,
    }));
    
    // Update indices in batch
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('note_chunks')
        .update({ chunk_index: update.chunk_index })
        .eq('id', update.id);
      
      if (updateError) {
        console.error(`Error updating chunk index for ${update.id}:`, updateError);
        // Continue with other updates
      }
    }
  }
  
  // Sync chunks to note body (non-blocking, but we wait for it)
  try {
    await syncChunksToNote(noteId, userId, accessToken);
  } catch (error) {
    console.error('Error syncing chunks to note (non-blocking):', error);
    // Don't throw - chunk delete succeeded, note sync can retry
  }
  
  return noteId;
}

