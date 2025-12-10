import { createSupabaseServerClient } from './supabaseServerClient';
import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';

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

  // Create authenticated Supabase client for RLS
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  
  const { data, error } = await supabase
    .from('notes')
    .insert({
      user_id: userId,
      title: title || null,
      body: body.trim(),
      embedding: embedding,
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

  return data as Note;
}

/**
 * Update an existing note and regenerate its embedding
 */
export async function updateNoteForUser(
  noteId: string,
  userId: string,
  title: string | null,
  body: string
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

  // Update note in database
  const supabase = await createSupabaseServerClient();
  
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

  return data as Note;
}

/**
 * List all notes for a user, ordered by most recent first
 * @param accessToken - Optional access token for authenticated requests (required for RLS)
 */
export async function listNotesForUser(userId: string, accessToken?: string): Promise<Note[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing notes:', error);
    throw new Error(`Failed to list notes: ${error.message}`);
  }

  return (data || []) as Note[];
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

