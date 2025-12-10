import { Client } from '@notionhq/client';
import { NotionPageInfo } from './types';

/**
 * Options for querying a Notion database
 */
export interface DatabaseQueryOptions {
  filters?: any; // Notion filter object
  pageSize?: number; // Number of results per page (max 100)
  startIndex?: number; // First page to return (1-based, inclusive)
  endIndex?: number; // Last page to return (inclusive)
  maxPages?: number; // Maximum number of pages to return
}

/**
 * Query a Notion data source (database) and return all pages with pagination
 * Uses the dataSources.query method from the new API
 */
export async function queryDatabase(
  client: Client,
  databaseId: string,
  options: DatabaseQueryOptions = {}
): Promise<NotionPageInfo[]> {
  const { filters, pageSize = 100, startIndex, endIndex, maxPages } = options;
  const allPages: NotionPageInfo[] = [];
  let cursor: string | undefined = undefined;
  let hasMore = true;
  let currentIndex = 0; // Track current page index (0-based internally, but we'll use 1-based for user-facing)
  let queryCount = 0;
  const maxQueries = 10000; // Safety limit to prevent infinite loops

  // Runtime check for client structure
  if (!client || typeof client !== 'object') {
    throw new Error('Invalid Notion client provided');
  }

  try {
    console.log(`Starting query for data source ${databaseId}`, {
      startIndex,
      endIndex,
      maxPages,
      pageSize,
    });

    // Use the dataSources.query method for the new API
    while (hasMore && queryCount < maxQueries) {
      queryCount++;
      
      const queryParams: any = {
        data_source_id: databaseId,
        page_size: Math.min(pageSize, 100),
        result_type: 'page', // Only return pages, not data sources
      };

      if (cursor) {
        queryParams.start_cursor = cursor;
      }

      if (filters) {
        queryParams.filter = filters;
      }

      // Use the dataSources.query method
      const response = await client.dataSources.query(queryParams);
      
      const resultsCount = response.results?.length || 0;
      console.log(`Query ${queryCount}: returned ${resultsCount} results, has_more=${response.has_more}, next_cursor=${response.next_cursor ? 'present' : 'null'}`);

      // Extract page info from results
      if (response.results && Array.isArray(response.results)) {
        for (const result of response.results) {
          // Results can be pages or data sources, we only want pages
          if (result.object === 'page' || (result as any).type === 'page') {
            currentIndex++; // Increment to 1-based index
            
            // Apply range filtering if specified
            if (startIndex !== undefined && currentIndex < startIndex) {
              continue; // Skip pages before startIndex
            }
            
            if (endIndex !== undefined && currentIndex > endIndex) {
              // We've reached the end of the range, stop processing
              hasMore = false;
              break;
            }
            
            if (maxPages !== undefined && allPages.length >= maxPages) {
              // We've reached the max pages limit
              hasMore = false;
              break;
            }

            const pageInfo: NotionPageInfo = {
              id: result.id,
              title: extractPageTitle(result),
              url: result.url,
            };
            allPages.push(pageInfo);
          }
        }
      }

      // Update pagination state
      hasMore = response.has_more === true && 
                (endIndex === undefined || currentIndex < endIndex) &&
                (maxPages === undefined || allPages.length < maxPages);
      cursor = response.next_cursor || undefined;

      // Log progress
      if (queryCount % 10 === 0 || !hasMore) {
        console.log(`Pagination progress: ${allPages.length} pages collected, currentIndex=${currentIndex}, hasMore=${hasMore}`);
      }

      // If we've collected all pages we need, stop
      if (endIndex !== undefined && currentIndex >= endIndex) {
        hasMore = false;
      }
      if (maxPages !== undefined && allPages.length >= maxPages) {
        hasMore = false;
      }
    }

    if (queryCount >= maxQueries) {
      console.warn(`Reached safety limit of ${maxQueries} queries. Collected ${allPages.length} pages.`);
    }

    console.log(`Query complete: collected ${allPages.length} pages in ${queryCount} queries`);
    return allPages;
  } catch (error) {
    console.error(`Error querying database ${databaseId}:`, error);
    if (error instanceof Error) {
      // Re-throw with more context
      throw new Error(`Failed to query Notion database: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Extract title from a Notion page object (from database query result)
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

