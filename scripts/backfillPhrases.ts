#!/usr/bin/env tsx

/**
 * CLI script to backfill phrase extraction from existing notes
 * 
 * Usage:
 *   npm run backfill-phrases                    # Process all users
 *   npm run backfill-phrases -- --user-id <id>  # Process specific user
 *   npm run backfill-phrases -- --batch-size 25  # Custom batch size
 *   npm run backfill-phrases -- --no-skip-existing  # Reprocess existing
 *   npm run backfill-phrases -- --max-notes 100   # Limit for testing
 */

// Load environment variables from .env.local BEFORE any other imports
// Using require() ensures this executes synchronously before module evaluation
const { resolve } = require('path');
require('dotenv').config({ path: resolve(process.cwd(), '.env.local') });

import { processAllUsersNotes, processUserNotes, BackfillOptions } from '../lib/phrases/backfillService';

// Parse command line arguments
function parseArgs(): BackfillOptions & { userId?: string } {
  const args = process.argv.slice(2);
  const options: BackfillOptions & { userId?: string } = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--user-id' && i + 1 < args.length) {
      options.userId = args[++i];
    } else if (arg === '--batch-size' && i + 1 < args.length) {
      const batchSize = parseInt(args[++i], 10);
      if (!isNaN(batchSize) && batchSize > 0) {
        options.batchSize = batchSize;
      } else {
        console.error('Invalid batch size. Must be a positive number.');
        process.exit(1);
      }
    } else if (arg === '--no-skip-existing') {
      options.skipExisting = false;
    } else if (arg === '--max-notes' && i + 1 < args.length) {
      const maxNotes = parseInt(args[++i], 10);
      if (!isNaN(maxNotes) && maxNotes > 0) {
        options.maxNotes = maxNotes;
      } else {
        console.error('Invalid max notes. Must be a positive number.');
        process.exit(1);
      }
    } else if (arg === '--delay' && i + 1 < args.length) {
      const delay = parseInt(args[++i], 10);
      if (!isNaN(delay) && delay >= 0) {
        options.delayMs = delay;
      } else {
        console.error('Invalid delay. Must be a non-negative number.');
        process.exit(1);
      }
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  
  return options;
}

function printHelp() {
  console.log(`
Backfill Phrase Extraction

Extracts meaningful phrases from existing notes in the database.

Usage:
  npm run backfill-phrases [options]

Options:
  --user-id <id>          Process notes for a specific user ID
  --batch-size <number>   Number of notes per batch (default: 50)
  --no-skip-existing      Reprocess notes that already have phrases (default: skip)
  --max-notes <number>    Maximum number of notes to process (for testing)
  --delay <ms>            Delay between batches in milliseconds (default: 100)
  --verbose, -v            Show detailed debugging output for each note
  --help, -h              Show this help message

Examples:
  # Process all users' notes
  npm run backfill-phrases

  # Process specific user
  npm run backfill-phrases -- --user-id abc123

  # Test with limited notes
  npm run backfill-phrases -- --max-notes 10

  # Reprocess all notes (including those with existing phrases)
  npm run backfill-phrases -- --no-skip-existing

  # Custom batch size and delay
  npm run backfill-phrases -- --batch-size 25 --delay 200

  # Verbose mode (shows details for each note)
  npm run backfill-phrases -- --verbose
`);
}

async function main() {
  const options = parseArgs();
  
  // Validate environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL environment variable is not set');
    process.exit(1);
  }
  
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable is not set');
    process.exit(1);
  }
  
  // Optional: Check for service role key
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Warning: SUPABASE_SERVICE_ROLE_KEY not set. Backfill may be limited by RLS policies.');
    console.warn('For processing all users, set SUPABASE_SERVICE_ROLE_KEY in your environment.');
  }
  
  try {
    let result;
    
    if (options.userId) {
      // Process specific user
      console.log(`Processing notes for user: ${options.userId}`);
      result = await processUserNotes(options.userId, options);
    } else {
      // Process all users
      console.log('Processing notes for all users');
      result = await processAllUsersNotes(options);
    }
    
    // Print summary
    console.log('\n=== Final Summary ===');
    console.log(`Total notes: ${result.totalNotes}`);
    console.log(`Processed: ${result.processedNotes}`);
    console.log(`Skipped: ${result.skippedNotes}`);
    console.log(`Failed: ${result.failedNotes}`);
    console.log(`Total phrases extracted: ${result.totalPhrasesExtracted}`);
    console.log(`Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
    
    if (result.errors.length > 0) {
      console.log(`\nErrors encountered: ${result.errors.length}`);
      if (result.errors.length <= 10) {
        console.log('Error details:');
        result.errors.forEach((error, index) => {
          console.log(`  ${index + 1}. Note ${error.noteId}: ${error.error}`);
        });
      } else {
        console.log('First 10 errors:');
        result.errors.slice(0, 10).forEach((error, index) => {
          console.log(`  ${index + 1}. Note ${error.noteId}: ${error.error}`);
        });
        console.log(`  ... and ${result.errors.length - 10} more errors`);
      }
    }
    
    // Exit with appropriate code
    if (result.failedNotes > 0) {
      console.log('\n⚠️  Some notes failed to process. Check errors above.');
      process.exit(1);
    } else {
      console.log('\n✅ Backfill completed successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Fatal error during backfill:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the script
main();

