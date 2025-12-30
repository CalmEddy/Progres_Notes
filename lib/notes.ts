import { createSupabaseServerClient } from './supabaseServerClient';
import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';
import { extractPhrases } from './phrases/phraseExtractor';
import { storePhrasesForNote } from './phrases/phraseStorage';
import { createChunksForNote } from './chunks/chunking';
import { generateEmbeddingsForNoteChunks } from './chunks/embeddingService';
import { generateThemeForNote } from './themes/themeGeneration';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Helper to create an authenticated Supabase client with user session
function createAuthenticatedClient(accessToken?: string) {
  if (accessToken) {
    // Create client with the user's access token in Authorization header
    // Supabase RLS will automatically use this token to check auth.uid()
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }
  // Fallback to server client (may not work with RLS)
  return null;
}

export interface Note {
  id: string;
  user_id: string;
  title: string | null;
  body: string;
  folder_id: string | null;
  parent_note_id: string | null;
  position: number;
  conversation_id: string | null;
  is_conversation: boolean;
  created_at: string;
  updated_at: string;
}

export interface NoteWithSimilarity extends Note {
  similarity: number;
}

/**
 * Create a new note for a user with an embedding
 * Generates an embedding from the combined title and body text
 * @param accessToken - Optional access token for authenticated requests (required for RLS)
 */
export async function createNoteForUser(
  userId: string,
  title: string | null,
  body: string,
  folderId?: string | null,
  parentNoteId?: string | null,
  position?: number,
  accessToken?: string
): Promise<Note> {
  // Allow empty body if we have a title (for pages with only titles)
  if ((!body || body.trim().length === 0) && !title) {
    throw new Error('Note must have either a title or body content');
  }

  // Combine title and body for embedding generation
  // If body is empty but title exists, use just the title
  const textForEmbedding = title 
    ? (body && body.trim().length > 0 ? `${title}\n\n${body}`.trim() : title.trim())
    : (body ? body.trim() : '');

  // Generate embedding
  const embedding = await generateEmbedding(textForEmbedding);

  // Validate: note cannot be in both folder and under another note
  if (folderId && parentNoteId) {
    throw new Error('Note cannot be in both a folder and nested under another note');
  }

  // Create authenticated Supabase client for RLS
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  
  const { data, error } = await supabase
    .from('notes')
    .insert({
      user_id: userId,
      title: title || null,
      body: body.trim(),
      embedding: embedding,
      folder_id: folderId !== undefined ? folderId : null,
      parent_note_id: parentNoteId !== undefined ? parentNoteId : null,
      position: position !== undefined ? position : 0,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating note:', error);
    throw new Error(`Failed to create note: ${error.message}`);
  }

  if (!data) {
    throw new Error('Note created but no data returned');
  }

  // Chunk the note body (synchronous - must complete before returning)
  try {
    await createChunksForNote(data.id, body.trim(), accessToken);
  } catch (error) {
    // Log but don't throw - chunking failures shouldn't prevent note creation
    console.error('Error chunking note (non-blocking):', error);
  }

  // Extract and store phrases (non-blocking - don't fail note creation if this fails)
  try {
    const textToExtract = textForEmbedding;
    if (textToExtract && textToExtract.trim().length > 0) {
      const phrases = extractPhrases(textToExtract);
      if (phrases.length > 0) {
        // Store phrases asynchronously - don't await to avoid blocking
        storePhrasesForNote(userId, data.id, phrases, accessToken).catch((error) => {
          console.error('Error storing phrases for note (non-blocking):', error);
        });
      }
    }
  } catch (error) {
    // Log but don't throw - phrase extraction failures shouldn't prevent note creation
    console.error('Error extracting phrases for note (non-blocking):', error);
  }

  // Generate embeddings and themes asynchronously (non-blocking)
  generateEmbeddingsForNoteChunks(data.id, accessToken)
    .then(async (count) => {
      if (count > 0) {
        // Generate theme after embeddings are created
        try {
          await generateThemeForNote(data.id, accessToken, true, data.title);
        } catch (error) {
          console.error('Error generating theme for note (non-blocking):', error);
        }
      } else {
        // Even if no new embeddings were generated, check if chunks have embeddings and generate theme
        try {
          await generateThemeForNote(data.id, accessToken, true, data.title);
        } catch (error) {
          console.error('Error generating theme for note (non-blocking):', error);
        }
      }
    })
    .catch((error) => {
      console.error('Error generating embeddings for note (non-blocking):', error);
    });

  return data as Note;
}

/**
 * Update an existing note and regenerate its embedding
 * Also re-extracts and updates phrases
 */
export async function updateNoteForUser(
  noteId: string,
  userId: string,
  title: string | null,
  body: string,
  accessToken?: string
): Promise<Note> {
  if (!body || body.trim().length === 0) {
    throw new Error('Note body cannot be empty');
  }

  // Combine title and body for embedding generation
  const textForEmbedding = title 
    ? `${title}\n\n${body}`.trim()
    : body.trim();

  // Generate embedding
  const embedding = await generateEmbedding(textForEmbedding);

  // Create authenticated Supabase client for RLS
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  
  // Update note in database
  const { data, error } = await supabase
    .from('notes')
    .update({
      title: title || null,
      body: body.trim(),
      embedding: embedding,
    })
    .eq('id', noteId)
    .eq('user_id', userId) // Ensure user owns the note
    .select()
    .single();

  if (error) {
    console.error('Error updating note:', error);
    throw new Error(`Failed to update note: ${error.message}`);
  }

  if (!data) {
    throw new Error('Note updated but no data returned');
  }

  // Re-chunk the note body (synchronous - must complete before returning)
  try {
    await createChunksForNote(noteId, body.trim(), accessToken);
  } catch (error) {
    // Log but don't throw - chunking failures shouldn't prevent note update
    console.error('Error chunking note (non-blocking):', error);
  }

  // Re-extract and update phrases (non-blocking)
  try {
    // Delete existing note-phrase links
    await supabase
      .from('note_phrases')
      .delete()
      .eq('note_id', noteId);

    // Extract new phrases
    const phrases = extractPhrases(textForEmbedding);
    if (phrases.length > 0) {
      // Store new phrases
      await storePhrasesForNote(userId, noteId, phrases, accessToken);
    }
  } catch (error) {
    // Log but don't throw - phrase extraction failures shouldn't prevent note update
    console.error('Error updating phrases for note (non-blocking):', error);
  }

  // Generate embeddings and themes asynchronously (non-blocking)
  generateEmbeddingsForNoteChunks(noteId, accessToken)
    .then(async (count) => {
      // Regenerate theme after embeddings are created/updated (even if no new embeddings)
      try {
        await generateThemeForNote(noteId, accessToken, true, data.title); // Preserve user-modified labels
      } catch (error) {
        console.error('Error regenerating theme for note (non-blocking):', error);
      }
    })
    .catch((error) => {
      console.error('Error generating embeddings for note (non-blocking):', error);
    });

  return data as Note;
}

/**
 * List all notes for a user, optionally filtered by folder or parent note
 * @param accessToken - Optional access token for authenticated requests (required for RLS)
 */
export async function listNotesForUser(
  userId: string,
  folderId?: string | null,
  parentNoteId?: string | null,
  accessToken?: string
): Promise<Note[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  let query = supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId);

  if (folderId !== undefined) {
    if (folderId === null) {
      query = query.is('folder_id', null).is('parent_note_id', null);
    } else {
      query = query.eq('folder_id', folderId);
    }
  } else if (parentNoteId !== undefined) {
    if (parentNoteId === null) {
      query = query.is('parent_note_id', null);
    } else {
      query = query.eq('parent_note_id', parentNoteId);
    }
  }

  const { data, error } = await query
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing notes:', error);
    // Check if position or folder_id columns don't exist
    if (error.message.includes('column') && error.message.includes('does not exist')) {
      throw new Error('Notes table missing folder_id, parent_note_id, or position columns. Please run the database migration in supabase/schema.sql');
    }
    throw new Error(`Failed to list notes: ${error.message}`);
  }

  return (data || []) as Note[];
}

/**
 * Get all child notes of a specific note
 */
export async function getChildNotesForNote(
  noteId: string,
  userId: string,
  accessToken?: string
): Promise<Note[]> {
  return listNotesForUser(userId, undefined, noteId, accessToken);
}

/**
 * Update a note's parent (folder or note) and position
 */
export async function updateNotePosition(
  noteId: string,
  userId: string,
  folderId: string | null,
  parentNoteId: string | null,
  position: number,
  accessToken?: string
): Promise<Note> {
  // Validate: note cannot be in both folder and under another note
  if (folderId && parentNoteId) {
    throw new Error('Note cannot be in both a folder and nested under another note');
  }

  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('notes')
    .update({
      folder_id: folderId,
      parent_note_id: parentNoteId,
      position: position,
    })
    .eq('id', noteId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating note position:', error);
    throw new Error(`Failed to update note position: ${error.message}`);
  }

  if (!data) {
    throw new Error('Note position updated but no data returned');
  }

  return data as Note;
}

/**
 * Search notes for a user using semantic similarity
 * Uses the match_notes RPC function with pgvector
 * @param accessToken - Optional access token for authenticated requests (required for RLS)
 */
export async function searchNotesForUser(
  userId: string,
  query: string,
  matchThreshold: number = 0.7,
  matchCount: number = 10,
  accessToken?: string
): Promise<NoteWithSimilarity[]> {
  if (!query || query.trim().length === 0) {
    throw new Error('Search query cannot be empty');
  }

  // Generate embedding for the search query
  const queryEmbedding = await generateEmbedding(query.trim());

  // Create authenticated Supabase client for RLS
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('match_notes', {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  if (error) {
    console.error('Error searching notes:', error);
    throw new Error(`Failed to search notes: ${error.message}`);
  }

  // Filter results to ensure they belong to the user (extra safety check)
  const userNotes = (data || []).filter(
    (note: NoteWithSimilarity) => note.user_id === userId
  ) as NoteWithSimilarity[];

  return userNotes;
}

/**
 * Get a note by ID
 */
export async function getNoteById(
  noteId: string,
  userId: string,
  accessToken?: string
): Promise<Note | null> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('id', noteId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error getting note:', error);
    throw new Error(`Failed to get note: ${error.message}`);
  }

  return data as Note;
}

/**
 * Get multiple notes by IDs in batch
 */
export async function getNotesByIds(
  noteIds: string[],
  userId: string,
  accessToken?: string
): Promise<Note[]> {
  if (noteIds.length === 0) {
    return [];
  }

  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .in('id', noteIds)
    .eq('user_id', userId);

  if (error) {
    console.error('Error getting notes:', error);
    throw new Error(`Failed to get notes: ${error.message}`);
  }

  return (data || []) as Note[];
}

/**
 * Delete a note (only if it belongs to the user)
 */
export async function deleteNoteForUser(
  noteId: string,
  userId: string
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId)
    .eq('user_id', userId); // Ensure user owns the note

  if (error) {
    console.error('Error deleting note:', error);
    throw new Error(`Failed to delete note: ${error.message}`);
  }
}

