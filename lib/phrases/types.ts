/**
 * Phrase categories for categorization and sentence generation
 */
export type PhraseCategory =
  | 'idiom'
  | 'compound_noun'
  | 'verb_phrase'
  | 'noun_phrase'
  | 'adjective_phrase';

/**
 * Extracted phrase from text processing
 */
export interface ExtractedPhrase {
  text: string;
  category: PhraseCategory;
  posPattern: string;
}

/**
 * Stored phrase in database
 */
export interface Phrase {
  id: string;
  user_id: string;
  phrase_text: string;
  category: PhraseCategory;
  pos_pattern: string;
  first_seen_at: string;
  last_seen_at: string;
}

/**
 * Note-phrase link in database
 */
export interface NotePhrase {
  id: string;
  note_id: string;
  phrase_id: string;
  created_at: string;
}

/**
 * Phrase with note count (for analytics)
 */
export interface PhraseWithCount extends Phrase {
  note_count: number;
}

