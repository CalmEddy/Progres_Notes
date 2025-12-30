import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabaseServerClient';
import { createNoteForUser, Note } from '../notes';
import { ConversationMessage, ConversationNote, ConversationWithMessages } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Helper to create an authenticated Supabase client with user session
 */
function createAuthenticatedClient(accessToken?: string) {
  if (accessToken) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }
  return null;
}

/**
 * Create a new conversation note and save initial messages
 */
export async function createConversation(
  userId: string,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  title?: string | null,
  accessToken?: string
): Promise<ConversationNote> {
  // Build conversation body from messages
  const conversationBody = messages
    .map(msg => `${msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System'}: ${msg.content}`)
    .join('\n\n');

  // Create the conversation note
  const note = await createNoteForUser(
    userId,
    title || `Conversation ${new Date().toLocaleString()}`,
    conversationBody,
    undefined, // folderId
    undefined, // parentNoteId
    undefined, // position
    accessToken
  );

  // Update note to mark it as a conversation
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  
  const { data: updatedNote, error: updateError } = await supabase
    .from('notes')
    .update({
      is_conversation: true,
      conversation_id: note.id, // Self-reference for the conversation
    })
    .eq('id', note.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (updateError) {
    console.error('Error updating note as conversation:', updateError);
    throw new Error(`Failed to mark note as conversation: ${updateError.message}`);
  }

  // Save individual messages
  if (messages.length > 0) {
    await saveConversationMessages(note.id, messages, accessToken);
  }

  return {
    id: updatedNote.id,
    user_id: updatedNote.user_id,
    title: updatedNote.title,
    body: updatedNote.body,
    conversation_id: updatedNote.conversation_id,
    is_conversation: updatedNote.is_conversation,
    created_at: updatedNote.created_at,
    updated_at: updatedNote.updated_at,
  } as ConversationNote;
}

/**
 * Save messages to the conversations table
 */
export async function saveConversationMessages(
  conversationNoteId: string,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  accessToken?: string
): Promise<ConversationMessage[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Get current max message_index for this conversation
  const { data: existingMessages } = await supabase
    .from('conversations')
    .select('message_index')
    .eq('conversation_note_id', conversationNoteId)
    .order('message_index', { ascending: false })
    .limit(1);

  let nextIndex = 0;
  if (existingMessages && existingMessages.length > 0) {
    nextIndex = existingMessages[0].message_index + 1;
  }

  // Prepare messages for insertion
  const messagesToInsert = messages.map((msg, idx) => ({
    conversation_note_id: conversationNoteId,
    role: msg.role,
    content: msg.content,
    message_index: nextIndex + idx,
  }));

  const { data: insertedMessages, error } = await supabase
    .from('conversations')
    .insert(messagesToInsert)
    .select();

  if (error) {
    console.error('Error saving conversation messages:', error);
    throw new Error(`Failed to save conversation messages: ${error.message}`);
  }

  return (insertedMessages || []) as ConversationMessage[];
}

/**
 * Add a new message to an existing conversation
 */
export async function addMessageToConversation(
  conversationNoteId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  accessToken?: string
): Promise<ConversationMessage> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Get current max message_index
  const { data: existingMessages } = await supabase
    .from('conversations')
    .select('message_index')
    .eq('conversation_note_id', conversationNoteId)
    .order('message_index', { ascending: false })
    .limit(1);

  const nextIndex = existingMessages && existingMessages.length > 0
    ? existingMessages[0].message_index + 1
    : 0;

  const { data: insertedMessage, error } = await supabase
    .from('conversations')
    .insert({
      conversation_note_id: conversationNoteId,
      role,
      content,
      message_index: nextIndex,
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding message to conversation:', error);
    throw new Error(`Failed to add message to conversation: ${error.message}`);
  }

  // Update the conversation note body to include the new message
  await updateConversationNoteBody(conversationNoteId, accessToken);

  return insertedMessage as ConversationMessage;
}

/**
 * Update the conversation note body to reflect all messages
 */
async function updateConversationNoteBody(
  conversationNoteId: string,
  accessToken?: string
): Promise<void> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Get all messages
  const { data: messages } = await supabase
    .from('conversations')
    .select('*')
    .eq('conversation_note_id', conversationNoteId)
    .order('message_index', { ascending: true });

  if (!messages || messages.length === 0) {
    return;
  }

  // Build updated body
  const conversationBody = messages
    .map(msg => {
      const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
      return `${roleLabel}: ${msg.content}`;
    })
    .join('\n\n');

  // Update note body
  const { error } = await supabase
    .from('notes')
    .update({ body: conversationBody })
    .eq('id', conversationNoteId);

  if (error) {
    console.error('Error updating conversation note body:', error);
    // Don't throw - this is a background update
  }
}

/**
 * Get a conversation with all its messages
 */
export async function getConversationWithMessages(
  conversationNoteId: string,
  accessToken?: string
): Promise<ConversationWithMessages | null> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Get the note
  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('*')
    .eq('id', conversationNoteId)
    .single();

  if (noteError) {
    if (noteError.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error getting conversation note:', noteError);
    throw new Error(`Failed to get conversation note: ${noteError.message}`);
  }

  // Get all messages
  const { data: messages, error: messagesError } = await supabase
    .from('conversations')
    .select('*')
    .eq('conversation_note_id', conversationNoteId)
    .order('message_index', { ascending: true });

  if (messagesError) {
    console.error('Error getting conversation messages:', messagesError);
    throw new Error(`Failed to get conversation messages: ${messagesError.message}`);
  }

  return {
    note: note as ConversationNote,
    messages: (messages || []) as ConversationMessage[],
  };
}

/**
 * Get all conversations for a user
 */
export async function getUserConversations(
  userId: string,
  accessToken?: string
): Promise<ConversationNote[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .eq('is_conversation', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error getting user conversations:', error);
    throw new Error(`Failed to get user conversations: ${error.message}`);
  }

  return (data || []) as ConversationNote[];
}

