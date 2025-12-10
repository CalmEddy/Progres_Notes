import { ExtractedContent } from '../types';
import { BlogEntry } from '../../notion/types';

/**
 * Import a JSON file containing blog entries
 */
export async function importJsonFile(
  content: string,
  filename: string
): Promise<ExtractedContent[]> {
  try {
    const data = JSON.parse(content);
    
    // Handle different JSON structures
    let entries: BlogEntry[] = [];
    
    if (Array.isArray(data)) {
      // Direct array of entries
      entries = data;
    } else if (data.entries && Array.isArray(data.entries)) {
      // Wrapped in object with entries property
      entries = data.entries;
    } else {
      throw new Error('Invalid JSON structure. Expected array of entries or object with entries property.');
    }

    if (entries.length === 0) {
      throw new Error('JSON file contains no entries');
    }

    // Convert blog entries to extracted content
    const extractedContents: ExtractedContent[] = entries.map((entry) => {
      if (!entry.title || typeof entry.title !== 'string') {
        throw new Error('Entry missing required "title" field');
      }
      if (!entry.body || typeof entry.body !== 'string') {
        throw new Error('Entry missing required "body" field');
      }

      return {
        title: entry.title.trim(),
        body: entry.body.trim(),
      };
    });

    return extractedContents;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON format: ${error.message}`);
    }
    throw error;
  }
}


