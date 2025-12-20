import { createSupabaseServerClient } from '../supabaseServerClient';
import { createClient } from '@supabase/supabase-js';
import { Note } from '../notes';
import { Phrase, PhraseCategory } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Helper to create an authenticated Supabase client with user session
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
 * Search notes by phrase text
 */
export async function searchNotesByPhrase(
  userId: string,
  phraseText: string,
  category?: PhraseCategory,
  accessToken?: string
): Promise<Note[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  
  // Normalize phrase text (lowercase)
  const normalizedPhrase = phraseText.toLowerCase().trim();
  
  // Build query to find phrases matching the text
  let phraseQuery = supabase
    .from('phrases')
    .select('id')
    .eq('user_id', userId)
    .ilike('phrase_text', `%${normalizedPhrase}%`);
  
  if (category) {
    phraseQuery = phraseQuery.eq('category', category);
  }
  
  const { data: phrases, error: phraseError } = await phraseQuery;
  
  if (phraseError) {
    console.error('Error searching phrases:', phraseError);
    throw new Error(`Failed to search phrases: ${phraseError.message}`);
  }
  
  if (!phrases || phrases.length === 0) {
    return [];
  }
  
  const phraseIds = phrases.map(p => p.id);
  
  // Find notes linked to these phrases
  const { data: notePhrases, error: notePhraseError } = await supabase
    .from('note_phrases')
    .select('note_id')
    .in('phrase_id', phraseIds);
  
  if (notePhraseError) {
    console.error('Error searching note-phrase links:', notePhraseError);
    throw new Error(`Failed to search note-phrase links: ${notePhraseError.message}`);
  }
  
  if (!notePhrases || notePhrases.length === 0) {
    return [];
  }
  
  const noteIds = [...new Set(notePhrases.map(np => np.note_id))];
  
  // Get the actual notes
  const { data: notes, error: notesError } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .in('id', noteIds)
    .order('created_at', { ascending: false });
  
  if (notesError) {
    console.error('Error fetching notes:', notesError);
    throw new Error(`Failed to fetch notes: ${notesError.message}`);
  }
  
  return (notes || []) as Note[];
}

/**
 * Search notes by keywords in title and body
 */
export async function searchNotesByKeywords(
  userId: string,
  keywords: string[],
  accessToken?: string
): Promise<Note[]> {
  if (!keywords || keywords.length === 0) {
    return [];
  }
  
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  
  // Build a query that searches for all keywords
  // Using PostgreSQL's text search capabilities
  let query = supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId);
  
  // For each keyword, add a filter (OR condition)
  // Note: Supabase doesn't support complex OR queries easily, so we'll use ilike
  const keywordFilters = keywords
    .map(k => k.trim())
    .filter(k => k.length > 0)
    .map(keyword => {
      return `title.ilike.%${keyword}%,body.ilike.%${keyword}%`;
    });
  
  if (keywordFilters.length === 0) {
    return [];
  }
  
  // Use or() to combine filters
  const orConditions = keywordFilters.flatMap(filter => {
    const [titleFilter, bodyFilter] = filter.split(',');
    return [
      { title: { ilike: `%${titleFilter.split('.')[2]}%` } },
      { body: { ilike: `%${bodyFilter.split('.')[2]}%` } },
    ];
  });
  
  // Since Supabase's or() is complex, we'll use a simpler approach:
  // Get all notes and filter in memory (for small datasets)
  // Or use PostgreSQL full-text search if available
  const { data: allNotes, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching notes for keyword search:', error);
    throw new Error(`Failed to search notes: ${error.message}`);
  }
  
  if (!allNotes) {
    return [];
  }
  
  // Filter notes that contain all keywords
  const normalizedKeywords = keywords.map(k => k.toLowerCase().trim()).filter(k => k.length > 0);
  
  const matchingNotes = allNotes.filter(note => {
    const title = (note.title || '').toLowerCase();
    const body = (note.body || '').toLowerCase();
    const combinedText = `${title} ${body}`;
    
    return normalizedKeywords.every(keyword => combinedText.includes(keyword));
  });
  
  return matchingNotes as Note[];
}

/**
 * Get popular phrases (most frequently used)
 */
export async function getPopularPhrases(
  userId: string,
  limit: number = 20,
  category?: PhraseCategory,
  accessToken?: string
): Promise<Phrase[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  
  // First get phrases for the user, optionally filtered by category
  let phraseQuery = supabase
    .from('phrases')
    .select('id, user_id, phrase_text, category, pos_pattern, first_seen_at, last_seen_at')
    .eq('user_id', userId);
  
  if (category) {
    phraseQuery = phraseQuery.eq('category', category);
  }
  
  const { data: userPhrases, error: phrasesError } = await phraseQuery;
  
  if (phrasesError) {
    console.error('Error getting user phrases:', phrasesError);
    throw new Error(`Failed to get phrases: ${phrasesError.message}`);
  }
  
  if (!userPhrases || userPhrases.length === 0) {
    return [];
  }
  
  const phraseIds = userPhrases.map(p => p.id);
  
  // Count how many notes each phrase appears in
  const { data: notePhrases, error: notePhraseError } = await supabase
    .from('note_phrases')
    .select('phrase_id')
    .in('phrase_id', phraseIds);
  
  if (notePhraseError) {
    console.error('Error getting note-phrase links:', notePhraseError);
    throw new Error(`Failed to get note-phrase links: ${notePhraseError.message}`);
  }
  
  // Count occurrences
  const phraseMap = new Map<string, { phrase: Phrase; count: number }>();
  
  for (const phrase of userPhrases) {
    phraseMap.set(phrase.id, { phrase: phrase as Phrase, count: 0 });
  }
  
  for (const notePhrase of notePhrases || []) {
    const existing = phraseMap.get(notePhrase.phrase_id);
    if (existing) {
      existing.count++;
    }
  }
  
  // Sort by count and return top phrases
  const sortedPhrases = Array.from(phraseMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(item => item.phrase);
  
  return sortedPhrases;
}

/**
 * Get notes by phrase category
 */
export async function getNotesByPhraseCategory(
  userId: string,
  category: PhraseCategory,
  accessToken?: string
): Promise<Note[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  
  // Find phrases with the specified category
  const { data: phrases, error: phraseError } = await supabase
    .from('phrases')
    .select('id')
    .eq('user_id', userId)
    .eq('category', category);
  
  if (phraseError) {
    console.error('Error getting phrases by category:', phraseError);
    throw new Error(`Failed to get phrases: ${phraseError.message}`);
  }
  
  if (!phrases || phrases.length === 0) {
    return [];
  }
  
  const phraseIds = phrases.map(p => p.id);
  
  // Find notes linked to these phrases
  const { data: notePhrases, error: notePhraseError } = await supabase
    .from('note_phrases')
    .select('note_id')
    .in('phrase_id', phraseIds);
  
  if (notePhraseError) {
    console.error('Error getting note-phrase links:', notePhraseError);
    throw new Error(`Failed to get note-phrase links: ${notePhraseError.message}`);
  }
  
  if (!notePhrases || notePhrases.length === 0) {
    return [];
  }
  
  const noteIds = [...new Set(notePhrases.map(np => np.note_id))];
  
  // Get the actual notes
  const { data: notes, error: notesError } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .in('id', noteIds)
    .order('created_at', { ascending: false });
  
  if (notesError) {
    console.error('Error fetching notes:', notesError);
    throw new Error(`Failed to fetch notes: ${notesError.message}`);
  }
  
  return (notes || []) as Note[];
}

