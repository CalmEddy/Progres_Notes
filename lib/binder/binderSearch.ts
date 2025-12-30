import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabaseServerClient';
import { generateEmbedding } from '../embeddings';
import { Note } from '../notes';
import { searchNotesByKeyword, NoteWithRelevance } from './keywordSearch';
import { searchNotesByTheme, NoteWithThemeSimilarity } from './themeSearch';
import { searchNotesForUser, NoteWithSimilarity } from '../notes';
import { searchChunksAcrossNotes } from '../chunks/chunkSearch';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type SearchType = 'keyword' | 'semantic' | 'theme' | 'combined' | 'auto';

export interface SearchFilters {
  dateCreated?: {
    start?: string;
    end?: string;
  };
  dateModified?: {
    start?: string;
    end?: string;
  };
  tagIds?: string[];
  themeId?: string;
}

export interface BinderSearchResult extends Note {
  relevance?: number;
  similarity?: number;
  theme_similarity?: number;
  theme_label?: string | null;
  matched_fields?: string[];
  search_type: SearchType;
  matching_chunk_text?: string;
}

export interface BinderSearchOptions {
  query: string;
  searchType?: SearchType;
  filters?: SearchFilters;
  limit?: number;
  threshold?: number;
  themeThreshold?: number;
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
 * Parse search query to detect search intent
 */
function parseSearchQuery(query: string): SearchType {
  const trimmed = query.trim();
  
  // If query is very short, use keyword search
  if (trimmed.length < 3) {
    return 'keyword';
  }

  // If query looks like a date, use keyword search with date filter
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed) || /^(today|yesterday|this week|this month|last month)/i.test(trimmed)) {
    return 'keyword';
  }

  // For longer queries, use semantic search by default
  // User can override with searchType parameter
  return 'auto';
}

/**
 * Apply date filters to notes
 */
function filterByDate(
  notes: Note[],
  filters: SearchFilters
): Note[] {
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
async function filterByTags(
  notes: Note[],
  tagIds: string[],
  userId: string,
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
 * Combine search results from different sources
 */
function combineSearchResults(
  keywordResults: NoteWithRelevance[],
  semanticResults: NoteWithSimilarity[],
  themeResults: NoteWithThemeSimilarity[]
): BinderSearchResult[] {
  const noteMap = new Map<string, BinderSearchResult>();

  // Add keyword results
  keywordResults.forEach(note => {
    noteMap.set(note.id, {
      ...note,
      relevance: note.relevance,
      matched_fields: note.matched_fields,
      search_type: 'keyword' as SearchType,
    });
  });

  // Add semantic results (merge if exists, otherwise add)
  semanticResults.forEach(note => {
    const existing = noteMap.get(note.id);
    if (existing) {
      existing.similarity = note.similarity;
      existing.search_type = 'combined' as SearchType;
    } else {
      noteMap.set(note.id, {
        ...note,
        similarity: note.similarity,
        search_type: 'semantic' as SearchType,
      });
    }
  });

  // Add theme results (merge if exists, otherwise add)
  themeResults.forEach(note => {
    const existing = noteMap.get(note.id);
    if (existing) {
      existing.theme_similarity = note.theme_similarity;
      existing.theme_label = note.theme_label;
      if (existing.search_type === 'keyword' || existing.search_type === 'semantic') {
        existing.search_type = 'combined' as SearchType;
      } else if (existing.search_type !== 'combined') {
        existing.search_type = 'theme' as SearchType;
      }
    } else {
      noteMap.set(note.id, {
        ...note,
        theme_similarity: note.theme_similarity,
        theme_label: note.theme_label,
        search_type: 'theme' as SearchType,
      });
    }
  });

  // Convert to array and sort by combined score
  const results = Array.from(noteMap.values());

  // Sort by combined relevance score
  results.sort((a, b) => {
    const scoreA = (a.relevance || 0) + (a.similarity || 0) * 2 + (a.theme_similarity || 0) * 1.5;
    const scoreB = (b.relevance || 0) + (b.similarity || 0) * 2 + (b.theme_similarity || 0) * 1.5;
    return scoreB - scoreA;
  });

  return results;
}

/**
 * Main search function for binder notes
 * Supports keyword, semantic, theme, and combined searches
 */
export async function searchBinderNotes(
  userId: string,
  options: BinderSearchOptions,
  accessToken?: string
): Promise<BinderSearchResult[]> {
  const {
    query,
    searchType = 'auto',
    filters = {},
    limit = 20,
    threshold = 0.7,
    themeThreshold = 0.7,
  } = options;

  if (!query || query.trim().length === 0) {
    return [];
  }

  // Determine actual search type
  const actualSearchType = searchType === 'auto' ? parseSearchQuery(query) : searchType;

  let keywordResults: NoteWithRelevance[] = [];
  let semanticResults: NoteWithSimilarity[] = [];
  let themeResults: NoteWithThemeSimilarity[] = [];

  // Perform searches based on type
  if (actualSearchType === 'keyword' || actualSearchType === 'combined') {
    keywordResults = await searchNotesByKeyword(userId, query, limit * 2, accessToken);
  }

  if (actualSearchType === 'semantic' || actualSearchType === 'combined') {
    try {
      console.log('Performing semantic search:', {
        userId,
        query,
        threshold,
        limit: limit * 2,
        actualSearchType,
      });

      // Use chunk-level search for more precise semantic matching
      // When chunks match, the whole note is returned
      const chunkSearchResults = await searchChunksAcrossNotes(
        userId,
        query,
        threshold,
        limit * 2,
        accessToken
      );

      console.log('Semantic search chunk results:', {
        query,
        threshold,
        chunkResultsCount: chunkSearchResults.length,
        chunkResults: chunkSearchResults.slice(0, 5).map(r => ({
          noteId: r.note.id,
          noteTitle: r.note.title,
          bestSimilarity: r.bestChunkSimilarity,
          matchingChunks: r.matchingChunksCount,
        })),
      });

      if (chunkSearchResults.length === 0) {
        console.warn('⚠️ [SEMANTIC SEARCH] Returned 0 chunk results', {
          query,
          threshold,
          userId,
          timestamp: new Date().toISOString(),
          nextSteps: [
            '1. Check "Chunk check" log above to see if chunks with embeddings exist',
            '2. If hasChunksWithEmbeddings: false → Run: npm run backfill-chunks',
            '3. If you see "function does not exist" → Run SQL from supabase/schema.sql line 915',
            '4. If chunks exist but no matches → Lower threshold (current: ' + threshold + ')',
          ],
        });
      } else {
        console.log('✅ [SEMANTIC SEARCH] Successfully found chunk matches', {
          query,
          threshold,
          resultCount: chunkSearchResults.length,
          topSimilarities: chunkSearchResults.slice(0, 3).map(r => r.bestChunkSimilarity),
        });
      }

      // Convert chunk search results to NoteWithSimilarity format
      semanticResults = chunkSearchResults.map(result => ({
        ...result.note,
        similarity: result.bestChunkSimilarity,
        matching_chunk_text: result.bestChunkText,
      }));

      console.log('Semantic search final results:', {
        query,
        threshold,
        semanticResultsCount: semanticResults.length,
      });
    } catch (error) {
      console.error('Error in semantic search:', {
        error,
        userId,
        query,
        threshold,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      // Continue with other search types
    }
  }

  if (actualSearchType === 'theme' || actualSearchType === 'combined') {
    try {
      themeResults = await searchNotesByTheme(userId, query, themeThreshold, limit * 2, accessToken);
    } catch (error) {
      console.error('Error in theme search:', error);
      // Continue with other search types
    }
  }

  // Combine results
  let combinedResults = combineSearchResults(keywordResults, semanticResults, themeResults);

  // Apply filters
  if (filters.dateCreated || filters.dateModified) {
    combinedResults = filterByDate(combinedResults, filters);
  }

  if (filters.tagIds && filters.tagIds.length > 0) {
    combinedResults = await filterByTags(combinedResults, filters.tagIds, userId, accessToken);
  }

  // Filter by theme if specified
  if (filters.themeId) {
    const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
    const { data: themeNotes } = await supabase
      .from('note_themes')
      .select('note_id')
      .eq('id', filters.themeId);

    if (themeNotes) {
      const themeNoteIds = new Set(themeNotes.map(tn => tn.note_id));
      combinedResults = combinedResults.filter(note => themeNoteIds.has(note.id));
    }
  }

  // Limit results
  return combinedResults.slice(0, limit);
}

/**
 * Quick search - automatically determines best search type
 */
export async function quickSearchBinderNotes(
  userId: string,
  query: string,
  limit: number = 20,
  accessToken?: string
): Promise<BinderSearchResult[]> {
  return searchBinderNotes(
    userId,
    {
      query,
      searchType: 'auto',
      limit,
    },
    accessToken
  );
}

