import { createSupabaseServerClient } from '../supabaseServerClient';
import { createClient } from '@supabase/supabase-js';
import { ExtractedPhrase, Phrase, PhraseCategory } from './types';
import { normalizePhraseText } from './phraseExtractor';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Helper to create an authenticated Supabase client with user session
function createAuthenticatedClient(accessToken?: string) {
  if (accessToken) {
    // Create client with Authorization header
    // Supabase will automatically use the JWT from the access token for RLS auth.uid()
    // The JWT contains the user ID which RLS policies use via auth.uid()
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return null;
}

/**
 * Store phrases for a note using normalized storage
 * Each unique phrase is stored only once per user, with note-phrase links created separately
 */
export async function storePhrasesForNote(
  userId: string,
  noteId: string,
  phrases: ExtractedPhrase[],
  accessToken?: string
): Promise<void> {
  if (!phrases || phrases.length === 0) {
    return;
  }

  const supabase = accessToken 
    ? createAuthenticatedClient(accessToken) 
    : await createSupabaseServerClient();

  try {
    // Process each phrase: upsert phrase, then create note-phrase link
    for (const phrase of phrases) {
      const normalizedText = normalizePhraseText(phrase.text);

      // Skip empty phrases
      if (!normalizedText || normalizedText.length === 0) {
        continue;
      }

      // Step 1: Upsert phrase (insert if new, update last_seen_at if exists)
      // Use ON CONFLICT to handle the unique constraint on (user_id, phrase_text)
      const { data: phraseData, error: phraseError } = await supabase
        .from('phrases')
        .upsert(
          {
            user_id: userId,
            phrase_text: normalizedText,
            category: phrase.category,
            pos_pattern: phrase.posPattern,
            last_seen_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,phrase_text',
            ignoreDuplicates: false,
          }
        )
        .select()
        .single();

      if (phraseError) {
        // If upsert failed, try to get existing phrase
        const { data: existingPhrase } = await supabase
          .from('phrases')
          .select('id, last_seen_at')
          .eq('user_id', userId)
          .eq('phrase_text', normalizedText)
          .single();

        if (existingPhrase) {
          // Update last_seen_at for existing phrase
          await supabase
            .from('phrases')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', existingPhrase.id);

          // Step 2: Create note-phrase link (if it doesn't already exist)
          await supabase
            .from('note_phrases')
            .insert({
              note_id: noteId,
              phrase_id: existingPhrase.id,
            })
            .select()
            .single()
            .then(({ error }) => {
              // Ignore duplicate key errors (link already exists)
              if (error && !error.message.includes('duplicate') && !error.code?.includes('23505')) {
                console.error('Error creating note-phrase link:', error);
              }
            });
        } else {
          console.error('Error upserting phrase:', phraseError);
        }
        continue;
      }

      if (!phraseData) {
        console.error('Phrase upsert returned no data');
        continue;
      }

      const phraseId = phraseData.id;

      // Step 2: Create note-phrase link (if it doesn't already exist)
      // Use ON CONFLICT DO NOTHING to handle duplicate links gracefully
      const { error: linkError } = await supabase
        .from('note_phrases')
        .insert({
          note_id: noteId,
          phrase_id: phraseId,
        })
        .select()
        .single();

      // Ignore duplicate key errors (link already exists)
      if (linkError && !linkError.message.includes('duplicate') && !linkError.code?.includes('23505')) {
        console.error('Error creating note-phrase link:', linkError);
      }
    }
  } catch (error) {
    console.error('Error storing phrases for note:', error);
    // Don't throw - phrase extraction failures shouldn't break note creation
  }
}

/**
 * Get phrases by category for a user
 */
export async function getPhrasesByCategory(
  userId: string,
  category: PhraseCategory,
  limit?: number,
  accessToken?: string
): Promise<Phrase[]> {
  const supabase = accessToken 
    ? createAuthenticatedClient(accessToken) 
    : await createSupabaseServerClient();

  let query = supabase
    .from('phrases')
    .select('*')
    .eq('user_id', userId)
    .eq('category', category)
    .order('last_seen_at', { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error getting phrases by category:', error);
    throw new Error(`Failed to get phrases: ${error.message}`);
  }

  return (data || []) as Phrase[];
}

/**
 * Get all phrases for a user
 */
export async function getAllPhrasesForUser(
  userId: string,
  limit?: number,
  accessToken?: string
): Promise<Phrase[]> {
  const supabase = accessToken 
    ? createAuthenticatedClient(accessToken) 
    : await createSupabaseServerClient();

  let query = supabase
    .from('phrases')
    .select('*')
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error getting all phrases:', error);
    throw new Error(`Failed to get phrases: ${error.message}`);
  }

  return (data || []) as Phrase[];
}

/**
 * Get phrases for a specific note
 */
export async function getPhrasesForNote(
  noteId: string,
  userId: string,
  accessToken?: string
): Promise<Phrase[]> {
  // In API routes, we should always have an accessToken
  // Only use server client as fallback if no token is provided (server components)
  const supabase = accessToken 
    ? createAuthenticatedClient(accessToken) 
    : await createSupabaseServerClient();
  
  if (!supabase) {
    throw new Error('Failed to create Supabase client: accessToken required for API routes');
  }

  // First verify the note belongs to the user (for RLS)
  // This also ensures auth.uid() is set correctly for subsequent queries
  const { data: noteCheck, error: noteError } = await supabase
    .from('notes')
    .select('id, user_id')
    .eq('id', noteId)
    .single();

  if (noteError) {
    console.error('Error verifying note ownership:', noteError);
    throw new Error(`Failed to verify note: ${noteError.message}`);
  }

  if (!noteCheck) {
    console.error('Note not found:', noteId);
    throw new Error('Note not found');
  }

  if (noteCheck.user_id !== userId) {
    console.error('Access denied: note belongs to different user', { noteId, expectedUserId: userId, actualUserId: noteCheck.user_id });
    throw new Error('Access denied');
  }

  // Get note-phrase links
  // Note: RLS policy on note_phrases checks if the note belongs to the user
  // Since we already verified note ownership above, this should work
  const { data: notePhrasesData, error: notePhrasesError } = await supabase
    .from('note_phrases')
    .select('phrase_id')
    .eq('note_id', noteId);

  if (notePhrasesError) {
    console.error('Error getting note-phrase links:', {
      error: notePhrasesError,
      message: notePhrasesError.message,
      details: notePhrasesError.details,
      hint: notePhrasesError.hint,
      code: notePhrasesError.code,
      noteId,
      userId,
    });
    throw new Error(`Failed to get note-phrase links: ${notePhrasesError.message}`);
  }

  if (!notePhrasesData || notePhrasesData.length === 0) {
    return []; // No phrases linked to this note
  }

  // Get phrase IDs
  const phraseIds = notePhrasesData.map(np => np.phrase_id);

  // Get phrases for this user
  // RLS policy on phrases checks auth.uid() = user_id
  const { data: phrasesData, error: phrasesError } = await supabase
    .from('phrases')
    .select('id, user_id, phrase_text, category, pos_pattern, first_seen_at, last_seen_at')
    .eq('user_id', userId)
    .in('id', phraseIds);

  if (phrasesError) {
    console.error('Error getting phrases:', {
      error: phrasesError,
      message: phrasesError.message,
      details: phrasesError.details,
      hint: phrasesError.hint,
      code: phrasesError.code,
      phraseIds: phraseIds.length,
      userId,
    });
    throw new Error(`Failed to get phrases: ${phrasesError.message}`);
  }

  return (phrasesData || []) as Phrase[];
}

