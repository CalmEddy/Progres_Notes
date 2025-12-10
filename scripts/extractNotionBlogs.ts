#!/usr/bin/env node

/**
 * Extract blog entries from Notion by combining CSV metadata with Notion page content
 * 
 * Usage:
 *   npm run extract-notion-blogs <csv-file> [options]
 * 
 * Options:
 *   --output <path>     Output JSON file path (default: ./notion-blogs.json)
 *   --mapping <path>    CSV mapping file with Name,PageID columns
 *   --database-id <id>   Notion database ID for direct queries
 *   --api-key <key>     Notion API key (or set NOTION_API_KEY env var)
 *   --filter-status     Only process entries with Status="Blogged"
 *   --delay <ms>        Delay between API requests in milliseconds (default: 350)
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { parseCsvFile, filterBloggedEntries } from '../lib/notion/csvParser';
import { createNotionClient } from '../lib/notion/notionClient';
import { fetchPageBlocks } from '../lib/notion/notionClient';
import { convertBlocksToText } from '../lib/notion/blockConverter';
import { combineBlogData, validateBlogEntry } from '../lib/notion/dataCombiner';
import { identifyPage } from '../lib/notion/pageIdentifier';
import { generateJsonOutput, generateReport, ensureOutputDirectory } from '../lib/notion/outputGenerator';
import { CsvBlogEntry, BlogEntry, BlogExtractionResult, ExtractionReport, ExtractionProgress } from '../lib/notion/types';

interface ScriptOptions {
  csvFile: string;
  outputFile: string;
  mappingFile?: string;
  databaseId?: string;
  apiKey?: string;
  filterStatus: boolean;
  delay: number;
}

async function parseArguments(): Promise<ScriptOptions> {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Usage: npm run extract-notion-blogs <csv-file> [options]

Options:
  --output <path>       Output JSON file path (default: ./notion-blogs.json)
  --mapping <path>      CSV mapping file with Name,PageID columns
  --database-id <id>    Notion database ID for direct queries
  --api-key <key>       Notion API key (or set NOTION_API_KEY env var)
  --filter-status       Only process entries with Status="Blogged"
  --delay <ms>          Delay between API requests in milliseconds (default: 350)
  --help                Show this help message
`);
    process.exit(0);
  }

  const options: ScriptOptions = {
    csvFile: args[0],
    outputFile: './notion-blogs.json',
    filterStatus: false,
    delay: 350,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--output':
        options.outputFile = args[++i];
        break;
      case '--mapping':
        options.mappingFile = args[++i];
        break;
      case '--database-id':
        options.databaseId = args[++i];
        break;
      case '--api-key':
        options.apiKey = args[++i];
        break;
      case '--filter-status':
        options.filterStatus = true;
        break;
      case '--delay':
        options.delay = parseInt(args[++i], 10) || 350;
        break;
    }
  }

  // Get API key from environment if not provided
  if (!options.apiKey) {
    options.apiKey = process.env.NOTION_API_KEY;
  }

  if (!options.apiKey) {
    throw new Error('Notion API key is required. Provide via --api-key or NOTION_API_KEY environment variable.');
  }

  return options;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractBlogEntry(
  client: ReturnType<typeof createNotionClient>,
  csvEntry: CsvBlogEntry,
  rowIndex: number,
  options: ScriptOptions
): Promise<BlogExtractionResult> {
  try {
    // Identify Notion page
    const page = await identifyPage(client, csvEntry.name, {
      useMappingFile: options.mappingFile,
      databaseId: options.databaseId,
      fuzzyMatch: true,
    });

    if (!page) {
      return {
        success: false,
        error: `Notion page not found for title: "${csvEntry.name}"`,
        csvRow: rowIndex + 1,
      };
    }

    // Add delay to respect rate limits
    await delay(options.delay);

    // Fetch page blocks
    const blocks = await fetchPageBlocks(client, page.id);
    
    if (blocks.length === 0) {
      return {
        success: false,
        error: `No blocks found for page: "${csvEntry.name}"`,
        csvRow: rowIndex + 1,
      };
    }

    // Convert blocks to text
    const bodyText = convertBlocksToText(blocks);

    if (!bodyText || bodyText.trim().length === 0) {
      return {
        success: false,
        error: `Empty content for page: "${csvEntry.name}"`,
        csvRow: rowIndex + 1,
      };
    }

    // Combine data
    const blogEntry = combineBlogData(csvEntry, bodyText);

    if (!validateBlogEntry(blogEntry)) {
      return {
        success: false,
        error: `Invalid blog entry: "${csvEntry.name}"`,
        csvRow: rowIndex + 1,
      };
    }

    return {
      success: true,
      entry: blogEntry,
      csvRow: rowIndex + 1,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      csvRow: rowIndex + 1,
    };
  }
}

async function main() {
  try {
    const options = await parseArguments();

    console.log('Starting Notion blog extraction...');
    console.log(`CSV File: ${options.csvFile}`);
    console.log(`Output File: ${options.outputFile}`);

    // Parse CSV
    console.log('\nParsing CSV file...');
    let csvEntries = await parseCsvFile(options.csvFile);
    console.log(`Found ${csvEntries.length} entries in CSV`);

    // Filter by status if requested
    if (options.filterStatus) {
      csvEntries = filterBloggedEntries(csvEntries);
      console.log(`Filtered to ${csvEntries.length} "Blogged" entries`);
    }

    // Create Notion client
    const client = createNotionClient(options.apiKey!);

    // Extract blog entries
    console.log('\nExtracting blog entries from Notion...');
    const results: BlogExtractionResult[] = [];
    const progress: ExtractionProgress = {
      total: csvEntries.length,
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
    };

    for (let i = 0; i < csvEntries.length; i++) {
      const entry = csvEntries[i];
      progress.processed = i + 1;

      console.log(`[${progress.processed}/${progress.total}] Processing: "${entry.name}"`);

      const result = await extractBlogEntry(client, entry, i, options);

      if (result.success && result.entry) {
        results.push(result);
        progress.successful++;
        console.log(`  ✓ Success`);
      } else {
        progress.failed++;
        console.log(`  ✗ Failed: ${result.error}`);
      }

      // Add delay between entries
      if (i < csvEntries.length - 1) {
        await delay(options.delay);
      }
    }

    // Generate output
    console.log('\nGenerating output files...');
    const blogEntries: BlogEntry[] = results
      .filter((r) => r.success && r.entry)
      .map((r) => r.entry!);

    await ensureOutputDirectory(options.outputFile);
    await generateJsonOutput(blogEntries, options.outputFile);

    // Generate report
    const reportPath = options.outputFile.replace('.json', '-report.txt');
    const report: ExtractionReport = {
      totalEntries: csvEntries.length,
      successful: progress.successful,
      failed: progress.failed,
      skipped: progress.skipped,
      errors: results
        .filter((r) => !r.success)
        .map((r) => ({
          row: r.csvRow || 0,
          title: csvEntries[r.csvRow! - 1]?.name || 'Unknown',
          error: r.error || 'Unknown error',
        })),
    };

    await generateReport(report, reportPath);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('Extraction Complete!');
    console.log('='.repeat(50));
    console.log(`Total Entries: ${progress.total}`);
    console.log(`Successful: ${progress.successful}`);
    console.log(`Failed: ${progress.failed}`);
    console.log(`Output: ${options.outputFile}`);
    console.log(`Report: ${reportPath}`);
    console.log('='.repeat(50));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}


