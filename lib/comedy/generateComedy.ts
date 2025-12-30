/**
 * Comedy Generation Service
 *
 * Generates comedy jokes using a single-call pipeline:
 * 1. System prompt (unchanged)
 * 2. Developer prompt (mechanism-first comedy)
 * 3. User topic/request
 */

import { getOpenAIClient } from '@/lib/openaiClient';
import { SYSTEM_PROMPT } from './systemPrompt';
import { SIMPLIFIED_DEVELOPER_PROMPT } from './developerPrompt';
export interface GenerateComedyParams {
  topic: string;
  jokeCount: number;
  clean?: boolean; // NEW: optional constraint
}

function normalizeJokeOutput(output: string): { jokes: string[]; normalized: string } {
  const normalizedNewlines = output.trim().replace(/\r\n/g, '\n');
  const jokes = normalizedNewlines
    .split(/\n\s*\n/)
    .map(joke => joke.trim().replace(/\s*\n\s*/g, ' '))
    .filter(Boolean);

  return {
    jokes,
    normalized: jokes.join('\n\n'),
  };
}

/**
 * Generate comedy jokes using the mechanism-first prompt
 *
 * Single-call pipeline:
 * 1. System prompt (unchanged)
 * 2. Developer prompt (mechanism-first comedy)
 * 3. User topic/request
 *
 * @param params - Generation parameters
 * @returns Plain text output with jokes separated by blank lines
 */
export async function generateComedy({
  topic,
  jokeCount,
  clean = true,
}: GenerateComedyParams): Promise<string> {
  try {
    const openai = getOpenAIClient();
    const developerMessage = SIMPLIFIED_DEVELOPER_PROMPT;
    const cleanLabel = clean === false ? 'NO' : 'YES';
    const userMessage = `Topic: ${topic}
Joke count: ${jokeCount}
Clean: ${cleanLabel}`;
    const maxTokens = Math.min(120 * jokeCount, 3000);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'developer',
          content: developerMessage,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
      temperature: 0.9,
      top_p: 0.95,
      presence_penalty: 0.3,
      frequency_penalty: 0.2,
      max_tokens: maxTokens,
    });

    const outputText = completion.choices[0]?.message?.content || '';

    if (!outputText.trim()) {
      throw new Error('Empty response from OpenAI');
    }

    const { jokes, normalized } = normalizeJokeOutput(outputText);
    if (jokes.length !== jokeCount) {
      throw new Error(`Expected ${jokeCount} jokes but received ${jokes.length}`);
    }

    return normalized;
  } catch (error) {
    console.error('Error generating comedy:', error);
    throw new Error(
      `Failed to generate comedy: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
