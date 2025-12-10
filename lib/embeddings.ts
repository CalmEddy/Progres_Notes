import { getOpenAIClient } from './openaiClient';

/**
 * Generate an embedding for the given text using OpenAI's embedding model
 * Uses text-embedding-3-small which produces 1536-dimensional vectors
 * 
 * @param text - The text to generate an embedding for
 * @returns A promise that resolves to the embedding vector as an array of numbers
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  try {
    const openai = getOpenAIClient();
    
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.trim(),
    });

    const embedding = response.data[0]?.embedding;

    if (!embedding) {
      throw new Error('No embedding returned from OpenAI');
    }

    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

