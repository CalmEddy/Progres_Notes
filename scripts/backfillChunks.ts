#!/usr/bin/env tsx

/**
 * Backfill chunks, embeddings, and themes for existing notes
 * This script processes notes in batches and can be run multiple times safely (idempotent)
 * 
 * Usage: tsx scripts/backfillChunks.ts [--batch-size=100] [--notes-limit=1000] [--skip-embeddings] [--skip-themes]
 */

// Load environment variables from .env.local BEFORE any other imports
// Using require() ensures this executes synchronously before module evaluation
const { resolve } = require('path');
const { existsSync } = require('fs');

const envPath = resolve(process.cwd(), '.env.local');
if (!existsSync(envPath)) {
  console.error('Error: .env.local file not found');
  console.error('Expected location:', envPath);
  console.error('Current working directory:', process.cwd());
  process.exit(1);
}

const result = require('dotenv').config({ path: envPath });
if (result.error) {
  console.error('Error loading .env.local:', result.error);
  process.exit(1);
}

// Validate environment variables are loaded before importing modules that need them
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Error: Supabase environment variables not found');
  console.error('Please ensure .env.local exists in the project root and contains:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - NEXT_PUBLIC_SUPABASE_ANON_KEY');
  console.error('');
  console.error('Current working directory:', process.cwd());
  console.error('Looking for .env.local at:', resolve(process.cwd(), '.env.local'));
  process.exit(1);
}

// Debug: Show that variables are loaded (without showing values)
console.log('✓ Environment variables loaded');
console.log(`  NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '✓ set' : '✗ missing'}`);
console.log(`  NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✓ set' : '✗ missing'}`);
console.log(`  SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ set (will bypass RLS)' : '✗ not set (using anon key)'}`);
console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✓ set' : '✗ missing'}`);

// Import createClient (this doesn't check env vars)
import { createClient } from '@supabase/supabase-js';

// Create a Supabase client for scripts (doesn't use Next.js cookies)
function createScriptSupabaseClient() {
  // Use service role key if available (bypasses RLS), otherwise use anon key
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey!;
  
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('Using SUPABASE_SERVICE_ROLE_KEY (bypasses RLS)');
  } else {
    console.log('Using NEXT_PUBLIC_SUPABASE_ANON_KEY (subject to RLS)');
  }
  
  return createClient(supabaseUrl!, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

interface ScriptOptions {
  batchSize: number;
  notesLimit: number | null;
  skipEmbeddings: boolean;
  skipThemes: boolean;
  onlyThemes: boolean;
  regenerateLabels: boolean;
}

async function parseArguments(): Promise<ScriptOptions> {
  const args = process.argv.slice(2);
  
  let batchSize = 100;
  let notesLimit: number | null = null;
  let skipEmbeddings = false;
  let skipThemes = false;
  let onlyThemes = false;
  let regenerateLabels = false;

  for (const arg of args) {
    if (arg.startsWith('--batch-size=')) {
      batchSize = parseInt(arg.split('=')[1], 10);
      if (isNaN(batchSize) || batchSize < 1) {
        throw new Error('batch-size must be a positive integer');
      }
    } else if (arg.startsWith('--notes-limit=')) {
      notesLimit = parseInt(arg.split('=')[1], 10);
      if (isNaN(notesLimit) || notesLimit < 1) {
        throw new Error('notes-limit must be a positive integer');
      }
    } else if (arg === '--skip-embeddings') {
      skipEmbeddings = true;
    } else if (arg === '--skip-themes') {
      skipThemes = true;
    } else if (arg === '--only-themes') {
      onlyThemes = true;
      skipEmbeddings = true; // Implicitly skip embeddings when only generating themes
    } else if (arg === '--regenerate-labels') {
      regenerateLabels = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: tsx scripts/backfillChunks.ts [options]

Options:
  --batch-size=N       Number of notes to process per batch (default: 100)
  --notes-limit=N      Limit total number of notes to process (default: no limit)
  --skip-embeddings    Skip embedding generation (only chunk notes)
  --skip-themes        Skip theme generation (only chunk and embed)
  --only-themes        Only generate themes (skip chunking and embeddings)
  --regenerate-labels  Regenerate theme labels even if user-modified
  --help, -h           Show this help message
      `);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { batchSize, notesLimit, skipEmbeddings, skipThemes, onlyThemes, regenerateLabels };
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  try {
    // Additional validation (already validated above, but double-check)
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Error: Supabase environment variables are missing');
      process.exit(1);
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('Error: OPENAI_API_KEY environment variable is not set');
      console.error('Please ensure .env.local exists and contains OPENAI_API_KEY');
      console.error('Note: Embedding generation requires OpenAI API key');
      if (!process.argv.includes('--skip-embeddings')) {
        process.exit(1);
      } else {
        console.warn('Warning: Continuing without OpenAI API key (embeddings will be skipped)');
      }
    }

    // Optional: Check for service role key
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('');
      console.warn('Warning: SUPABASE_SERVICE_ROLE_KEY not set. Backfill may be limited by RLS policies.');
      console.warn('For processing all users, set SUPABASE_SERVICE_ROLE_KEY in your .env.local file.');
      console.warn('');
    }

    // Now that env vars are loaded, dynamically import the modules
    // This ensures supabaseServerClient doesn't throw errors during import
    console.log('Loading modules...');
    const chunkingModule = await import('../lib/chunks/chunking');
    const embeddingModule = await import('../lib/chunks/embeddingService');
    const themeModule = await import('../lib/themes/themeGeneration');
    console.log('✓ Modules loaded');

    const options = await parseArguments();
    console.log('Starting chunk backfill with options:', options);

    const supabase = createScriptSupabaseClient();
    
    // Create script-safe wrapper functions that use the service role client
    // These bypass the createSupabaseServerClient() call that requires Next.js
    const scriptClient = supabase;
    
    // Wrapper for createChunksForNote that uses script client
    async function createChunksForNoteScript(noteId: string, body: string): Promise<string[]> {
      const chunks = chunkingModule.chunkNoteBody(body);
      
      if (chunks.length === 0) {
        await scriptClient
          .from('note_chunks')
          .delete()
          .eq('note_id', noteId);
        return [];
      }

      // Get existing chunks
      const { data: existingChunks } = await scriptClient
        .from('note_chunks')
        .select('id, chunk_index, chunk_text')
        .eq('note_id', noteId)
        .order('chunk_index', { ascending: true });

      const existingChunksMap = new Map(
        (existingChunks || []).map((chunk: any) => [chunk.chunk_index, chunk])
      );

      const chunkIds: string[] = [];
      const chunksToInsert: Array<{ note_id: string; chunk_text: string; chunk_index: number }> = [];
      const chunksToUpdate: Array<{ id: string; chunk_text: string }> = [];
      const existingIndices = new Set<number>();

      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const chunkIndex = i;
        existingIndices.add(chunkIndex);

        const existingChunk = existingChunksMap.get(chunkIndex);
        
        if (existingChunk) {
          if (existingChunk.chunk_text !== chunkText) {
            chunksToUpdate.push({
              id: existingChunk.id,
              chunk_text: chunkText,
            });
            chunkIds.push(existingChunk.id);
          } else {
            chunkIds.push(existingChunk.id);
          }
        } else {
          chunksToInsert.push({
            note_id: noteId,
            chunk_text: chunkText,
            chunk_index: chunkIndex,
          });
        }
      }

      // Delete chunks that no longer exist
      const indicesToDelete = Array.from(existingChunksMap.keys())
        .filter(idx => !existingIndices.has(idx));
      
      if (indicesToDelete.length > 0) {
        const chunksToDelete = Array.from(existingChunksMap.entries())
          .filter(([idx]) => indicesToDelete.includes(idx))
          .map(([, chunk]) => chunk.id);

        if (chunksToDelete.length > 0) {
          await scriptClient
            .from('note_chunks')
            .delete()
            .in('id', chunksToDelete);
        }
      }

      // Update existing chunks
      for (const update of chunksToUpdate) {
        await scriptClient
          .from('note_chunks')
          .update({ chunk_text: update.chunk_text })
          .eq('id', update.id);
      }

      // Insert new chunks
      if (chunksToInsert.length > 0) {
        const { data: insertedChunks } = await scriptClient
          .from('note_chunks')
          .upsert(chunksToInsert, {
            onConflict: 'note_id,chunk_index',
            ignoreDuplicates: false,
          })
          .select('id, chunk_index');

        const insertedMap = new Map(
          (insertedChunks || []).map((chunk: any) => [chunk.chunk_index, chunk.id])
        );

        for (let i = 0; i < chunks.length; i++) {
          const insertedId = insertedMap.get(i);
          if (insertedId && !chunkIds.includes(insertedId)) {
            const insertIndex = i;
            chunkIds.splice(insertIndex, 0, insertedId);
          }
        }
      }

      return chunkIds;
    }
    
    // Wrapper for getChunksForNote that uses script client
    async function getChunksForNoteScript(noteId: string): Promise<any[]> {
      const { data, error } = await scriptClient
        .from('note_chunks')
        .select('*')
        .eq('note_id', noteId)
        .order('chunk_index', { ascending: true });

      if (error) {
        throw new Error(`Failed to get chunks: ${error.message}`);
      }

      return (data || []);
    }
    
    // Helper to normalize embedding from various formats (pgvector can return different formats)
    function normalizeEmbedding(embedding: any): number[] | null {
      if (!embedding) {
        return null;
      }
      
      // Already an array
      if (Array.isArray(embedding)) {
        return embedding;
      }
      
      // String format (JSON or pgvector string format)
      if (typeof embedding === 'string') {
        // Try JSON parse first
        try {
          const parsed = JSON.parse(embedding);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        } catch (e) {
          // Not JSON, might be pgvector format like "[0.1,0.2,0.3]"
          // Try to parse as array string
          const match = embedding.match(/\[(.*?)\]/);
          if (match) {
            try {
              const values = match[1].split(',').map(v => parseFloat(v.trim()));
              if (values.every(v => !isNaN(v))) {
                return values;
              }
            } catch (e) {
              // Ignore
            }
          }
        }
      }
      
      return null;
    }
    
    // Helper to check if a chunk has a valid embedding
    function hasValidEmbedding(chunk: any): boolean {
      const embedding = normalizeEmbedding(chunk.embedding);
      
      if (!embedding) {
        return false;
      }
      
      // Check if it's a valid 1536-dimensional vector
      return embedding.length === 1536 && 
             embedding.every((val: any) => typeof val === 'number' && !isNaN(val));
    }
    
    // Wrapper for generateEmbeddingsForNoteChunks that uses script client
    async function generateEmbeddingsForNoteChunksScript(
      noteId: string,
      batchSize: number = 10
    ): Promise<number> {
      const { generateEmbedding } = await import('../lib/embeddings');
      
      const chunks = await getChunksForNoteScript(noteId);
      const chunksWithoutEmbeddings = chunks.filter(
        (chunk: any) => !chunk.embedding || chunk.embedding.length === 0
      );

      if (chunksWithoutEmbeddings.length === 0) {
        return 0;
      }

      let generatedCount = 0;

      for (let i = 0; i < chunksWithoutEmbeddings.length; i += batchSize) {
        const batch = chunksWithoutEmbeddings.slice(i, i + batchSize);

        const embeddingPromises = batch.map(async (chunk: any) => {
          try {
            const embedding = await generateEmbedding(chunk.chunk_text);
            return { chunkId: chunk.id, embedding };
          } catch (error) {
            console.error(`Error generating embedding for chunk ${chunk.id}:`, error);
            return null;
          }
        });

        const results = await Promise.all(embeddingPromises);

        for (const result of results) {
          if (result) {
            const { error } = await scriptClient
              .from('note_chunks')
              .update({ embedding: result.embedding })
              .eq('id', result.chunkId);

            if (error) {
              console.error(`Error updating chunk ${result.chunkId} with embedding:`, error);
            } else {
              generatedCount++;
            }
          }
        }

        if (i + batchSize < chunksWithoutEmbeddings.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return generatedCount;
    }
    
    // Wrapper for generateThemeForNote that uses script client
    async function generateThemeForNoteScript(
      noteId: string,
      noteTitle: string | null,
      preserveUserLabel: boolean = true
    ): Promise<any> {
      // Helper functions from themeGeneration
      function calculateCentroid(embeddings: number[][]): number[] {
        if (embeddings.length === 0) {
          throw new Error('Cannot calculate centroid of empty embeddings array');
        }
        
        // Expected dimension for text-embedding-3-small
        const expectedDimension = 1536;
        
        // Filter out embeddings with wrong dimensions and log warnings
        const validEmbeddings = embeddings.filter((embedding, index) => {
          if (embedding.length !== expectedDimension) {
            console.warn(`  ⚠ Skipping embedding with dimension ${embedding.length} (expected ${expectedDimension})`);
            return false;
          }
          return true;
        });
        
        if (validEmbeddings.length === 0) {
          throw new Error(`No valid embeddings found. All ${embeddings.length} embeddings had incorrect dimensions.`);
        }
        
        if (validEmbeddings.length < embeddings.length) {
          console.warn(`  ⚠ Using ${validEmbeddings.length} of ${embeddings.length} embeddings (filtered out ${embeddings.length - validEmbeddings.length} with wrong dimensions)`);
        }
        
        const dimension = expectedDimension;
        const centroid: number[] = [];
        for (let i = 0; i < dimension; i++) {
          let sum = 0;
          for (const embedding of validEmbeddings) {
            sum += embedding[i];
          }
          centroid.push(sum / validEmbeddings.length);
        }
        return centroid;
      }

      function cosineSimilarity(a: number[], b: number[]): number {
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
      
      const chunks = await getChunksForNoteScript(noteId);
      const expectedDimension = 1536; // text-embedding-3-small dimension
      
      // Filter chunks to only include those with valid 1536-dimensional embeddings
      const chunksWithEmbeddings = chunks.filter(hasValidEmbedding);

      if (chunksWithEmbeddings.length === 0) {
        // Debug: log what we found
        console.log(`  Debug: Note ${noteId} has ${chunks.length} chunks`);
        if (chunks.length > 0) {
          const firstChunk = chunks[0];
          console.log(`  Debug: First chunk embedding type: ${typeof firstChunk?.embedding}, isArray: ${Array.isArray(firstChunk?.embedding)}`);
          if (firstChunk?.embedding) {
            const normalized = normalizeEmbedding(firstChunk.embedding);
            console.log(`  Debug: Normalized embedding length: ${normalized?.length || 'null'}`);
          }
        }
        throw new Error('Cannot generate theme: no chunks with valid embeddings found');
      }

      // Normalize embeddings to ensure they're arrays
      const embeddings = chunksWithEmbeddings.map((chunk: any) => {
        const normalized = normalizeEmbedding(chunk.embedding);
        if (!normalized) {
          throw new Error(`Failed to normalize embedding for chunk ${chunk.id}`);
        }
        return normalized;
      });
      const centroidEmbedding = calculateCentroid(embeddings);

      const { data: existingTheme } = await scriptClient
        .from('note_themes')
        .select('*')
        .eq('note_id', noteId)
        .single();

      let themeLabel: string | null = null;
      let isUserModified = false;

      if (existingTheme && preserveUserLabel && existingTheme.is_user_modified && !options.regenerateLabels) {
        themeLabel = existingTheme.theme_label;
        isUserModified = true;
      } else {
        // Generate label if not user-modified or if regenerating
        try {
          const { generateThemeLabel } = await import('../lib/themes/themeLabelGenerator');
          themeLabel = await generateThemeLabel(noteTitle, chunks);
        } catch (error) {
          console.error('Error generating theme label:', error);
          themeLabel = null;
        }
      }

      const { data: theme, error: themeError } = await scriptClient
        .from('note_themes')
        .upsert({
          note_id: noteId,
          theme_label: themeLabel,
          centroid_embedding: centroidEmbedding,
          is_user_modified: isUserModified,
        }, {
          onConflict: 'note_id',
        })
        .select()
        .single();

      if (themeError) {
        throw new Error(`Failed to create/update theme: ${themeError.message}`);
      }

      if (!theme) {
        throw new Error('Theme created but no data returned');
      }

      const themeId = theme.id;
      
      await scriptClient
        .from('chunk_theme_assignments')
        .delete()
        .in('chunk_id', chunksWithEmbeddings.map((chunk: any) => chunk.id));

      // Only create assignments for chunks with valid embeddings (already filtered above)
      const assignments = chunksWithEmbeddings.map((chunk: any) => {
        try {
          const normalizedEmbedding = normalizeEmbedding(chunk.embedding);
          if (!normalizedEmbedding) {
            throw new Error('Failed to normalize embedding');
          }
          const similarity = cosineSimilarity(normalizedEmbedding, centroidEmbedding);
          return {
            chunk_id: chunk.id,
            theme_id: themeId,
            similarity_score: similarity,
          };
        } catch (error) {
          console.warn(`  ⚠ Skipping similarity calculation for chunk ${chunk.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return null;
        }
      }).filter((a: any) => a !== null);

      if (assignments.length > 0) {
        await scriptClient
          .from('chunk_theme_assignments')
          .upsert(assignments, {
            onConflict: 'chunk_id',
          });
      }

      return theme;
    }

    // Get all notes (or limited set) - include title for label generation
    let query = supabase
      .from('notes')
      .select('id, user_id, title, body')
      .order('created_at', { ascending: false });

    if (options.notesLimit) {
      query = query.limit(options.notesLimit);
    }

    const { data: notes, error: notesError } = await query;

    if (notesError) {
      throw new Error(`Failed to fetch notes: ${notesError.message}`);
    }

    if (!notes || notes.length === 0) {
      console.log('No notes found to process');
      return;
    }

    console.log(`Found ${notes.length} notes to process`);

    let processedCount = 0;
    let chunkedCount = 0;
    let embeddedCount = 0;
    let themedCount = 0;
    let errorCount = 0;

    // Process notes in batches
    for (let i = 0; i < notes.length; i += options.batchSize) {
      const batch = notes.slice(i, i + options.batchSize);
      console.log(`\nProcessing batch ${Math.floor(i / options.batchSize) + 1} (notes ${i + 1}-${Math.min(i + options.batchSize, notes.length)})`);

      for (const note of batch) {
        try {
          // Step 1: Chunk the note (skip if only generating themes)
          if (!options.onlyThemes) {
            try {
              await createChunksForNoteScript(note.id, note.body || '');
              chunkedCount++;
              console.log(`  ✓ Chunked note ${note.id}`);
            } catch (error) {
              console.error(`  ✗ Error chunking note ${note.id}:`, error);
              if (error instanceof Error) {
                console.error(`    Error message: ${error.message}`);
              }
              errorCount++;
              continue;
            }
          }

          // Step 2: Generate embeddings (if not skipped)
          let embeddingsGenerated = false;
          if (!options.skipEmbeddings && !options.onlyThemes) {
            try {
              const generated = await generateEmbeddingsForNoteChunksScript(note.id, 10);
              if (generated > 0) {
                embeddedCount += generated;
                embeddingsGenerated = true;
                console.log(`  ✓ Generated ${generated} embeddings for note ${note.id}`);
              } else {
                // Check if chunks already have embeddings
                const chunks = await getChunksForNoteScript(note.id);
                const chunksWithEmbeddings = chunks.filter(hasValidEmbedding);
                if (chunksWithEmbeddings.length > 0) {
                  embeddingsGenerated = true;
                  console.log(`  ℹ Note ${note.id} already has ${chunksWithEmbeddings.length} chunks with embeddings`);
                }
              }
            } catch (error) {
              console.error(`  ✗ Error generating embeddings for note ${note.id}:`, error);
              if (error instanceof Error) {
                console.error(`    Error message: ${error.message}`);
              }
              // Continue - embeddings can be retried
            }
          } else if (options.onlyThemes) {
            // When only generating themes, check if embeddings exist
            const chunks = await getChunksForNoteScript(note.id);
            const chunksWithEmbeddings = chunks.filter(hasValidEmbedding);
            if (chunksWithEmbeddings.length > 0) {
              embeddingsGenerated = true;
              console.log(`  ℹ Note ${note.id} has ${chunksWithEmbeddings.length} chunks with embeddings`);
            } else {
              console.log(`  ⚠ Note ${note.id} has ${chunks.length} chunks but none have valid embeddings`);
            }
          }

          // Step 3: Generate theme (if not skipped and embeddings exist)
          if (!options.skipThemes) {
            if (!embeddingsGenerated) {
              console.log(`  ⚠ Skipping theme generation for note ${note.id} - no chunks with valid embeddings`);
            } else {
              try {
                await generateThemeForNoteScript(note.id, note.title || null, !options.regenerateLabels);
                themedCount++;
                console.log(`  ✓ Generated theme for note ${note.id}`);
              } catch (error) {
                console.error(`  ✗ Error generating theme for note ${note.id}:`, error);
                if (error instanceof Error) {
                  console.error(`    Error message: ${error.message}`);
                }
                // Continue - themes can be retried
              }
            }
          }

          processedCount++;

          // Small delay to avoid overwhelming the database/API
          await delay(50);
        } catch (error) {
          console.error(`  ✗ Unexpected error processing note ${note.id}:`, error);
          errorCount++;
        }
      }

      // Delay between batches
      if (i + options.batchSize < notes.length) {
        console.log(`  Waiting 1 second before next batch...`);
        await delay(1000);
      }
    }

    console.log('\n=== Backfill Summary ===');
    console.log(`Total notes processed: ${processedCount}`);
    console.log(`Notes chunked: ${chunkedCount}`);
    if (!options.skipEmbeddings) {
      console.log(`Embeddings generated: ${embeddedCount}`);
    }
    if (!options.skipThemes) {
      console.log(`Themes generated: ${themedCount}`);
    }
    console.log(`Errors: ${errorCount}`);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Use top-level await (tsx supports this)
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

