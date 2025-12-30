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
import { VOICE_CONTRACTS, HumoristId, VoiceContract } from './voiceContracts';

export interface GenerateComedyParams {
  topic: string;
  jokeCount: number;
  humoristId?: HumoristId;
  clean?: boolean; // NEW: optional constraint
}

function buildStyleOverlay(voiceContract: VoiceContract, humoristId: HumoristId): string {
  const specialInstruction =
    humoristId === 'steven_wright'
      ? '\nAdditional constraint: Each joke must be a SINGLE sentence.'
      : '';

  return `\n\nSTYLE OVERLAY (secondary to mechanism-first comedy):
Apply these voice constraints for phrasing, rhythm, and tone only.
Humorist: ${voiceContract.humorist}

Core Point of View
${voiceContract.corePointOfView}

Primary Joke Engine
${voiceContract.primaryJokeEngine}

Emotional Stance
${voiceContract.emotionalStance}

Signature Devices (rotate per joke)
${voiceContract.signatureDevices.map(device => `- ${device}`).join('\n')}

Sentence and Pacing Characteristics
${voiceContract.sentenceAndPacingCharacteristics}

Tone Boundaries (must not cross)
${voiceContract.toneBoundaries.map(boundary => `- ${boundary}`).join('\n')}

Forbidden Comedy Moves
${voiceContract.forbiddenComedyMoves.map(move => `- ${move}`).join('\n')}

Voice Fingerprints (at least one per joke)
${voiceContract.voiceFingerprints.map(fingerprint => `- ${fingerprint}`).join('\n')}${specialInstruction}`;
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
 * Generate comedy jokes using the specified humorist's voice
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
  humoristId = 'dave_barry',
  clean = true,
}: GenerateComedyParams): Promise<string> {
  const voiceContract = VOICE_CONTRACTS[humoristId];

  if (!voiceContract) {
    throw new Error(`Voice contract not found for humorist: ${humoristId}`);
  }

  try {
    const openai = getOpenAIClient();
    const developerMessage = `${SIMPLIFIED_DEVELOPER_PROMPT}${buildStyleOverlay(
      voiceContract,
      humoristId
    )}`;
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
