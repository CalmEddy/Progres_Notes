/**
 * Extract title from content based on file type
 */

/**
 * Extract title from plain text content
 * Uses first line if reasonable length, otherwise uses filename
 */
export function extractTitleFromText(
  content: string,
  filename: string
): string | null {
  const lines = content.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  
  if (lines.length === 0) {
    return extractTitleFromFilename(filename);
  }

  const firstLine = lines[0];
  
  // Use first line as title if it's reasonable (not too long, not just whitespace)
  if (firstLine.length > 0 && firstLine.length <= 200) {
    return firstLine;
  }

  return extractTitleFromFilename(filename);
}

/**
 * Extract title from markdown content
 * Tries H1 heading first, then first line, then filename
 */
export function extractTitleFromMarkdown(
  content: string,
  filename: string
): string | null {
  const lines = content.split('\n');
  
  // Look for H1 heading (# Title)
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      const title = trimmed.substring(2).trim();
      if (title.length > 0 && title.length <= 200) {
        return title;
      }
    }
  }
  
  // Fall back to first non-empty line
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('#')) {
      if (trimmed.length <= 200) {
        return trimmed;
      }
      break;
    }
  }
  
  return extractTitleFromFilename(filename);
}

/**
 * Extract title from filename (remove extension)
 */
export function extractTitleFromFilename(filename: string): string {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  
  // Return filename without extension, or 'Untitled' if empty
  return nameWithoutExt || 'Untitled';
}

