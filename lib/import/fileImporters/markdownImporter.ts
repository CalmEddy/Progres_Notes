import { ExtractedContent } from '../types';
import { extractTextFromMarkdown } from '../processors/textExtractor';
import { extractTitleFromMarkdown } from '../processors/titleExtractor';

/**
 * Import a markdown file
 */
export async function importMarkdownFile(
  content: string,
  filename: string
): Promise<ExtractedContent> {
  const text = extractTextFromMarkdown(content);
  
  if (!text || text.trim().length === 0) {
    throw new Error('File is empty or contains no text');
  }

  const title = extractTitleFromMarkdown(content, filename);
  
  // If H1 heading was used as title, remove it from body
  let body = text;
  const lines = content.split('\n');
  
  // Find and remove H1 heading from body if it was used as title
  if (title) {
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('# ')) {
        const headingText = trimmed.substring(2).trim();
        if (headingText === title) {
          // Remove this line from the original content
          const beforeHeading = lines.slice(0, i).join('\n');
          const afterHeading = lines.slice(i + 1).join('\n');
          const contentWithoutHeading = [beforeHeading, afterHeading]
            .filter((s) => s.trim().length > 0)
            .join('\n');
          body = extractTextFromMarkdown(contentWithoutHeading);
          break;
        }
      }
    }
  }

  return {
    title: title || null,
    body: body || text, // Fallback to full text if body is empty
  };
}

