import { Client } from '@notionhq/client';
import { NotionPageInfo, NotionBlock, NotionBlocksResponse } from './types';

/**
 * Create and configure Notion API client
 */
export function createNotionClient(apiKey: string): Client {
  return new Client({
    auth: apiKey,
  });
}

/**
 * Search for a Notion page by title
 * Note: Notion API doesn't have direct title search, so we search all pages
 */
export async function searchPageByTitle(
  client: Client,
  title: string,
  databaseId?: string
): Promise<NotionPageInfo | null> {
  try {
    // If database ID is provided, query the database
    if (databaseId) {
      try {
        const response = await (client.databases as any).query({
          database_id: databaseId,
          filter: {
            property: 'Name', // Adjust property name as needed
            title: {
              equals: title,
            },
          },
        });

        if (response.results && response.results.length > 0) {
          const page = response.results[0] as any;
          return {
            id: page.id,
            title: extractPageTitle(page),
            url: page.url,
          };
        }
      } catch (error) {
        // Database query failed, fall through to search
        console.warn('Database query failed, falling back to search:', error);
      }
    }

    // Fallback: search all pages (slower)
    const response = await client.search({
      query: title,
      filter: {
        value: 'page',
        property: 'object',
      },
    });

    // Find exact or close match
    for (const page of response.results as any[]) {
      const pageTitle = extractPageTitle(page);
      if (pageTitle === title || pageTitle.toLowerCase() === title.toLowerCase()) {
        return {
          id: page.id,
          title: pageTitle,
          url: page.url,
        };
      }
    }

    return null;
  } catch (error) {
    console.error(`Error searching for page "${title}":`, error);
    return null;
  }
}

/**
 * Get a Notion page by ID
 */
export async function getPageById(
  client: Client,
  pageId: string
): Promise<NotionPageInfo | null> {
  try {
    const page = await client.pages.retrieve({ page_id: pageId });
    return {
      id: (page as any).id,
      title: extractPageTitle(page as any),
      url: (page as any).url,
    };
  } catch (error) {
    console.error(`Error retrieving page ${pageId}:`, error);
    return null;
  }
}

/**
 * Extract title from a Notion page object
 */
function extractPageTitle(page: any): string {
  // Try different title properties
  if (page.properties?.Name?.title) {
    return page.properties.Name.title
      .map((t: any) => t.plain_text)
      .join('');
  }
  if (page.properties?.title?.title) {
    return page.properties.title.title
      .map((t: any) => t.plain_text)
      .join('');
  }
  if (page.properties?.Title?.title) {
    return page.properties.Title.title
      .map((t: any) => t.plain_text)
      .join('');
  }
  
  // Try to find any title property
  for (const [key, value] of Object.entries(page.properties || {})) {
    if ((value as any).type === 'title' && (value as any).title) {
      return (value as any).title
        .map((t: any) => t.plain_text)
        .join('');
    }
  }

  return 'Untitled';
}

/**
 * Fetch all blocks for a Notion page with pagination
 */
export async function fetchPageBlocks(
  client: Client,
  pageId: string
): Promise<NotionBlock[]> {
  const allBlocks: NotionBlock[] = [];
  let cursor: string | undefined = undefined;
  let hasMore = true;

  try {
    while (hasMore) {
      const response: NotionBlocksResponse = await client.blocks.children.list({
        block_id: pageId,
        start_cursor: cursor,
        page_size: 100,
      }) as any;

      allBlocks.push(...(response.results as NotionBlock[]));

      // Fetch child blocks recursively
      for (const block of response.results as NotionBlock[]) {
        if (block.has_children) {
          const childBlocks = await fetchChildBlocks(client, block.id);
          allBlocks.push(...childBlocks);
        }
      }

      hasMore = response.has_more;
      cursor = response.next_cursor || undefined;
    }

    return allBlocks;
  } catch (error) {
    console.error(`Error fetching blocks for page ${pageId}:`, error);
    throw error;
  }
}

/**
 * Recursively fetch child blocks
 */
async function fetchChildBlocks(
  client: Client,
  blockId: string
): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined = undefined;
  let hasMore = true;

  try {
    while (hasMore) {
      const response: NotionBlocksResponse = await client.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
        page_size: 100,
      }) as any;

      const childBlocks = response.results as NotionBlock[];
      blocks.push(...childBlocks);

      // Recursively fetch nested children
      for (const block of childBlocks) {
        if (block.has_children) {
          const nestedBlocks = await fetchChildBlocks(client, block.id);
          blocks.push(...nestedBlocks);
        }
      }

      hasMore = response.has_more;
      cursor = response.next_cursor || undefined;
    }

    return blocks;
  } catch (error) {
    console.error(`Error fetching child blocks for ${blockId}:`, error);
    return blocks; // Return what we have so far
  }
}

