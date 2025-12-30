export interface ConversationMessage {
  id: string;
  conversation_note_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  message_index: number;
  created_at: string;
}

export interface ConversationNote {
  id: string;
  user_id: string;
  title: string | null;
  body: string;
  conversation_id: string | null;
  is_conversation: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationWithMessages {
  note: ConversationNote;
  messages: ConversationMessage[];
}

