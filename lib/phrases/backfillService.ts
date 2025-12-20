// Load environment variables from .env.local if not already set (for CLI scripts)
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const { config } = require('dotenv');
    const { resolve } = require('path');
    config({ path: resolve(process.cwd(), '.env.local') });
  } catch (e) {
    // dotenv not available or .env.local not found - will fail later with clearer error
  }
}

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Note } from '../notes';
import { extractPhrases } from './phraseExtractor';
import { ExtractedPhrase } from './types';
import { normalizePhraseText } from './phraseExtractor';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Optional service role key for admin operations

export interface BackfillOptions {
  batchSize?: number; // Notes per batch (default: 50)
  skipExisting?: boolean; // Skip notes that already have phrases (default: true)
  userId?: string; // Specific user ID (optional)
  delayMs?: number; // Delay between batches (default: 100ms)
  maxNotes?: number; // Maximum notes to process (optional, for testing)
  verbose?: boolean; // Show detailed debugging output (default: false)
}

export interface BackfillResult {
  totalNotes: number;
  processedNotes: number;
  skippedNotes: number;
  failedNotes: number;
  totalPhrasesExtracted: number;
  errors: Array<{ noteId: string; error: string }>;
  durationMs: number;
}

interface BatchResult {
  processed: number;
  skipped: number;
  failed: number;
  phrasesExtracted: number;
  errors: Array<{ noteId: string; error: string }>;
}

/**
 * Create Supabase client with service role key (bypasses RLS) or anon key
 */
function createSupabaseClient() {
  if (supabaseServiceKey) {
    // Use service role key to bypass RLS for admin operations
    return createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  // Fallback to anon key (will be subject to RLS)
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Get all users who have notes
 */
async function getAllUsersWithNotes(): Promise<string[]> {
  const supabase = createSupabaseClient();
  
  const { data, error } = await supabase
    .from('notes')
    .select('user_id')
    .order('user_id');
  
  if (error) {
    console.error('Error getting users with notes:', error);
    throw new Error(`Failed to get users: ${error.message}`);
  }
  
  // Get unique user IDs
  const userIds = new Set<string>();
  for (const item of data || []) {
    if (item.user_id) {
      userIds.add(item.user_id);
    }
  }
  
  return Array.from(userIds);
}

/**
 * Get all notes for a user (or all notes if no userId specified)
 */
async function getAllNotes(userId?: string, maxNotes?: number): Promise<Note[]> {
  const supabase = createSupabaseClient();
  
  let query = supabase
    .from('notes')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (userId) {
    query = query.eq('user_id', userId);
  }
  
  if (maxNotes) {
    query = query.limit(maxNotes);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error getting notes:', error);
    throw new Error(`Failed to get notes: ${error.message}`);
  }
  
  return (data || []) as Note[];
}

/**
 * Check if a note already has phrases
 */
async function noteHasPhrases(supabase: SupabaseClient, noteId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('note_phrases')
    .select('id')
    .eq('note_id', noteId)
    .limit(1);
  
  if (error) {
    console.error('Error checking note phrases:', error);
    return false; // Assume no phrases if check fails
  }
  
  return (data?.length || 0) > 0;
}

/**
 * Store phrases for a note using the provided Supabase client (bypasses RLS if service role)
 */
async function storePhrasesForNoteWithClient(
  supabase: SupabaseClient,
  userId: string,
  noteId: string,
  phrases: ExtractedPhrase[]
): Promise<void> {
  if (!phrases || phrases.length === 0) {
    return;
  }

  try {
    // Process each phrase: upsert phrase, then create note-phrase link
    for (const phrase of phrases) {
      const normalizedText = normalizePhraseText(phrase.text);

      // Skip empty phrases
      if (!normalizedText || normalizedText.length === 0) {
        continue;
      }

      // Step 1: Upsert phrase (insert if new, update last_seen_at if exists)
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
    throw error;
  }
}

/**
 * Process a single note: extract and store phrases
 */
async function processNote(
  supabase: SupabaseClient,
  note: Note,
  skipExisting: boolean,
  verbose: boolean = false
): Promise<{ success: boolean; phrasesCount: number; wasSkipped: boolean; phrases?: ExtractedPhrase[]; error?: string }> {
  try {
    // Check if note already has phrases
    if (skipExisting) {
      const hasPhrases = await noteHasPhrases(supabase, note.id);
      if (hasPhrases) {
        if (verbose) {
          const noteTitle = note.title || 'Untitled';
          const bodyPreview = note.body ? (note.body.length > 50 ? note.body.substring(0, 50) + '...' : note.body) : '(no body)';
          console.log(`  [SKIP] Note ${note.id.substring(0, 8)}... "${noteTitle}" - Already has phrases`);
        }
        return { success: true, phrasesCount: 0, wasSkipped: true }; // Skipped
      }
    }
    
    // Combine title and body for extraction
    const textToExtract = note.title
      ? (note.body ? `${note.title}\n\n${note.body}`.trim() : note.title.trim())
      : note.body.trim();
    
    if (!textToExtract || textToExtract.length === 0) {
      if (verbose) {
        const noteTitle = note.title || 'Untitled';
        console.log(`  [EMPTY] Note ${note.id.substring(0, 8)}... "${noteTitle}" - No text to extract`);
      }
      return { success: true, phrasesCount: 0, wasSkipped: false }; // No text to extract
    }
    
    // Extract phrases
    const phrases = extractPhrases(textToExtract);
    
    if (phrases.length === 0) {
      if (verbose) {
        const noteTitle = note.title || 'Untitled';
        const bodyPreview = note.body ? (note.body.length > 100 ? note.body.substring(0, 100) + '...' : note.body) : '(no body)';
        console.log(`  [NO PHRASES] Note ${note.id.substring(0, 8)}... "${noteTitle}"`);
        console.log(`    Preview: ${bodyPreview}`);
      }
      return { success: true, phrasesCount: 0, wasSkipped: false, phrases: [] }; // No phrases found
    }
    
    // Store phrases using the provided Supabase client
    await storePhrasesForNoteWithClient(supabase, note.user_id, note.id, phrases);
    
    if (verbose) {
      const noteTitle = note.title || 'Untitled';
      const bodyPreview = note.body ? (note.body.length > 100 ? note.body.substring(0, 100) + '...' : note.body) : '(no body)';
      console.log(`  [✓] Note ${note.id.substring(0, 8)}... "${noteTitle}" - Extracted ${phrases.length} phrase(s)`);
      console.log(`    Preview: ${bodyPreview}`);
      console.log(`    Phrases: ${phrases.map(p => `"${p.text}"`).join(', ')}`);
    }
    
    return { success: true, phrasesCount: phrases.length, wasSkipped: false, phrases };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (verbose) {
      const noteTitle = note.title || 'Untitled';
      console.log(`  [ERROR] Note ${note.id.substring(0, 8)}... "${noteTitle}" - ${errorMessage}`);
    }
    return { success: false, phrasesCount: 0, wasSkipped: false, error: errorMessage };
  }
}

/**
 * Process a batch of notes
 */
async function processNoteBatch(
  supabase: SupabaseClient,
  notes: Note[],
  skipExisting: boolean,
  delayMs: number = 0,
  verbose: boolean = false
): Promise<BatchResult> {
  const result: BatchResult = {
    processed: 0,
    skipped: 0,
    failed: 0,
    phrasesExtracted: 0,
    errors: [],
  };
  
  // Process notes concurrently (with a limit to avoid overwhelming the system)
  const CONCURRENT_LIMIT = 10;
  for (let i = 0; i < notes.length; i += CONCURRENT_LIMIT) {
    const batch = notes.slice(i, i + CONCURRENT_LIMIT);
    
    const batchPromises = batch.map(async (note) => {
      const noteResult = await processNote(supabase, note, skipExisting, verbose);
      
      if (!noteResult.success) {
        result.failed++;
        result.errors.push({
          noteId: note.id,
          error: noteResult.error || 'Unknown error',
        });
      } else if (noteResult.wasSkipped) {
        result.skipped++;
      } else {
        result.processed++;
        result.phrasesExtracted += noteResult.phrasesCount;
      }
    });
    
    await Promise.all(batchPromises);
    
    // Add delay between batches
    if (delayMs > 0 && i + CONCURRENT_LIMIT < notes.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return result;
}

/**
 * Process notes for a specific user
 */
export async function processUserNotes(
  userId: string,
  options: BackfillOptions = {}
): Promise<BackfillResult> {
  const startTime = Date.now();
  const {
    batchSize = 50,
    skipExisting = true,
    delayMs = 100,
    maxNotes,
    verbose = false,
  } = options;
  
  console.log(`\nStarting backfill for user: ${userId}`);
  console.log(`Options: batchSize=${batchSize}, skipExisting=${skipExisting}, maxNotes=${maxNotes || 'unlimited'}, verbose=${verbose}`);
  
  // Get all notes for user
  const allNotes = await getAllNotes(userId, maxNotes);
  const totalNotes = allNotes.length;
  
  console.log(`Found ${totalNotes} notes to process`);
  
  if (totalNotes === 0) {
    return {
      totalNotes: 0,
      processedNotes: 0,
      skippedNotes: 0,
      failedNotes: 0,
      totalPhrasesExtracted: 0,
      errors: [],
      durationMs: Date.now() - startTime,
    };
  }
  
  // Create Supabase client for batch processing
  const supabase = createSupabaseClient();
  
  // Process notes in batches
  const result: BackfillResult = {
    totalNotes,
    processedNotes: 0,
    skippedNotes: 0,
    failedNotes: 0,
    totalPhrasesExtracted: 0,
    errors: [],
    durationMs: 0,
  };
  
  // Split notes into batches
  const batches: Note[][] = [];
  for (let i = 0; i < allNotes.length; i += batchSize) {
    batches.push(allNotes.slice(i, i + batchSize));
  }
  
  console.log(`Processing ${batches.length} batches...`);
  
  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchNumber = batchIndex + 1;
    
    if (verbose) {
      console.log(`\nProcessing batch ${batchNumber}/${batches.length} (${batch.length} notes)...`);
    } else {
      console.log(`Processing batch ${batchNumber}/${batches.length} (${batch.length} notes)...`);
    }
    
    const batchResult = await processNoteBatch(supabase, batch, skipExisting, delayMs, verbose);
    
    result.processedNotes += batchResult.processed;
    result.skippedNotes += batchResult.skipped;
    result.failedNotes += batchResult.failed;
    result.totalPhrasesExtracted += batchResult.phrasesExtracted;
    result.errors.push(...batchResult.errors);
    
    const progress = ((batchNumber / batches.length) * 100).toFixed(1);
    if (!verbose) {
      console.log(
        `Batch ${batchNumber} complete: ${batchResult.processed} processed, ` +
        `${batchResult.skipped} skipped, ${batchResult.failed} failed, ` +
        `${batchResult.phrasesExtracted} phrases extracted (${progress}% complete)`
      );
    }
  }
  
  result.durationMs = Date.now() - startTime;
  
  console.log(`\nBackfill complete for user ${userId}:`);
  console.log(`  Total notes: ${result.totalNotes}`);
  console.log(`  Processed: ${result.processedNotes}`);
  console.log(`  Skipped: ${result.skippedNotes}`);
  console.log(`  Failed: ${result.failedNotes}`);
  console.log(`  Total phrases extracted: ${result.totalPhrasesExtracted}`);
  console.log(`  Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
  
  return result;
}

/**
 * Process notes for all users
 */
export async function processAllUsersNotes(
  options: BackfillOptions = {}
): Promise<BackfillResult> {
  const startTime = Date.now();
  const {
    batchSize = 50,
    skipExisting = true,
    delayMs = 100,
    maxNotes,
    verbose = false,
  } = options;
  
  console.log('\n=== Starting backfill for all users ===');
  console.log(`Options: batchSize=${batchSize}, skipExisting=${skipExisting}, maxNotes=${maxNotes || 'unlimited'}, verbose=${verbose}`);
  
  // Get all users with notes
  const userIds = await getAllUsersWithNotes();
  console.log(`Found ${userIds.length} users with notes`);
  
  if (userIds.length === 0) {
    return {
      totalNotes: 0,
      processedNotes: 0,
      skippedNotes: 0,
      failedNotes: 0,
      totalPhrasesExtracted: 0,
      errors: [],
      durationMs: Date.now() - startTime,
    };
  }
  
  // Aggregate results
  const aggregateResult: BackfillResult = {
    totalNotes: 0,
    processedNotes: 0,
    skippedNotes: 0,
    failedNotes: 0,
    totalPhrasesExtracted: 0,
    errors: [],
    durationMs: 0,
  };
  
  // Process each user
  for (let userIndex = 0; userIndex < userIds.length; userIndex++) {
    const userId = userIds[userIndex];
    const userNumber = userIndex + 1;
    
    console.log(`\n[${userNumber}/${userIds.length}] Processing user: ${userId}`);
    
    try {
      const userResult = await processUserNotes(userId, {
        batchSize,
        skipExisting,
        delayMs,
        maxNotes,
        verbose,
      });
      
      aggregateResult.totalNotes += userResult.totalNotes;
      aggregateResult.processedNotes += userResult.processedNotes;
      aggregateResult.skippedNotes += userResult.skippedNotes;
      aggregateResult.failedNotes += userResult.failedNotes;
      aggregateResult.totalPhrasesExtracted += userResult.totalPhrasesExtracted;
      aggregateResult.errors.push(...userResult.errors);
    } catch (error) {
      console.error(`Error processing user ${userId}:`, error);
      aggregateResult.errors.push({
        noteId: userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  aggregateResult.durationMs = Date.now() - startTime;
  
  console.log('\n=== Backfill complete for all users ===');
  console.log(`  Total notes: ${aggregateResult.totalNotes}`);
  console.log(`  Processed: ${aggregateResult.processedNotes}`);
  console.log(`  Skipped: ${aggregateResult.skippedNotes}`);
  console.log(`  Failed: ${aggregateResult.failedNotes}`);
  console.log(`  Total phrases extracted: ${aggregateResult.totalPhrasesExtracted}`);
  console.log(`  Total duration: ${(aggregateResult.durationMs / 1000).toFixed(2)}s`);
  
  return aggregateResult;
}

