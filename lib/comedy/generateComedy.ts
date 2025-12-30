/**
 * Comedy Generation Service
 *
 * Generates comedy jokes using a single-call pipeline:
 * 1. System prompt (stand-up formatting rules)
 * 2. Developer prompt (joke quality + diagnostics schema)
 * 3. User topic/request
 */

import { getOpenAIClient } from '@/lib/openaiClient';
import { SYSTEM_PROMPT } from './systemPrompt';
import { SIMPLIFIED_DEVELOPER_PROMPT } from './developerPrompt';
import { JokeGenResponse, parseJokeGenResponse } from '@/lib/jokeDiagnostics';
export interface GenerateComedyParams {
  topic: string;
  jokeCount: number;
  clean?: boolean; // NEW: optional constraint
}

const JSON_OUTPUT_REMINDER = 'Output valid JSON only, no extra text.';

function buildUserMessage(topic: string, jokeCount: number, cleanLabel: string) {
  return `Topic: ${topic}\nJoke count: ${jokeCount}\nClean: ${cleanLabel}`;
}

async function requestJokeResponse({
  topic,
  jokeCount,
  cleanLabel,
  addReminder,
}: {
  topic: string;
  jokeCount: number;
  cleanLabel: string;
  addReminder: boolean;
}): Promise<JokeGenResponse> {
  const openai = getOpenAIClient();
  const userMessage = buildUserMessage(topic, jokeCount, cleanLabel);
  const maxTokens = Math.min(220 * jokeCount, 3600);

  const messages = [
    {
      role: 'system' as const,
      content: SYSTEM_PROMPT,
    },
    {
      role: 'developer' as const,
      content: SIMPLIFIED_DEVELOPER_PROMPT,
    },
    {
      role: 'user' as const,
      content: userMessage,
    },
  ];

  if (addReminder) {
    messages.push({
      role: 'developer',
      content: JSON_OUTPUT_REMINDER,
    });
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    response_format: { type: 'json_object' },
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

  return parseJokeGenResponse(outputText, jokeCount);
}

/**
 * Generate comedy jokes with diagnostics using the updated schema
 *
 * Single-call pipeline:
 * 1. System prompt (stand-up formatting rules)
 * 2. Developer prompt (joke quality + diagnostics schema)
 * 3. User topic/request
 *
 * @param params - Generation parameters
 * @returns JSON response with jokes and aligned diagnostics
 */
export async function generateComedy({
  topic,
  jokeCount,
  clean = true,
}: GenerateComedyParams): Promise<JokeGenResponse> {
  try {
    const cleanLabel = clean === false ? 'NO' : 'YES';
    return await requestJokeResponse({
      topic,
      jokeCount,
      cleanLabel,
      addReminder: false,
    });
  } catch (error) {
    console.warn('Error generating comedy, retrying once:', error);
    try {
      const cleanLabel = clean === false ? 'NO' : 'YES';
      return await requestJokeResponse({
        topic,
        jokeCount,
        cleanLabel,
        addReminder: true,
      });
    } catch (retryError) {
      console.error('Error generating comedy after retry:', retryError);
      throw new Error(
        `Failed to generate comedy: ${
          retryError instanceof Error ? retryError.message : 'Unknown error'
        }`
      );
    }
  }
}
