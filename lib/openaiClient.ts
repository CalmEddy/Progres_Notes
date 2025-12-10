import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

/**
 * Get or create the OpenAI client instance
 * Uses the OPENAI_API_KEY environment variable
 */
export function getOpenAIClient(): OpenAI {
  if (openaiClient) {
    return openaiClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  openaiClient = new OpenAI({
    apiKey: apiKey,
  });

  return openaiClient;
}

