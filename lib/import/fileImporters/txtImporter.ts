import { ExtractedContent } from '../types';
import { extractTextFromString } from '../processors/textExtractor';
import { extractTitleFromText } from '../processors/titleExtractor';

/**
 * Import a plain text file
 */
export async function importTxtFile(
  content: string,
  filename: string
): Promise<ExtractedContent> {
  const text = extractTextFromString(content);
  
  if (!text || text.trim().length === 0) {
    throw new Error('File is empty or contains no text');
  }

  const title = extractTitleFromText(text, filename);
  
  // If first line was used as title, remove it from body
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  let body = text;
  
  if (lines.length > 0 && lines[0] === title) {
    // Remove the title line from body
    const titleIndex = text.indexOf(lines[0]);
    body = text.substring(titleIndex + lines[0].length).trim();
  }

  return {
    title: title || null,
    body: body || text, // Fallback to full text if body is empty
  };
}

