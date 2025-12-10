import { Client } from '@notionhq/client';
import { ExtractedContent } from '../types';
import { createNotionClient, fetchPageBlocks } from '@/lib/notion/notionClient';
import { convertBlocksToText } from '@/lib/notion/blockConverter';
import { queryDatabase } from '@/lib/notion/databaseQuery';

/**
 * Options for importing from Notion database
 */
export interface NotionImportOptions {
  databaseId: string;
  filters?: any; // Notion filter object
  delayMs?: number; // Delay between page fetches (default: 350ms for rate limiting)
}

/**
 * Delay helper for rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Import pages from a Notion database
 * Returns array of extracted content for each page
 */
export async function importNotionDatabase(
  apiKey: string,
  options: NotionImportOptions
): Promise<ExtractedContent[]> {
  const { databaseId, filters, delayMs = 100 } = options; // Reduced default delay from 350ms to 100ms

  // Create Notion client
  const client = createNotionClient(apiKey);
  
  // Verify client was created correctly
  if (!client) {
    throw new Error('Failed to create Notion client');
  }

  // Query database to get pages (with optional range filtering)
  console.log(`Querying data source ${databaseId} for pages...`, {
    startIndex: options.startIndex,
    endIndex: options.endIndex,
    maxPages: options.maxPages,
  });
  const pages = await queryDatabase(client, databaseId, {
    filters,
    startIndex: options.startIndex,
    endIndex: options.endIndex,
    maxPages: options.maxPages,
  });
  console.log(`Found ${pages.length} pages in data source`);

  if (pages.length === 0) {
    console.warn(`No pages found in data source ${databaseId}. This could mean:`);
    console.warn(`1. The data source is empty`);
    console.warn(`2. The data source ID is incorrect`);
    console.warn(`3. The integration doesn't have access to the data source`);
    return [];
  }

  const extractedContents: ExtractedContent[] = [];

  // Process pages in batches for better performance
  const BATCH_SIZE = 5; // Process 5 pages concurrently
  const batches: typeof pages[] = [];
  
  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    batches.push(pages.slice(i, i + BATCH_SIZE));
  }

  console.log(`Processing ${pages.length} pages in ${batches.length} batches of ${BATCH_SIZE}`);

  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    // Process pages in this batch concurrently
    const batchPromises = batch.map(async (page, pageIndexInBatch) => {
      try {
        // Add delay only between batches, not between individual pages in a batch
        if (batchIndex > 0 && pageIndexInBatch === 0) {
          await delay(delayMs);
        }

        // Fetch all blocks for the page
        const blocks = await fetchPageBlocks(client, page.id);

        // Convert blocks to text (even if empty)
        const bodyText = blocks.length > 0 ? convertBlocksToText(blocks) : '';

        // Extract title (already extracted in queryDatabase)
        const title = page.title && page.title !== 'Untitled' ? page.title : null;

        // Import page even if it has no content - at least import the title
        return {
          title,
          body: bodyText.trim() || '', // Empty string if no content
        };
      } catch (error) {
        console.error(`Error processing page "${page.title}":`, error);
        // Return null for failed pages so we can filter them out
        return null;
      }
    });

    // Wait for all pages in this batch to complete
    const batchResults = await Promise.all(batchPromises);
    
    // Add successful results to extractedContents
    for (const result of batchResults) {
      if (result) {
        extractedContents.push(result);
      }
    }

    console.log(`Batch ${batchIndex + 1}/${batches.length} completed: ${batchResults.filter(r => r !== null).length}/${batch.length} pages imported`);
  }

  return extractedContents;
}

