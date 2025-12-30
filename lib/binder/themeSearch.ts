import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabaseServerClient';
import { generateEmbedding } from '../embeddings';
import { Note } from '../notes';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface NoteWithThemeSimilarity extends Note {
  theme_label: string | null;
  theme_similarity: number;
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
 * Search notes by theme similarity
 * Uses the note_themes table and centroid_embedding for semantic theme matching
 */
export async function searchNotesByTheme(
  userId: string,
  query: string,
  themeThreshold: number = 0.7,
  limit: number = 20,
  accessToken?: string
): Promise<NoteWithThemeSimilarity[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  // Generate embedding for the search query
  const queryEmbedding = await generateEmbedding(query.trim());

  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Use the PostgreSQL function for theme search
  const { data, error } = await supabase.rpc('search_notes_by_theme', {
    p_query_embedding: queryEmbedding,
    p_theme_threshold: themeThreshold,
    p_limit: limit,
  });

  if (error) {
    console.error('Error searching notes by theme:', error);
    // Fallback to manual search if function doesn't exist
    return searchNotesByThemeManual(supabase, userId, queryEmbedding, themeThreshold, limit);
  }

  // Filter results to ensure they belong to the user (extra safety check)
  const userNotes = (data || []).filter(
    (note: NoteWithThemeSimilarity) => note.user_id === userId
  ) as NoteWithThemeSimilarity[];

  return userNotes;
}

/**
 * Manual theme search (fallback if RPC function doesn't exist)
 */
async function searchNotesByThemeManual(
  supabase: any,
  userId: string,
  queryEmbedding: number[],
  themeThreshold: number,
  limit: number
): Promise<NoteWithThemeSimilarity[]> {
  // Fetch all themes for user's notes
  const { data: themes, error: themesError } = await supabase
    .from('note_themes')
    .select('note_id, theme_label, centroid_embedding')
    .not('centroid_embedding', 'is', null);

  if (themesError) {
    console.error('Error fetching themes:', themesError);
    throw new Error(`Failed to fetch themes: ${themesError.message}`);
  }

  if (!themes || themes.length === 0) {
    return [];
  }

  // Calculate theme similarities
  const themesWithSimilarity = themes
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
    .filter(theme => theme.theme_similarity >= themeThreshold)
    .sort((a, b) => b.theme_similarity - a.theme_similarity)
    .slice(0, limit);

  if (themesWithSimilarity.length === 0) {
    return [];
  }

  // Fetch notes for matching themes
  const noteIds = themesWithSimilarity.map(t => t.note_id);
  const { data: notes, error: notesError } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .in('id', noteIds);

  if (notesError) {
    console.error('Error fetching notes:', notesError);
    throw new Error(`Failed to fetch notes: ${notesError.message}`);
  }

  if (!notes) {
    return [];
  }

  // Combine notes with theme information
  const notesWithTheme: NoteWithThemeSimilarity[] = notes.map(note => {
    const theme = themesWithSimilarity.find(t => t.note_id === note.id);
    return {
      ...note,
      theme_label: theme?.theme_label || null,
      theme_similarity: theme?.theme_similarity || 0,
    };
  });

  // Sort by theme similarity
  return notesWithTheme.sort((a, b) => b.theme_similarity - a.theme_similarity);
}

/**
 * Find notes with similar themes to a given note
 */
export async function findNotesWithSimilarThemes(
  userId: string,
  noteId: string,
  themeThreshold: number = 0.7,
  limit: number = 10,
  accessToken?: string
): Promise<NoteWithThemeSimilarity[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Get the theme for the given note
  const { data: noteTheme, error: themeError } = await supabase
    .from('note_themes')
    .select('centroid_embedding')
    .eq('note_id', noteId)
    .single();

  if (themeError || !noteTheme || !noteTheme.centroid_embedding) {
    return [];
  }

  // Search for notes with similar themes (excluding the original note)
  const { data, error } = await supabase.rpc('search_notes_by_theme', {
    p_query_embedding: noteTheme.centroid_embedding,
    p_theme_threshold: themeThreshold,
    p_limit: limit + 1, // Get one extra to exclude the original
  });

  if (error) {
    console.error('Error finding similar themes:', error);
    return [];
  }

  // Filter out the original note and ensure user ownership
  const similarNotes = (data || [])
    .filter((note: NoteWithThemeSimilarity) => note.user_id === userId && note.id !== noteId)
    .slice(0, limit) as NoteWithThemeSimilarity[];

  return similarNotes;
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

