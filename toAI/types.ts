/**
 * Filter condition types
 */
export type FilterConditionType = 
  | 'keyword'
  | 'embedding'
  | 'date_created'
  | 'date_modified'
  | 'tag'
  | 'text_pattern';

/**
 * Keyword filter condition
 */
export interface KeywordFilterCondition {
  type: 'keyword';
  operator: 'contains' | 'not_contains';
  value: string;
}

/**
 * Embedding filter condition (semantic similarity)
 */
export interface EmbeddingFilterCondition {
  type: 'embedding';
  query: string;
  threshold?: number; // 0-1, default 0.7
}

/**
 * Date filter operators
 */
export type DateFilterOperator = 'equals' | 'range' | 'relative';

/**
 * Date filter condition
 */
export interface DateFilterCondition {
  type: 'date_created' | 'date_modified';
  operator: DateFilterOperator;
  value?: string; // ISO date string for 'equals'
  startDate?: string; // ISO date string for 'range'
  endDate?: string; // ISO date string for 'range'
  relativeValue?: string; // e.g., "last Monday", "this week", "last month"
}

/**
 * Tag filter condition
 */
export interface TagFilterCondition {
  type: 'tag';
  operator: 'equals' | 'in';
  tagIds: string[]; // Single tag ID for 'equals', multiple for 'in'
}

/**
 * Text pattern filter condition
 */
export interface TextPatternFilterCondition {
  type: 'text_pattern';
  pattern: string; // e.g., "**", "TODO:", etc.
}

/**
 * Union of all filter condition types
 */
export type FilterCondition = 
  | KeywordFilterCondition
  | EmbeddingFilterCondition
  | DateFilterCondition
  | TagFilterCondition
  | TextPatternFilterCondition;

/**
 * Filter folder data structure
 */
export interface FilterFolder {
  id: string;
  user_id: string;
  name: string;
  filter_conditions: FilterCondition[];
  position: number;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

