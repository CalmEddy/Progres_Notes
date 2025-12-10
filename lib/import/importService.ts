import { SupportedFileType, ImportOptions, ExtractedContent, FILE_EXTENSIONS } from './types';
import { importTxtFile } from './fileImporters/txtImporter';
import { importPdfFile } from './fileImporters/pdfImporter';
import { importMarkdownFile } from './fileImporters/markdownImporter';

/**
 * Detect file type from filename
 */
export function detectFileType(filename: string): SupportedFileType | null {
  const lowerFilename = filename.toLowerCase();
  
  for (const [type, extensions] of Object.entries(FILE_EXTENSIONS)) {
    if (extensions.some((ext) => lowerFilename.endsWith(ext))) {
      return type as SupportedFileType;
    }
  }
  
  return null;
}

/**
 * Import a file and extract title and body content
 */
export async function importFile(options: ImportOptions): Promise<ExtractedContent> {
  const { fileType, content, filename } = options;

  switch (fileType) {
    case 'txt':
      const txtContent = typeof content === 'string' ? content : content.toString('utf-8');
      return await importTxtFile(txtContent, filename);
    
    case 'pdf':
      if (typeof content === 'string') {
        throw new Error('PDF content must be provided as Buffer');
      }
      return await importPdfFile(content, filename);
    
    case 'markdown':
      const mdContent = typeof content === 'string' ? content : content.toString('utf-8');
      return await importMarkdownFile(mdContent, filename);
    
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

