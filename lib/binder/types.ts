import { Note } from '@/lib/notes';

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
  type: 'folder' | 'note';
  name: string;
  parent_id: string | null;
  parent_type: 'folder' | 'note' | null;
  position: number;
  note?: Note;
  folder?: Folder;
  children?: BinderItem[];
  expanded?: boolean;
}

export interface BinderStructure {
  items: BinderItem[];
}

