/**
 * Skeleton Renderer (Stage C)
 *
 * Renders selected joke skeletons through voice contracts to produce
 * final stand-up jokes.
 */

import { getOpenAIClient } from '@/lib/openaiClient';
import { SYSTEM_PROMPT } from './systemPrompt';
import { buildRendererUserMessage } from './skeletonPrompts';
import { VoiceContract, HumoristId } from './voiceContracts';
import { JokeSkeleton } from './jokeSkeletons';

export interface RendererConstraints {
  clean?: boolean;
}

export function normalizeRenderedJokes(output: string): {
  jokes: string[];
  normalized: string;
} {
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

function normalizeForMatch(text: string): string {
  return text.trim().toLowerCase().replace(/[.!?]+$/g, '');
}

export function jokeEndsWithPunchLine(joke: string, punchLine: string): boolean {
  const normalizedJoke = normalizeForMatch(joke);
  const normalizedPunch = normalizeForMatch(punchLine);
  return normalizedJoke.endsWith(normalizedPunch);
}

function isValidRenderedJokes(
  output: string,
  jokeCount: number,
  skeletons: JokeSkeleton[]
): {
  jokes: string[];
  normalized: string;
  isValid: boolean;
} {
  const { jokes, normalized } = normalizeRenderedJokes(output);
  const hasValidPunches =
    jokes.length === skeletons.length &&
    jokes.every((joke, index) => jokeEndsWithPunchLine(joke, skeletons[index].punchLine));
  return {
    jokes,
    normalized,
    isValid: jokes.length === jokeCount && hasValidPunches,
  };
}

/**
 * Render selected skeletons into final jokes using voice contract
 *
 * @param skeletons - Selected joke skeletons to render
 * @param voiceContract - Voice contract to apply
 * @param humoristId - Humorist ID (for special handling like Steven Wright)
 * @param jokeCount - Target number of jokes
 * @param topic - Topic for context
 * @param constraints - Optional constraints (clean/edgy)
 * @returns Final jokes as plain text
 */
export async function renderJokesFromSkeletons(
  skeletons: JokeSkeleton[],
  voiceContract: VoiceContract,
  humoristId: HumoristId,
  jokeCount: number,
  topic: string,
  constraints: RendererConstraints = {}
): Promise<string> {
  const openai = getOpenAIClient();
  const clean = constraints.clean !== false; // default to true

  // Build voice contract section
  const voiceContractSection = `Humorist: ${voiceContract.humorist}

Joke count: ${jokeCount}

Clean: ${clean ? 'YES' : 'NO'}

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
${voiceContract.internalQualityCheck}`;

  // Special handling for Steven Wright
  const specialInstructions =
    humoristId === 'steven_wright'
      ? '\n\nSPECIAL INSTRUCTION: Each joke must be a SINGLE SENTENCE. No multi-sentence jokes.'
      : '';

  const userMessage = `${voiceContractSection}

${buildRendererUserMessage(topic, jokeCount, skeletons, clean)}${specialInstructions}

Additional request constraints:

- Do not include labels.
- One joke per paragraph, one blank line between jokes.
- Each joke 1–3 sentences${humoristId === 'steven_wright' ? ' (preferably 1 sentence)' : ''}.`;

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content:
              attempt === 0
                ? userMessage
                : `${userMessage}\n\nCRITICAL: Output exactly ${jokeCount} jokes. One joke per paragraph, one blank line between jokes, no numbering or labels.`,
          },
        ],
        temperature: 0.8,
        top_p: 0.95,
        presence_penalty: 0.3,
        frequency_penalty: 0.2,
        max_tokens: 1200,
      });

      const outputText = completion.choices[0]?.message?.content || '';

      if (!outputText.trim()) {
        throw new Error('Empty response from OpenAI');
      }

      const { isValid, normalized } = isValidRenderedJokes(outputText, jokeCount, skeletons);
      if (isValid) {
        return normalized;
      }
    }

    throw new Error(`Renderer returned incorrect joke count (expected ${jokeCount})`);
  } catch (error) {
    console.error('Error rendering jokes:', error);
    throw new Error(
      `Failed to render jokes: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
