import { createSupabaseServerClient } from '../supabaseServerClient';
import { createClient } from '@supabase/supabase-js';
import { Note } from '../notes';
import { generateEmbedding } from '../embeddings';
import { parseRelativeDate, parseDate } from './dateParser';
import {
  FilterCondition,
  KeywordFilterCondition,
  EmbeddingFilterCondition,
  DateFilterCondition,
  TagFilterCondition,
  TextPatternFilterCondition,
} from './types';

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
 * Apply keyword filter to notes
 */
async function applyKeywordFilter(
  notes: Note[],
  condition: KeywordFilterCondition
): Promise<Note[]> {
  const searchTerm = condition.value.toLowerCase();
  
  return notes.filter(note => {
    const titleLower = (note.title || '').toLowerCase();
    const bodyLower = note.body.toLowerCase();
    const matches = titleLower.includes(searchTerm) || bodyLower.includes(searchTerm);
    
    return condition.operator === 'contains' ? matches : !matches;
  });
}

/**
 * Apply embedding filter to notes (semantic similarity)
 */
// Global debug info object to capture embedding filter details
let embeddingFilterDebugInfo: any = null;

async function applyEmbeddingFilter(
  notes: Note[],
  condition: EmbeddingFilterCondition,
  userId: string,
  accessToken?: string
): Promise<Note[]> {
  const threshold = condition.threshold || 0.15;  // Lower default threshold for semantic search
  
  console.log('[Embedding Filter] Starting filter:', {
    query: condition.query,
    threshold,
    inputNotesCount: notes.length,
    userId
  });
  
  // Generate embedding for the query
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(condition.query);
    console.log('[Embedding Filter] Query embedding generated, dimensions:', queryEmbedding.length);
  } catch (error) {
    console.error('[Embedding Filter] Failed to generate query embedding:', error);
    throw error;
  }
  
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  
  // Use the match_notes function to find similar notes
  console.log('[Embedding Filter] Calling match_notes RPC with threshold:', threshold);
  console.log('[Embedding Filter] Query embedding length:', queryEmbedding.length, 'first 5 values:', queryEmbedding.slice(0, 5));
  
  // First, let's check if there are any notes with embeddings at all
  const { count: notesWithEmbeddings } = await supabase
    .from('notes')
    .select('id', { count: 'exact', head: true })
    .not('embedding', 'is', null);
  
  console.log('[Embedding Filter] Notes with embeddings in database:', notesWithEmbeddings);
  
  // Run with the actual threshold
  const { data: similarNotes, error } = await supabase.rpc('match_notes', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: 1000,
  });
  
  const rpcResult = {
    hasError: !!error,
    error: error ? error.message : null,
    resultCount: similarNotes?.length || 0,
    firstFewResults: similarNotes?.slice(0, 5).map((n: any) => ({
      id: n.id,
      title: n.title?.substring(0, 50),
      similarity: n.similarity,
      user_id: n.user_id
    })) || []
  };
  
  console.log('[Embedding Filter] RPC call result:', rpcResult);
  
  // Store debug info for API response
  embeddingFilterDebugInfo = {
    query: condition.query,
    threshold,
    inputNotesCount: notes.length,
    notesWithEmbeddings,
    queryEmbeddingLength: queryEmbedding.length,
    rpcResult
  };
  
  if (error) {
    console.error('[Embedding Filter] Error in embedding search:', error);
    return []; // Return empty if embedding search fails
  }
  
  // Get IDs of similar notes that meet the threshold
  const similarNoteIds = new Set(
    (similarNotes || [])
      .filter((note: any) => {
        const meetsUserId = note.user_id === userId;
        const meetsThreshold = note.similarity >= threshold;
        if (!meetsUserId) {
          console.log('[Embedding Filter] Note filtered out - wrong user_id:', note.id, 'note.user_id:', note.user_id, 'expected:', userId);
        }
        if (!meetsThreshold) {
          console.log('[Embedding Filter] Note filtered out - similarity too low:', note.id, 'similarity:', note.similarity, 'threshold:', threshold);
        }
        return meetsUserId && meetsThreshold;
      })
      .map((note: any) => note.id)
  );
  
  console.log('[Embedding Filter] Similar note IDs after filtering:', Array.from(similarNoteIds));
  
  // Filter our notes to only include those that match
  const filtered = notes.filter(note => similarNoteIds.has(note.id));
  console.log('[Embedding Filter] Final filtered notes count:', filtered.length);
  
  // Update debug info with final results
  if (embeddingFilterDebugInfo) {
    embeddingFilterDebugInfo.finalFilteredCount = filtered.length;
    embeddingFilterDebugInfo.similarNoteIds = Array.from(similarNoteIds);
  }
  
  return filtered;
}

/**
 * Apply date filter to notes
 */
function applyDateFilter(
  notes: Note[],
  condition: DateFilterCondition
): Note[] {
  const dateField = condition.type === 'date_created' ? 'created_at' : 'updated_at';
  
  if (condition.operator === 'equals') {
    if (!condition.value) return [];
    
    const targetDate = parseDate(condition.value);
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);
    
    return notes.filter(note => {
      const noteDate = new Date(note[dateField as keyof Note] as string);
      return noteDate >= start && noteDate <= end;
    });
  }
  
  if (condition.operator === 'range') {
    if (!condition.startDate || !condition.endDate) return [];
    
    const start = parseDate(condition.startDate);
    start.setHours(0, 0, 0, 0);
    const end = parseDate(condition.endDate);
    end.setHours(23, 59, 59, 999);
    
    return notes.filter(note => {
      const noteDate = new Date(note[dateField as keyof Note] as string);
      return noteDate >= start && noteDate <= end;
    });
  }
  
  if (condition.operator === 'relative') {
    if (!condition.relativeValue) return [];
    
    try {
      const range = parseRelativeDate(condition.relativeValue);
      return notes.filter(note => {
        const noteDate = new Date(note[dateField as keyof Note] as string);
        return noteDate >= range.startDate && noteDate <= range.endDate;
      });
    } catch (error) {
      console.error('Error parsing relative date:', error);
      return [];
    }
  }
  
  return notes;
}

/**
 * Apply tag filter to notes
 */
async function applyTagFilter(
  notes: Note[],
  condition: TagFilterCondition,
  userId: string,
  accessToken?: string
): Promise<Note[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  
  if (condition.operator === 'equals') {
    // Single tag ID
    const tagId = condition.tagIds[0];
    if (!tagId) return [];
    
    // Get all note IDs with this tag
    const { data: noteTags } = await supabase
      .from('note_tags')
      .select('note_id')
      .eq('tag_id', tagId)
      .in('note_id', notes.map(n => n.id));
    
    const matchingNoteIds = new Set((noteTags || []).map((nt: any) => nt.note_id));
    return notes.filter(note => matchingNoteIds.has(note.id));
  }
  
  if (condition.operator === 'in') {
    // Multiple tag IDs - note must have at least one of them
    if (condition.tagIds.length === 0) return [];
    
    const { data: noteTags } = await supabase
      .from('note_tags')
      .select('note_id')
      .in('tag_id', condition.tagIds)
      .in('note_id', notes.map(n => n.id));
    
    const matchingNoteIds = new Set((noteTags || []).map((nt: any) => nt.note_id));
    return notes.filter(note => matchingNoteIds.has(note.id));
  }
  
  return notes;
}

/**
 * Apply text pattern filter to notes
 */
function applyTextPatternFilter(
  notes: Note[],
  condition: TextPatternFilterCondition
): Note[] {
  return notes.filter(note => {
    const title = note.title || '';
    const body = note.body;
    const fullText = `${title}\n${body}`;
    return fullText.includes(condition.pattern);
  });
}

/**
 * Execute filter conditions against notes
 * All conditions are combined with AND logic
 */
export async function executeFilter(
  notes: Note[],
  conditions: FilterCondition[],
  userId: string,
  accessToken?: string
): Promise<Note[]> {
  console.log('[Execute Filter] Starting filter execution:', {
    inputNotesCount: notes.length,
    conditionsCount: conditions.length,
    conditionTypes: conditions.map(c => c.type)
  });

  if (conditions.length === 0) {
    return notes;
  }
  
  let filteredNotes = [...notes];
  
  // Apply each condition sequentially (AND logic)
  for (const condition of conditions) {
    console.log('[Execute Filter] Processing condition:', {
      type: condition.type,
      currentNotesCount: filteredNotes.length
    });
    switch (condition.type) {
      case 'keyword':
        filteredNotes = await applyKeywordFilter(filteredNotes, condition);
        break;
        
      case 'embedding':
        console.log('[Execute Filter] Calling applyEmbeddingFilter');
        filteredNotes = await applyEmbeddingFilter(
          filteredNotes,
          condition,
          userId,
          accessToken
        );
        console.log('[Execute Filter] applyEmbeddingFilter returned', filteredNotes.length, 'notes');
        break;
        
      case 'date_created':
      case 'date_modified':
        filteredNotes = applyDateFilter(filteredNotes, condition);
        break;
        
      case 'tag':
        filteredNotes = await applyTagFilter(
          filteredNotes,
          condition,
          userId,
          accessToken
        );
        break;
        
      case 'text_pattern':
        filteredNotes = applyTextPatternFilter(filteredNotes, condition);
        break;
        
      default:
        console.warn('Unknown filter condition type:', (condition as any).type);
    }
    
    // Early exit if no notes match
    if (filteredNotes.length === 0) {
      return [];
    }
  }
  
  return filteredNotes;
}

/**
 * Pre-process filter conditions for database function
 * - Parse relative dates to date ranges
 * - Generate embeddings for embedding conditions
 */
async function preprocessConditions(
  conditions: FilterCondition[],
  accessToken?: string
): Promise<{ processedConditions: FilterCondition[]; queryEmbedding: number[] | null; embeddingThreshold: number }> {
  const processedConditions: FilterCondition[] = [];
  let queryEmbedding: number[] | null = null;
  let embeddingThreshold = 0.15;

  for (const condition of conditions) {
    if (condition.type === 'embedding') {
      // Generate embedding for the query
      queryEmbedding = await generateEmbedding(condition.query);
      embeddingThreshold = condition.threshold || 0.15;
      // Keep the condition in the array (database function will use it)
      processedConditions.push(condition);
    } else if (condition.type === 'date_created' || condition.type === 'date_modified') {
      // Convert relative dates to date ranges
      if (condition.operator === 'relative' && condition.relativeValue) {
        try {
          const range = parseRelativeDate(condition.relativeValue);
          processedConditions.push({
            ...condition,
            operator: 'range',
            startDate: range.startDate.toISOString(),
            endDate: range.endDate.toISOString(),
            relativeValue: undefined,
            value: undefined,
          });
        } catch (error) {
          console.error('Error parsing relative date:', error);
          // Skip invalid relative date conditions
        }
      } else {
        processedConditions.push(condition);
      }
    } else {
      processedConditions.push(condition);
    }
  }

  return { processedConditions, queryEmbedding, embeddingThreshold };
}

/**
 * Result type for filtered notes with tags
 */
export interface FilteredNoteResult {
  notes: Note[];
  noteTags: Record<string, any[]>; // Map of note ID to tags array
}

/**
 * Get all notes for a user and apply filter using optimized database function
 * Returns notes with their tags included
 */
export async function filterNotesForUser(
  userId: string,
  conditions: FilterCondition[],
  accessToken?: string
): Promise<FilteredNoteResult> {
  console.log('[Filter Notes For User] Starting optimized filter:', {
    userId,
    conditionsCount: conditions.length
  });

  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  if (conditions.length === 0) {
    // No conditions - return all notes with tags
    const { listNotesForUser } = await import('../notes');
    const allNotes = await listNotesForUser(userId, null, null, accessToken);
    
    // Fetch tags for all notes in bulk
    const noteIds = allNotes.map(n => n.id);
    const noteTags: Record<string, any[]> = {};
    
    if (noteIds.length > 0) {
      const { data: tagsData } = await supabase
        .from('note_tags')
        .select(`
          note_id,
          tags (
            id,
            name,
            color
          )
        `)
        .in('note_id', noteIds);
      
      if (tagsData) {
        for (const row of tagsData) {
          if (!noteTags[row.note_id]) {
            noteTags[row.note_id] = [];
          }
          if (row.tags) {
            noteTags[row.note_id].push(row.tags);
          }
        }
      }
    }
    
    return { notes: allNotes, noteTags };
  }

  // Pre-process conditions (parse relative dates, generate embeddings)
  const { processedConditions, queryEmbedding, embeddingThreshold } = await preprocessConditions(conditions, accessToken);

  // Call the database function
  const startTime = Date.now();
  const { data, error } = await supabase.rpc('filter_notes_for_user', {
    p_filter_conditions: processedConditions,
    p_query_embedding: queryEmbedding,
    p_embedding_threshold: embeddingThreshold,
  });

  const duration = Date.now() - startTime;
  console.log('[Filter Notes For User] Database function completed in', duration, 'ms');

  if (error) {
    console.error('[Filter Notes For User] Database function error:', error);
    throw new Error(`Failed to filter notes: ${error.message}`);
  }

  // Convert database results to Note[] format and extract tags
  const notes: Note[] = [];
  const noteTags: Record<string, any[]> = {};
  
  for (const row of (data || [])) {
    notes.push({
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      body: row.body,
      folder_id: row.folder_id,
      parent_note_id: row.parent_note_id,
      position: row.position,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
    
    // Extract tags from JSONB array
    if (row.tags && Array.isArray(row.tags)) {
      noteTags[row.id] = row.tags;
    } else {
      noteTags[row.id] = [];
    }
  }

  console.log('[Filter Notes For User] Final result:', notes.length, 'notes');

  return { notes, noteTags };
}

// Export functions to access debug info
export function getEmbeddingFilterDebugInfo() {
  return embeddingFilterDebugInfo;
}

export function clearEmbeddingFilterDebugInfo() {
  embeddingFilterDebugInfo = null;
}

