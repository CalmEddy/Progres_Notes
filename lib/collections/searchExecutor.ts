import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabaseServerClient';
import { SearchCriteria, SearchFilters } from './types';
import { Note } from '../notes';
import { searchBinderNotes, BinderSearchResult } from '../binder/binderSearch';
import { searchChunksByChunk, ChunkWithSimilarity } from '../chunks/chunkSearch';
import { searchChunksInNote } from '../chunks/chunkSearch';
import { searchChunksAcrossNotes, NoteWithChunkMatches } from '../chunks/chunkSearch';

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
 * Result type for search execution
 * Can return either notes or chunks depending on search type
 */
export type SearchExecutionResult = {
  type: 'notes';
  results: BinderSearchResult[];
} | {
  type: 'chunks';
  results: ChunkWithSimilarity[];
} | {
  type: 'note_chunks';
  results: NoteWithChunkMatches[];
};

/**
 * Apply date filters to notes
 */
function applyDateFilters(notes: Note[], filters: SearchFilters): Note[] {
  let filtered = notes;

  if (filters.dateCreated) {
    const { start, end } = filters.dateCreated;
    filtered = filtered.filter(note => {
      const noteDate = new Date(note.created_at);
      if (start && noteDate < new Date(start)) return false;
      if (end && noteDate > new Date(end)) return false;
      return true;
    });
  }

  if (filters.dateModified) {
    const { start, end } = filters.dateModified;
    filtered = filtered.filter(note => {
      const noteDate = new Date(note.updated_at);
      if (start && noteDate < new Date(start)) return false;
      if (end && noteDate > new Date(end)) return false;
      return true;
    });
  }

  return filtered;
}

/**
 * Apply tag filters to notes
 */
async function applyTagFilters(
  notes: Note[],
  tagIds: string[],
  accessToken?: string
): Promise<Note[]> {
  if (!tagIds || tagIds.length === 0) {
    return notes;
  }

  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Get note IDs that have all the specified tags
  const { data: noteTags, error } = await supabase
    .from('note_tags')
    .select('note_id')
    .in('tag_id', tagIds)
    .in('note_id', notes.map(n => n.id));

  if (error) {
    console.error('Error filtering by tags:', error);
    return notes; // Return unfiltered if error
  }

  // Count how many tags each note has
  const noteTagCounts = new Map<string, number>();
  (noteTags || []).forEach(nt => {
    noteTagCounts.set(nt.note_id, (noteTagCounts.get(nt.note_id) || 0) + 1);
  });

  // Filter notes that have all specified tags
  const requiredTagCount = tagIds.length;
  return notes.filter(note => (noteTagCounts.get(note.id) || 0) >= requiredTagCount);
}

/**
 * Execute a search based on SearchCriteria
 * This is the central function that handles all search types
 */
export async function executeSearchFromCriteria(
  userId: string,
  criteria: SearchCriteria,
  accessToken?: string
): Promise<SearchExecutionResult> {
  const {
    search_type,
    query,
    chunk_id,
    note_id,
    match_threshold = 0.7,
    limit = 20,
    filters = {},
  } = criteria;

  // Handle chunk-based semantic search
  if (search_type === 'chunk_semantic') {
    if (!chunk_id) {
      throw new Error('chunk_id is required for chunk_semantic search');
    }

    const scope = note_id ? 'note' : 'all';
    const chunks = await searchChunksByChunk(
      chunk_id,
      scope,
      match_threshold,
      limit,
      accessToken
    );

    return {
      type: 'chunks',
      results: chunks,
    };
  }

  // Handle note-scoped chunk search
  if (search_type === 'semantic' && note_id) {
    if (!query) {
      throw new Error('query is required for semantic search');
    }

    const chunks = await searchChunksInNote(
      note_id,
      query,
      match_threshold,
      limit,
      accessToken
    );

    return {
      type: 'chunks',
      results: chunks,
    };
  }

  // Handle date-only searches (date_created, date_modified)
  if (search_type === 'date_created' || search_type === 'date_modified') {
    const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

    // Get all notes for the user
    const { data: allNotes, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch notes: ${error.message}`);
    }

    if (!allNotes || allNotes.length === 0) {
      return {
        type: 'notes',
        results: [],
      };
    }

    // Apply date filter - use the appropriate filter from criteria
    const dateFilter: SearchFilters = search_type === 'date_created' 
      ? { dateCreated: filters.dateCreated || {} }
      : { dateModified: filters.dateModified || {} };

    let filteredNotes = applyDateFilters(allNotes as Note[], dateFilter);

    // Apply additional filters
    if (filters.tagIds && filters.tagIds.length > 0) {
      filteredNotes = await applyTagFilters(filteredNotes, filters.tagIds, accessToken);
    }

    // Convert to BinderSearchResult format
    const results: BinderSearchResult[] = filteredNotes.slice(0, limit).map(note => ({
      ...note,
      search_type: search_type as any,
    }));

    return {
      type: 'notes',
      results,
    };
  }

  // Handle standard searches (keyword, semantic, theme, combined)
  // These use searchBinderNotes which handles keyword, semantic, and theme searches
  if (search_type === 'keyword' || search_type === 'semantic' || search_type === 'theme' || search_type === 'combined') {
    if (!query) {
      throw new Error('query is required for this search type');
    }

    // Map search_type to BinderSearchOptions searchType
    const binderSearchType = search_type === 'combined' ? 'combined' :
                            search_type === 'theme' ? 'theme' :
                            search_type === 'semantic' ? 'semantic' :
                            'keyword';

    const results = await searchBinderNotes(
      userId,
      {
        query,
        searchType: binderSearchType,
        filters,
        limit,
        threshold: match_threshold,
      },
      accessToken
    );

    return {
      type: 'notes',
      results,
    };
  }

  throw new Error(`Unsupported search_type: ${search_type}`);
}

