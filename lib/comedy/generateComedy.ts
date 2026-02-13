/**
 * Comedy Generation Service
 *
 * Two-step pipeline:
 * 1. Base generation: Generate collision-driven observational notes (N_base = max(12, N_final * 3))
 * 2. Rewrite pass: Re-author selected notes with voice/style contracts into final material
 */

import { getOpenAIClient } from '@/lib/openaiClient';
import { SYSTEM_PROMPT_BASE_PREMISES, SYSTEM_PROMPT_REWRITE } from './systemPrompt';
import {
  BASE_PREMISE_GENERATION_DEVELOPER_PROMPT,
  REWRITE_DEVELOPER_PROMPT_SNAPSHOT_ESCALATION_FINAL,
} from './developerPrompt';
import {
  JokeGenResponse,
  RewrittenItem,
  JokePair,
} from '@/lib/jokeDiagnostics';
import { normalizePremise } from './normalizePremise';
import { getDefaultStyleContract, StyleContract } from './styleContracts';
import { getBasePremisesByNoteId } from './basePremiseStorage';

export interface ComedyGenerationConfig {
  enableRewrite?: boolean; // default: true
  baseMultiplier?: number; // default: 3
  minBaseCount?: number; // default: 12
  baseTemperature?: number; // default: 0.8
  rewriteTemperature?: number; // default: 0.6
}

export interface GenerateComedyParams {
  topic: string;
  jokeCount: number; // N_final
  clean?: boolean;
  styleContract?: StyleContract; // optional style contract for re-authoring
  config?: ComedyGenerationConfig; // optional config override
}

export interface GenerateComedyResponse extends JokeGenResponse {
  baseJokes?: string[]; // Deprecated: use selectedPremises instead
  selectedPremises?: WorldPremiseItem[]; // The selected premises sent to rewrite (for debugging)
}

// Base generation now returns premise notes.
export type WorldPremiseItem = { world: string; premise: string };
// Keep `premises` for backward compatibility with any existing callers,
// but primary output for the worlds pipeline is `items`.
export type BasePremiseResponse = { items: WorldPremiseItem[]; premises: string[] };

const JSON_OUTPUT_REMINDER = 'Output valid JSON only, no extra text.';

// Keep base generation cheap; rewrite does the heavy lifting.
const BASE_MODEL = process.env.BASE_MODEL || 'gpt-4o-mini';

// Allow separate model selection for rewrite vs base generation.
// Default rewrite model should be stronger than base if you want GPT-level punch.
const REWRITE_MODEL = process.env.REWRITE_MODEL || 'gpt-4o';

function getDefaultConfig(): Required<ComedyGenerationConfig> {
  return {
    enableRewrite: process.env.COMEDY_REWRITE_ENABLED !== 'false',
    baseMultiplier: Number(process.env.COMEDY_BASE_MULTIPLIER) || 3,
    minBaseCount: Number(process.env.COMEDY_MIN_BASE_COUNT) || 12,
    baseTemperature: 0.8,
    rewriteTemperature: 0.6,
  };
}

function buildUserMessage(topic: string, premiseCount: number, cleanLabel: string) {
  return `Topic:\n${topic}\n\nGenerate ${premiseCount} collision notes.\n\nEach note must:\n- Be EXACTLY one sentence\n- Express one collision or angle\n- Include at least one concrete object or action\n\nReturn them as JSON with the key "items".`;
}

function redactContent(content: string, maxLength: number = 50): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + '...';
}

/**
 * Step 1: Generate base premise notes
 */
export async function generateBasePremises({
  topic,
  premiseCount,
  cleanLabel,
  temperature,
  addReminder,
}: {
  topic: string;
  premiseCount: number;
  cleanLabel: string;
  temperature: number;
  addReminder: boolean;
}): Promise<BasePremiseResponse> {
  const openai = getOpenAIClient();
  const userMessage = buildUserMessage(topic, premiseCount, cleanLabel);
  const maxTokens = Math.min(180 * premiseCount, 3600);

  const messages = [
    {
      role: 'system' as const,
      content: SYSTEM_PROMPT_BASE_PREMISES,
    },
    {
      role: 'developer' as const,
      content: BASE_PREMISE_GENERATION_DEVELOPER_PROMPT,
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
    model: BASE_MODEL,
    messages,
    response_format: { type: 'json_object' },
    temperature,
    top_p: 0.95,
    presence_penalty: 0.3,
    frequency_penalty: 0.2,
    max_tokens: maxTokens,
  });

  const outputText = completion.choices[0]?.message?.content || '';

  if (!outputText.trim()) {
    throw new Error('Empty response from OpenAI');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(outputText.trim());
  } catch {
    // Hard fail: base step must be machine-parseable.
    throw new Error('Base premise generation returned invalid JSON.');
  }

  // New format: items array with {world, premise} objects
  if (parsed?.items && Array.isArray(parsed.items)) {
    const items: WorldPremiseItem[] = parsed.items.map((item: any, idx: number) => {
      if (typeof item === 'object' && item !== null) {
        const world = typeof item.world === 'string' && item.world.trim() ? item.world.trim() : 'unspecified';
        const premise =
          typeof item.premise === 'string' && item.premise.trim()
            ? item.premise.trim()
            : String(item.premise ?? '');
        // Keep premise non-empty; if empty, produce a minimal placeholder to avoid downstream crashes.
        return { world, premise: premise || `Moment ${idx + 1} breaks down under ${world}.` };
      }
      // Fallback if structure is unexpected
      return { world: 'unspecified', premise: String(item) };
    });
    return { items, premises: items.map((it) => it.premise) };
  }

  // Backward compatibility: accept old "premises" or "jokes" arrays
  const premises: unknown = parsed?.premises ?? parsed?.jokes;
  if (Array.isArray(premises)) {
    const normalized = premises.map(String);
    const items: WorldPremiseItem[] = normalized.map((p) => ({ world: 'unspecified', premise: p }));
    return { items, premises: normalized };
  }

  throw new Error('Base premise generation must return {"items":[{world, premise}]} or {"premises":[...]}');
}

/**
 * Select top K premises for rewriting
 * Since we no longer have diagnostics, just take the first k items.
 */
function selectPremisesForRewrite(
  baseResponse: BasePremiseResponse,
  k: number
): WorldPremiseItem[] {
  return baseResponse.items.slice(0, k);
}

/**
 * Step 2: Re-author selected collision notes with voice/style contracts
 */
export async function rewriteJokes({
  items,
  topic,
  jokeCount,
  temperature,
  addReminder,
  styleContract,
}: {
  items: WorldPremiseItem[];
  topic: string;
  jokeCount: number;
  temperature: number;
  addReminder: boolean;
  styleContract: StyleContract;
}): Promise<JokeGenResponse> {
  const openai = getOpenAIClient();

  // Normalize premises to prevent analogy/listicle framing from contaminating rewrite.
  const normalizedItems = items.map((it) => ({
    world: it.world,
    premise: normalizePremise(it.premise),
  }));

  const normalizedItemsList = normalizedItems
    .map((it, index) => `${index + 1}. { "world": "${it.world}", "premise": "${it.premise}" }`)
    .join('\n');

  // Build style contract JSON for the user message
  const styleContractJson = JSON.stringify(styleContract, null, 2);

  // Re-author each item using the style contract
  const userMessage = `Re-author each item below using the provided style contract.

STYLE CONTRACT:
${styleContractJson}

ITEMS:
${normalizedItemsList}

OUTPUT FORMAT (STRICT):
Return valid JSON only, in this exact shape:
{
  "jokes": [
    { "world": "<copied from input>", "premise": "<copied from input>", "text": "<re-authored output text>" }
  ]
}

Return the same number of objects as inputs, in the same order.`;

  const maxTokens = Math.min(220 * jokeCount, 3600);

  const messages = [
    {
      role: 'system' as const,
      content: SYSTEM_PROMPT_REWRITE,
    },
    {
      role: 'developer' as const,
      content: REWRITE_DEVELOPER_PROMPT_SNAPSHOT_ESCALATION_FINAL,
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
    model: REWRITE_MODEL,
    messages,
    response_format: { type: 'json_object' },
    temperature,
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
    max_tokens: maxTokens,
  });

  const outputText = completion.choices[0]?.message?.content || '';

  if (!outputText.trim()) {
    throw new Error('Empty response from OpenAI');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(outputText.trim());
  } catch {
    const redactedOutput = redactContent(outputText, 500);
    console.error(`[Rewrite] Invalid JSON. Response preview: ${redactedOutput}`);
    throw new Error('Rewrite returned invalid JSON.');
  }

  const jokesRaw: any = parsed?.jokes;
  if (!Array.isArray(jokesRaw)) {
    const redactedOutput = redactContent(outputText, 500);
    console.error(`[Rewrite] Missing "jokes" array. Response preview: ${redactedOutput}`);
    throw new Error('Rewrite must return {"jokes":[...]}.');
  }

  if (jokesRaw.length !== jokeCount) {
    const redactedOutput = redactContent(outputText, 500);
    console.error(
      `[Rewrite] Expected ${jokeCount} joke objects, got ${jokesRaw.length}. Response preview: ${redactedOutput}`
    );
    throw new Error(`Rewrite must return exactly ${jokeCount} joke objects.`);
  }

  // Parse new format: {world, premise, text}
  // Support legacy format as fallback: {world, premise, a, b}
  const jokes: Array<RewrittenItem | JokePair> = jokesRaw.map((j: any, idx: number) => {
    const world = typeof j?.world === 'string' ? j.world : normalizedItems[idx]?.world || 'unspecified';
    const premise = typeof j?.premise === 'string' ? j.premise : normalizedItems[idx]?.premise || '';

    // Check for new format (text property)
    if (typeof j?.text === 'string' && j.text.trim()) {
      return { world, premise, text: j.text.trim() };
    }

    // Fallback to legacy format (a/b properties)
    if (typeof j?.a === 'string' && j.a.trim() && typeof j?.b === 'string' && j.b.trim()) {
      // Convert legacy format to new format by using 'a' as the text
      return { world, premise, text: j.a.trim() };
    }

    // Validation: must have either text or a/b
    throw new Error(
      `Rewrite joke object at index ${idx} must include non-empty "text" (or "a"/"b" for legacy format).`
    );
  });

  return { jokes };
}

/**
 * Rewrite premises from a stored note
 * Loads base premises from the database and rewrites them with the specified style contract
 */
export async function rewritePremisesFromNote(
  noteId: string,
  styleContract: StyleContract,
  jokeCount: number,
  accessToken?: string
): Promise<JokeGenResponse> {
  // Get base premises from database
  const basePremises = await getBasePremisesByNoteId(noteId, accessToken);
  
  if (!basePremises) {
    throw new Error(`No base premises found for note ${noteId}`);
  }

  // Select the requested number of premises
  const selectedItems = basePremises.items.slice(0, jokeCount);
  
  if (selectedItems.length < jokeCount) {
    console.warn(
      `Requested ${jokeCount} jokes but only ${selectedItems.length} premises available. Using ${selectedItems.length}.`
    );
  }

  // Get default config for temperature settings
  const config = getDefaultConfig();
  
  // Rewrite with the selected style contract
  return await rewriteJokes({
    items: selectedItems,
    topic: basePremises.topic,
    jokeCount: selectedItems.length,
    temperature: config.rewriteTemperature,
    addReminder: false,
    styleContract,
  });
}

/**
 * Generate comedy material using two-step pipeline
 *
 * Pipeline:
 * 1. Base generation: Generate N_base collision notes
 * 2. Selection: Select top K notes for rewriting
 * 3. Rewrite: Re-author selected notes with voice/style contracts into final material
 *
 * @param params - Generation parameters
 * @returns JSON response with re-authored material and base notes (for debugging)
 */
export async function generateComedy({
  topic,
  jokeCount,
  clean = true,
  styleContract,
  config = {},
}: GenerateComedyParams): Promise<GenerateComedyResponse> {
  const finalConfig = { ...getDefaultConfig(), ...config };
  const cleanLabel = clean === false ? 'NO' : 'YES';

  // Calculate N_base
  const nBase = Math.max(finalConfig.minBaseCount, jokeCount * finalConfig.baseMultiplier);

  console.log(
    `[Comedy Generation] Topic: ${topic}, N_final: ${jokeCount}, N_base: ${nBase}, Rewrite: ${finalConfig.enableRewrite}`
  );

  // Step 1: Generate base premise notes
  let baseResponse: BasePremiseResponse;
  try {
    baseResponse = await generateBasePremises({
      topic,
      premiseCount: nBase,
      cleanLabel,
      temperature: finalConfig.baseTemperature,
      addReminder: false,
    });
    console.log(
      `[Comedy Generation] Base generation: ${baseResponse.premises.length} premise notes generated (requested ${nBase})`
    );
    
    // Ensure we have enough premises to proceed
    if (baseResponse.premises.length < jokeCount) {
      throw new Error(
        `Base generation returned only ${baseResponse.premises.length} premises, but need at least ${jokeCount}`
      );
    }
  } catch (error) {
    console.warn(
      `[Comedy Generation] Base generation error, retrying: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    try {
      baseResponse = await generateBasePremises({
        topic,
        premiseCount: nBase,
        cleanLabel,
        temperature: finalConfig.baseTemperature,
        addReminder: true,
      });
      console.log(
        `[Comedy Generation] Base generation retry: ${baseResponse.premises.length} premise notes generated (requested ${nBase})`
      );
      
      // Ensure we have enough premises to proceed
      if (baseResponse.premises.length < jokeCount) {
        throw new Error(
          `Base generation retry returned only ${baseResponse.premises.length} premises, but need at least ${jokeCount}`
        );
      }
    } catch (retryError) {
      const errorMsg = retryError instanceof Error ? retryError.message : 'Unknown error';
      console.error(
        `[Comedy Generation] Base generation failed after retry: ${errorMsg}, Content: ${redactContent(
          errorMsg
        )}`
      );
      throw new Error(`Failed to generate base premises: ${errorMsg}`);
    }
  }

  // If rewrite is disabled, we can't return material without rewriting, so throw an error
  if (!finalConfig.enableRewrite) {
    throw new Error('Rewrite is disabled but required to convert notes to final material');
  }

  // Step 1b: Select notes for rewriting
  const selected = selectPremisesForRewrite(baseResponse, jokeCount);
  console.log(
    `[Comedy Generation] Selected ${selected.length} items for rewriting from ${baseResponse.items.length} base items`
  );

  // Use provided style contract or default
  const contractToUse = styleContract || getDefaultStyleContract();

  // Step 2: Re-author selected notes
  try {
    const rewrittenResponse = await rewriteJokes({
      items: selected,
      topic,
      jokeCount,
      temperature: finalConfig.rewriteTemperature,
      addReminder: false,
      styleContract: contractToUse,
    });
    console.log(
      `[Comedy Generation] Rewrite successful: ${rewrittenResponse.jokes.length} items rewritten`
    );
    return {
      ...rewrittenResponse,
      baseJokes: selected.map((it) => it.premise), // Deprecated: for backward compatibility
      selectedPremises: selected, // Include selected premises with world constraints for debugging
    };
  } catch (error) {
    console.warn(
      `[Comedy Generation] Rewrite error, retrying: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    try {
      const rewrittenResponse = await rewriteJokes({
        items: selected,
        topic,
        jokeCount,
        temperature: finalConfig.rewriteTemperature,
        addReminder: true,
        styleContract: contractToUse,
      });
      console.log(
        `[Comedy Generation] Rewrite retry successful: ${rewrittenResponse.jokes.length} items rewritten`
      );
      return {
        ...rewrittenResponse,
        baseJokes: selected.map((it) => it.premise), // Include base premises for debugging
      };
    } catch (retryError) {
      const errorMsg = retryError instanceof Error ? retryError.message : 'Unknown error';
      console.warn(
        `[Comedy Generation] Rewrite failed after retry. Error: ${errorMsg}, Content: ${redactContent(
          errorMsg
        )}`
      );
      // Can't fallback to base notes since they're not final material
      throw new Error(`Failed to rewrite notes into final material: ${errorMsg}`);
    }
  }
}
