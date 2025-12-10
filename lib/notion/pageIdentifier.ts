import { Client } from '@notionhq/client';
import { NotionPageInfo } from './types';
import { searchPageByTitle, getPageById } from './notionClient';

/**
 * Options for page identification
 */
export interface PageIdentifierOptions {
  useMappingFile?: string; // Path to CSV mapping file (Name,PageID)
  databaseId?: string; // Notion database ID for direct queries
  fuzzyMatch?: boolean; // Allow fuzzy title matching
}

/**
 * Identify Notion page for a blog entry title
 */
export async function identifyPage(
  client: Client,
  title: string,
  options: PageIdentifierOptions = {}
): Promise<NotionPageInfo | null> {
  // Option 1: Use mapping file if provided
  if (options.useMappingFile) {
    try {
      const mapping = await loadPageMapping(options.useMappingFile);
      const pageId = mapping[title] || mapping[title.toLowerCase()];
      if (pageId) {
        return await getPageById(client, pageId);
      }
    } catch (error) {
      console.warn(`Failed to load mapping file: ${error}`);
      // Fall through to other methods
    }
  }

  // Option 2: Search by title
  const page = await searchPageByTitle(client, title, options.databaseId);
  if (page) {
    return page;
  }

  // Option 3: Fuzzy match if enabled
  if (options.fuzzyMatch) {
    // Try variations of the title
    const variations = generateTitleVariations(title);
    for (const variation of variations) {
      const page = await searchPageByTitle(client, variation, options.databaseId);
      if (page) {
        return page;
      }
    }
  }

  return null;
}

/**
 * Load page mapping from CSV file
 */
async function loadPageMapping(
  filePath: string
): Promise<Record<string, string>> {
  const fs = await import('fs/promises');
  const { parse } = await import('papaparse');

  const fileContent = await fs.readFile(filePath, 'utf-8');

  return new Promise((resolve, reject) => {
    parse<{ Name: string; PageID: string }>(fileContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const mapping: Record<string, string> = {};
        for (const row of results.data) {
          const name = (row as any).Name || (row as any).name;
          const pageId = (row as any).PageID || (row as any).pageID || (row as any).pageId;
          if (name && pageId) {
            mapping[name] = pageId;
            mapping[name.toLowerCase()] = pageId; // Also add lowercase version
          }
        }
        resolve(mapping);
      },
      error: (error) => {
        reject(new Error(`Failed to parse mapping file: ${error.message}`));
      },
    });
  });
}

/**
 * Generate title variations for fuzzy matching
 */
function generateTitleVariations(title: string): string[] {
  const variations: string[] = [];

  // Remove common prefixes/suffixes
  variations.push(title.replace(/^"|"$/g, '')); // Remove quotes
  variations.push(title.trim());

  // Try without special characters
  variations.push(title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim());

  return Array.from(new Set(variations)); // Remove duplicates
}

