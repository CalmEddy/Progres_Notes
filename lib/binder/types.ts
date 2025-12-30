import { Note } from '@/lib/notes';
import { FilterFolder } from '@/lib/filters/types';

export interface Folder {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface BinderItem {
  id: string;
  type: 'folder' | 'note' | 'filter_folder' | 'chunk_ref';
  name: string;
  parent_id: string | null;
  parent_type: 'folder' | 'note' | null;
  position: number;
  note?: Note;
  folder?: Folder;
  filterFolder?: FilterFolder;
  chunk?: {
    id: string;
    chunk_text: string;
    chunk_index: number;
    note_id: string;
  };
  children?: BinderItem[];
  expanded?: boolean;
}

export interface ChunkRefBinderItem extends BinderItem {
  type: 'chunk_ref';
  chunk_id: string;
  chunk: {
    id: string;
    chunk_text: string;
    chunk_index: number;
    note_id: string;
  };
}

export interface BinderStructure {
  items: BinderItem[];
}

/**
 * Active context state for determining what Column 2 should display
 */
export type ActiveContext =
  | { kind: 'note'; noteId: string }
  | { kind: 'collection'; collectionId: string; collectionFolderItemId?: string | null };

