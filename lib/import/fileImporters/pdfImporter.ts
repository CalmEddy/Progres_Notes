import { ExtractedContent } from '../types';
import { extractTextFromString } from '../processors/textExtractor';
import { extractTitleFromText } from '../processors/titleExtractor';
const pdfParse = require('pdf-parse');

/**
 * Import a PDF file
 */
export async function importPdfFile(
  buffer: Buffer,
  filename: string
): Promise<ExtractedContent> {
  try {
    const data = await pdfParse(buffer);
    const text = data.text.trim();
    
    if (!text || text.length === 0) {
      throw new Error('PDF file is empty or contains no extractable text');
    }

    const extractedText = extractTextFromString(text);
    const title = extractTitleFromText(extractedText, filename);
    
    // If first line was used as title, remove it from body
    const lines = extractedText.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    let body = extractedText;
    
    if (lines.length > 0 && lines[0] === title) {
      // Remove the title line from body
      const titleIndex = extractedText.indexOf(lines[0]);
      body = extractedText.substring(titleIndex + lines[0].length).trim();
    }

    return {
      title: title || null,
      body: body || extractedText, // Fallback to full text if body is empty
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
    throw new Error('Failed to parse PDF file');
  }
}

