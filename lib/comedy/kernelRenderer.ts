/**
 * Kernel Renderer (Stage B)
 * 
 * Renders selected joke kernels through voice contracts to produce
 * final stand-up jokes.
 */

import { getOpenAIClient } from '@/lib/openaiClient';
import { SYSTEM_PROMPT } from './systemPrompt';
import { buildRendererUserMessage } from './kernelPrompts';
import { VoiceContract, HumoristId } from './voiceContracts';
import { JokeKernel } from './comedyKernels';

export interface RendererConstraints {
  clean?: boolean;
}

/**
 * Render selected kernels into final jokes using voice contract
 * 
 * @param kernels - Selected joke kernels to render
 * @param voiceContract - Voice contract to apply
 * @param humoristId - Humorist ID (for special handling like Steven Wright)
 * @param jokeCount - Target number of jokes
 * @param topic - Topic for context
 * @param constraints - Optional constraints (clean/edgy)
 * @returns Final jokes as plain text
 */
export async function renderJokesFromKernels(
  kernels: JokeKernel[],
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

${buildRendererUserMessage(topic, jokeCount, kernels, clean)}${specialInstructions}

Additional request constraints:

- Do not include labels.
- One joke per paragraph, one blank line between jokes.
- Each joke 1–3 sentences${humoristId === 'steven_wright' ? ' (preferably 1 sentence)' : ''}.`;

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
          content: userMessage,
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

    return outputText.trim();
  } catch (error) {
    console.error('Error rendering jokes:', error);
    throw new Error(
      `Failed to render jokes: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

