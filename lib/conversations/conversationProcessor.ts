import { createChunksForNote } from '../chunks/chunking';
import { generateEmbeddingsForNoteChunks } from '../chunks/embeddingService';
import { generateThemeForNote } from '../themes/themeGeneration';
import { getConversationWithMessages } from './conversationStorage';

/**
 * Process a conversation: chunk it, generate embeddings, and create themes
 * This leverages existing chunking and theme generation systems
 */
export async function processConversation(
  conversationNoteId: string,
  accessToken?: string
): Promise<void> {
  // Get the conversation with messages
  const conversation = await getConversationWithMessages(
    conversationNoteId,
    accessToken
  );

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  // The conversation note body already contains all messages formatted
  // Use existing chunking system to break it into pieces
  await createChunksForNote(
    conversationNoteId,
    conversation.note.body,
    accessToken
  );

  // Generate embeddings for the chunks (this happens asynchronously in the background)
  // We'll trigger it here to ensure it happens
  try {
    await generateEmbeddingsForNoteChunks(conversationNoteId, accessToken);
  } catch (error) {
    console.error('Error generating embeddings for conversation chunks:', error);
    // Don't throw - embeddings can be generated later
  }

  // Generate theme for the conversation using existing theme generation
  try {
    await generateThemeForNote(
      conversationNoteId,
      accessToken,
      true, // preserve user-modified labels
      conversation.note.title
    );
  } catch (error) {
    console.error('Error generating theme for conversation:', error);
    // Don't throw - theme generation can be retried
  }
}

/**
 * Process all conversations for a user
 * Useful for batch processing or backfilling
 */
export async function processAllUserConversations(
  userId: string,
  accessToken?: string
): Promise<{ processed: number; errors: number }> {
  const { getUserConversations } = await import('./conversationStorage');
  
  const conversations = await getUserConversations(userId, accessToken);
  let processed = 0;
  let errors = 0;

  for (const conversation of conversations) {
    try {
      await processConversation(conversation.id, accessToken);
      processed++;
    } catch (error) {
      console.error(`Error processing conversation ${conversation.id}:`, error);
      errors++;
    }
  }

  return { processed, errors };
}

