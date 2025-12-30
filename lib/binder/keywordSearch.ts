import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabaseServerClient';
import { Note } from '../notes';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface NoteWithRelevance extends Note {
  relevance: number;
  matched_fields?: string[];
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
 * Search notes using PostgreSQL full-text search
 * Uses tsvector and ts_rank for relevance scoring
 */
export async function searchNotesByKeyword(
  userId: string,
  query: string,
  limit: number = 20,
  accessToken?: string
): Promise<NoteWithRelevance[]> {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Clean and prepare the search query
  const cleanQuery = query.trim();
  
  // For simple queries, use ILIKE as fallback
  // For more complex queries, use full-text search
  const useFullTextSearch = cleanQuery.length > 2 && !cleanQuery.includes('%');

  if (useFullTextSearch) {
    // Use PostgreSQL full-text search with ts_rank
    // Convert query to tsquery format
    const tsQuery = cleanQuery
      .split(/\s+/)
      .map(word => word.replace(/[^\w]/g, ''))
      .filter(word => word.length > 0)
      .join(' & ');

    if (tsQuery.length === 0) {
      return [];
    }

    // Use RPC call for full-text search with ranking
    const { data, error } = await supabase.rpc('search_notes_fts', {
      p_user_id: userId,
      p_query: tsQuery,
      p_limit: limit,
    });

    if (error) {
      // Fallback to manual query if RPC doesn't exist
      console.warn('FTS RPC function not found, using manual query:', error);
      return searchNotesByKeywordManual(supabase, userId, cleanQuery, limit);
    }

    return (data || []) as NoteWithRelevance[];
  } else {
    // Use ILIKE for simple queries
    return searchNotesByKeywordManual(supabase, userId, cleanQuery, limit);
  }
}

/**
 * Manual keyword search using ILIKE (fallback)
 */
async function searchNotesByKeywordManual(
  supabase: any,
  userId: string,
  query: string,
  limit: number
): Promise<NoteWithRelevance[]> {
  const searchPattern = `%${query}%`;

  // Search in both title and body
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .or(`title.ilike.${searchPattern},body.ilike.${searchPattern}`)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error searching notes by keyword:', error);
    throw new Error(`Failed to search notes: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  // Calculate relevance score based on where the match occurs
  const notesWithRelevance: NoteWithRelevance[] = (data as Note[]).map(note => {
    const queryLower = query.toLowerCase();
    const titleLower = (note.title || '').toLowerCase();
    const bodyLower = (note.body || '').toLowerCase();

    let relevance = 0;
    const matchedFields: string[] = [];

    // Title matches are more relevant
    if (titleLower.includes(queryLower)) {
      relevance += 2;
      matchedFields.push('title');
    }

    // Body matches
    if (bodyLower.includes(queryLower)) {
      relevance += 1;
      matchedFields.push('body');
    }

    // Boost relevance if match is at the start
    if (titleLower.startsWith(queryLower)) {
      relevance += 1;
    }

    return {
      ...note,
      relevance,
      matched_fields: matchedFields,
    };
  });

  // Sort by relevance (highest first)
  return notesWithRelevance.sort((a, b) => b.relevance - a.relevance);
}

/**
 * Search notes using PostgreSQL full-text search with phrase matching
 */
export async function searchNotesByPhrase(
  userId: string,
  phrase: string,
  limit: number = 20,
  accessToken?: string
): Promise<NoteWithRelevance[]> {
  if (!phrase || phrase.trim().length === 0) {
    return [];
  }

  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Use full-text search for phrase matching
  // Convert phrase to tsquery with phrase operator
  const tsQuery = phrase
    .trim()
    .split(/\s+/)
    .map(word => word.replace(/[^\w]/g, ''))
    .filter(word => word.length > 0)
    .join(' <-> '); // <-> operator for phrase matching

  if (tsQuery.length === 0) {
    return [];
  }

  // Use RPC call for phrase search
  const { data, error } = await supabase.rpc('search_notes_fts', {
    p_user_id: userId,
    p_query: tsQuery,
    p_limit: limit,
  });

  if (error) {
    // Fallback to keyword search
    console.warn('FTS RPC function not found, using keyword search:', error);
    return searchNotesByKeyword(userId, phrase, limit, accessToken);
  }

  return (data || []) as NoteWithRelevance[];
}

