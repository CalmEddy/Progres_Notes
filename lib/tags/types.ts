export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteTag {
  id: string;
  note_id: string;
  tag_id: string;
  created_at: string;
}

