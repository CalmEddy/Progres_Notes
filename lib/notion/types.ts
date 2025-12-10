/**
 * Types for Notion API integration and blog extraction
 */

/**
 * Blog entry from CSV export
 */
export interface CsvBlogEntry {
  name: string; // Title
  castType: string;
  episode: string | null;
  published: string | null;
  recorded: string | null;
  relatedToLastPublished: string | null;
  segment: string | null;
  status: string;
  verse: string | null;
}

/**
 * Notion page information
 */
export interface NotionPageInfo {
  id: string;
  title: string;
  url?: string;
}

/**
 * Combined blog entry with title and body
 */
export interface BlogEntry {
  title: string;
  body: string;
  published?: string | null;
  metadata?: {
    castType?: string;
    episode?: string | null;
    recorded?: string | null;
    verse?: string | null;
  };
}

/**
 * Result of extracting a blog entry
 */
export interface BlogExtractionResult {
  success: boolean;
  entry?: BlogEntry;
  error?: string;
  csvRow?: number;
}

/**
 * Notion API block types (simplified)
 */
export type NotionBlockType =
  | 'paragraph'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'bulleted_list_item'
  | 'numbered_list_item'
  | 'to_do'
  | 'toggle'
  | 'child_page'
  | 'code'
  | 'quote'
  | 'callout'
  | 'divider'
  | 'table'
  | 'table_row'
  | 'column_list'
  | 'column'
  | 'unsupported';

/**
 * Rich text annotation
 */
export interface RichTextAnnotation {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: string;
}

/**
 * Rich text object
 */
export interface RichText {
  type: string;
  text?: {
    content: string;
    link?: {
      url: string;
    } | null;
  };
  annotations: RichTextAnnotation;
  plain_text: string;
  href?: string | null;
}

/**
 * Notion block (simplified structure)
 */
export interface NotionBlock {
  id: string;
  type: NotionBlockType;
  has_children: boolean;
  archived: boolean;
  [key: string]: any; // For block-specific properties
}

/**
 * Notion API response for blocks
 */
export interface NotionBlocksResponse {
  results: NotionBlock[];
  next_cursor: string | null;
  has_more: boolean;
}

/**
 * Extraction progress
 */
export interface ExtractionProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
}

/**
 * Extraction report
 */
export interface ExtractionReport {
  totalEntries: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{
    row: number;
    title: string;
    error: string;
  }>;
}


