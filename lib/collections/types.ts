// Import and re-export SearchFilters from binderSearch for consistency
import type { SearchFilters as BinderSearchFilters } from '../binder/binderSearch';
export type SearchFilters = BinderSearchFilters;

export interface SearchCriteria {
  search_type: 'keyword' | 'semantic' | 'chunk_semantic' | 'theme' | 'date_created' | 'date_modified' | 'combined';
  query?: string;
  chunk_id?: string;  // For chunk-based searches
  note_id?: string;   // Optional scope for chunk searches
  match_threshold?: number;
  limit?: number;
  filters?: SearchFilters;
}

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
  is_search_collection?: boolean;
  search_criteria?: SearchCriteria | null;
}

export interface CollectionBinderItem {
  id: string;
  user_id: string;
  collection_id: string;
  parent_id: string | null;
  position: number;
  item_type: 'folder' | 'chunk_ref';
  title: string | null;
  chunk_id: string | null; // Only set for chunk_ref
  is_muted: boolean;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CollectionBinderItemWithChunk extends CollectionBinderItem {
  chunk?: {
    id: string;
    chunk_text: string;
    chunk_index: number;
    note_id: string;
    note_title?: string | null;
  } | null;
}

