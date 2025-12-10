/**
 * Supported file types for import
 */
export type SupportedFileType = 'txt' | 'pdf' | 'markdown';

/**
 * MIME types for supported file types
 */
export const FILE_MIME_TYPES: Record<SupportedFileType, string[]> = {
  txt: ['text/plain'],
  pdf: ['application/pdf'],
  markdown: ['text/markdown', 'text/x-markdown'],
};

/**
 * File extensions for supported file types
 */
export const FILE_EXTENSIONS: Record<SupportedFileType, string[]> = {
  txt: ['.txt'],
  pdf: ['.pdf'],
  markdown: ['.md', '.markdown'],
};

/**
 * Maximum file size in bytes (10MB)
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Result of extracting content from a file
 */
export interface ExtractedContent {
  title: string | null;
  body: string;
}

/**
 * Result of importing a file
 */
export interface ImportResult {
  success: boolean;
  noteId?: string;
  error?: string;
  filename: string;
}

/**
 * Options for importing a file
 */
export interface ImportOptions {
  filename: string;
  fileType: SupportedFileType;
  content: Buffer | string;
}

/**
 * Options for importing from Notion database
 */
export interface NotionImportOptions {
  databaseId: string;
  filters?: any; // Notion filter object
  startIndex?: number; // First page to import (1-based, inclusive)
  endIndex?: number; // Last page to import (inclusive)
  maxPages?: number; // Alternative: maximum number of pages to import
}

/**
 * Result of importing from Notion database
 */
export interface NotionImportResult {
  success: boolean;
  importedCount: number;
  failedCount: number;
  errors?: Array<{ pageTitle: string; error: string }>;
}

