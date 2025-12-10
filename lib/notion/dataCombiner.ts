import { CsvBlogEntry, BlogEntry } from './types';

/**
 * Combine CSV entry with Notion body text
 */
export function combineBlogData(
  csvEntry: CsvBlogEntry,
  bodyText: string
): BlogEntry {
  return {
    title: csvEntry.name.trim(),
    body: bodyText.trim(),
    published: csvEntry.published || null,
    metadata: {
      castType: csvEntry.castType || undefined,
      episode: csvEntry.episode || null,
      recorded: csvEntry.recorded || null,
      verse: csvEntry.verse || null,
    },
  };
}

/**
 * Validate blog entry before output
 */
export function validateBlogEntry(entry: BlogEntry): boolean {
  return (
    entry.title.length > 0 &&
    entry.body.length > 0 &&
    entry.title.length <= 500 // Reasonable title length
  );
}


