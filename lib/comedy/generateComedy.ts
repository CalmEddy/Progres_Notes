/**
 * Comedy Generation Service
 * 
 * Generates comedy jokes using OpenAI's Chat Completions API
 * with a stable system prompt and voice contracts.
 */

import { getOpenAIClient } from '@/lib/openaiClient';
import { SYSTEM_PROMPT } from './systemPrompt';
import { VOICE_CONTRACTS, HumoristId } from './voiceContracts';

export interface GenerateComedyParams {
  topic: string;
  jokeCount: number;
  humoristId?: HumoristId;
}

/**
 * Generate comedy jokes using the specified humorist's voice
 * 
 * @param params - Generation parameters
 * @returns Plain text output with jokes separated by blank lines
 */
export async function generateComedy({
  topic,
  jokeCount,
  humoristId = 'dave_barry',
}: GenerateComedyParams): Promise<string> {
  const voiceContract = VOICE_CONTRACTS[humoristId];

  if (!voiceContract) {
    throw new Error(`Voice contract not found for humorist: ${humoristId}`);
  }

  // Construct the developer message template
  const developerMessage = `Humorist: ${voiceContract.humorist}

Joke count: ${jokeCount}

Clean: YES

Voice Contract:

VOICE CONTRACT: ${voiceContract.humorist.toUpperCase()}

Humorist: ${voiceContract.humorist}

Core Point of View
${voiceContract.corePointOfView}

Primary Joke Engine
${voiceContract.primaryJokeEngine}

Emotional Stance
${voiceContract.emotionalStance}

Signature Devices (required, rotate per joke)
${voiceContract.signatureDevices.map(d => `- ${d}`).join('\n')}

Sentence and Pacing Characteristics
${voiceContract.sentenceAndPacingCharacteristics}

Subject Strengths
${voiceContract.subjectStrengths.map(s => `- ${s}`).join('\n')}

Tone Boundaries (must not cross)
${voiceContract.toneBoundaries.map(t => `- ${t}`).join('\n')}

Forbidden Comedy Moves
${voiceContract.forbiddenComedyMoves.map(f => `- ${f}`).join('\n')}

Required Specificity
${voiceContract.requiredSpecificity}

Voice Fingerprints (at least one per joke)
${voiceContract.voiceFingerprints.map(f => `- ${f}`).join('\n')}

Internal Quality Check (silent)
${voiceContract.internalQualityCheck}

Additional request constraints:

- Topic: ${topic}

- Do not include labels.

- One joke per paragraph, one blank line between jokes.

- Each joke 1–3 sentences.`;

  const openai = getOpenAIClient();

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: developerMessage,
        },
      ],
      temperature: 0.9,
      top_p: 0.95,
      presence_penalty: 0.4,
      frequency_penalty: 0.2,
      max_tokens: 700,
    });

    const outputText = completion.choices[0]?.message?.content || '';

    if (!outputText.trim()) {
      throw new Error('Empty response from OpenAI');
    }

    return outputText.trim();
  } catch (error) {
    console.error('Error generating comedy:', error);
    throw new Error(
      `Failed to generate comedy: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

