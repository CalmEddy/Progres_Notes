import { parse } from 'papaparse';
import { CsvBlogEntry } from './types';
import * as fs from 'fs/promises';

/**
 * Parse CSV file and extract blog entries
 */
export async function parseCsvFile(filePath: string): Promise<CsvBlogEntry[]> {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    
    return new Promise((resolve, reject) => {
      parse<Record<string, string>>(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => {
          // Normalize header names
          const normalized = header.trim();
          if (normalized === 'Name') return 'name';
          if (normalized === 'Cast Type') return 'castType';
          if (normalized === 'Episode') return 'episode';
          if (normalized === 'Published') return 'published';
          if (normalized === 'Recorded') return 'recorded';
          if (normalized === 'Related to Last Published (Title)') return 'relatedToLastPublished';
          if (normalized === 'Segment') return 'segment';
          if (normalized === 'Status') return 'status';
          if (normalized === 'Verse') return 'verse';
          return normalized.toLowerCase().replace(/\s+/g, '');
        },
        complete: (results) => {
          try {
            const entries: CsvBlogEntry[] = results.data
              .filter((row) => {
                // Filter out completely empty rows
                return Object.values(row).some((val) => val && typeof val === 'string' && val.trim().length > 0);
              })
              .map((row) => ({
                name: row.name || row.Name || '',
                castType: row.castType || row['Cast Type'] || '',
                episode: row.episode || row.Episode || null,
                published: row.published || row.Published || null,
                recorded: row.recorded || row.Recorded || null,
                relatedToLastPublished: row.relatedToLastPublished || row['Related to Last Published (Title)'] || null,
                segment: row.segment || row.Segment || null,
                status: row.status || row.Status || '',
                verse: row.verse || row.Verse || null,
              }))
              .filter((entry) => entry.name && entry.name.trim().length > 0);

            resolve(entries);
          } catch (error) {
            reject(new Error(`Failed to parse CSV data: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        },
        error: (error) => {
          reject(new Error(`CSV parsing error: ${error.message}`));
        },
      });
    });
  } catch (error) {
    throw new Error(`Failed to read CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Filter blog entries by status
 */
export function filterBloggedEntries(entries: CsvBlogEntry[]): CsvBlogEntry[] {
  return entries.filter((entry) => 
    entry.status && entry.status.toLowerCase() === 'blogged'
  );
}

