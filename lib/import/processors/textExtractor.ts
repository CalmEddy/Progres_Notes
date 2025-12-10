/**
 * Extract plain text from various formats
 */

/**
 * Extract text from a string (already plain text)
 */
export function extractTextFromString(content: string): string {
  return content.trim();
}

/**
 * Extract text from markdown, removing markdown syntax
 * This is a simple implementation - for production, consider using a markdown parser
 */
export function extractTextFromMarkdown(content: string): string {
  let text = content;
  
  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/`[^`]+`/g, '');
  
  // Remove headers (but keep the text)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '$1');
  
  // Remove links but keep text: [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
  
  // Remove images: ![alt](url) -> alt
  text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1');
  
  // Remove bold/italic markers
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  
  // Remove horizontal rules
  text = text.replace(/^---+$/gm, '');
  text = text.replace(/^\*\*\*+$/gm, '');
  
  // Remove list markers
  text = text.replace(/^[\s]*[-*+]\s+/gm, '');
  text = text.replace(/^[\s]*\d+\.\s+/gm, '');
  
  // Clean up multiple newlines
  text = text.replace(/\n{3,}/g, '\n\n');
  
  return text.trim();
}

