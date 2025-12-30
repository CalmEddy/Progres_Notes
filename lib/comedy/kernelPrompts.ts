/**
 * Prompt Templates for Kernel Generation and Rendering
 */

import { COMEDY_MECHANISMS } from './comedyMechanisms';

export const KERNEL_GENERATOR_SYSTEM_PROMPT = `You are a joke kernel generator. Your ONLY job is to generate raw joke ideas (kernels) in JSON format. You do NOT write finished jokes.

CRITICAL OUTPUT FORMAT:
- Return ONLY valid JSON matching the KernelBatch schema.
- No markdown, no prose, no explanations.
- JSON must be parseable and complete.
- Use proper JSON syntax: ASCII double quotes (") only, NOT curly quotes (" or ").
- No trailing commas, no comments.
- Ensure all property values are properly quoted and formatted.

COMEDY MECHANISM LIBRARY (use these):
${COMEDY_MECHANISMS.map((m, i) => `${i + 1}. ${m}`).join('\n')}

INSTRUCTIONS:
1. Generate 2-4 kernels per mechanism (total ~24-48 kernels).
2. Each kernel MUST include:
   - mechanism: one of the 12 mechanisms above
   - stance: one of: annoyed, anxious, smug, delighted, confused, self_deprecating, impatient, overconfident, paranoid, earnest, skeptical
   - anchor: a concrete object/place/system/sensory detail (NOT generic like "stuff", "things", "people")
   - setup: 8-18 words, sets up the joke
   - punch: 4-16 words, MUST be terminal and introduce NEW consequence/reversal/outcome
   - id: generate a unique UUID for each kernel

3. PUNCH REQUIREMENTS (CRITICAL):
   - Must introduce a NEW consequence, reversal, or forced outcome
   - Must NOT be a rhetorical question (no "?" endings)
   - Must NOT be commentary ("who knew", "apparently", "turns out", "at this point", "it's like", "kind of")
   - Must NOT be explanation ("which means", "that means", "so basically", "in other words")
   - Must be terminal - the joke ends here

4. SETUP REQUIREMENTS:
   - 8-18 words
   - Avoid narrative glue ("last week", "so there I am", "the other day")
   - Must include the anchor (concrete detail)

5. SELF-PRUNING:
   - Before returning, internally review all kernels
   - Remove weak, generic, or repetitive kernels
   - Keep only the strongest ideas

OUTPUT JSON SCHEMA:
{
  "topic": "string",
  "requestedCount": number,
  "kernels": [
    {
      "id": "uuid-string",
      "mechanism": "MECHANISM_NAME",
      "stance": "stance-name",
      "anchor": "concrete detail",
      "setup": "setup text 8-18 words",
      "punch": "punch text 4-16 words",
      "tags": ["optional", "tags"],
      "risk": "low" | "med" | "high"
    }
  ]
}`;

export function buildKernelGeneratorUserMessage(
  topic: string,
  requestedCount: number,
  clean: boolean = true
): string {
  return `Generate joke kernels for the topic: "${topic}"

Requested final joke count: ${requestedCount}
Clean humor: ${clean ? 'YES' : 'NO'}

Generate 2-4 kernels per mechanism (${COMEDY_MECHANISMS.length} mechanisms = ~24-48 total kernels).

Return ONLY valid JSON matching the KernelBatch schema. No markdown, no prose, no code blocks.
CRITICAL: Use ASCII straight double quotes (") only, NOT curly quotes. No trailing commas, valid JSON syntax only.`;
}

export function buildRendererUserMessage(
  topic: string,
  jokeCount: number,
  kernels: Array<{
    id: string;
    mechanism: string;
    stance: string;
    anchor: string;
    setup: string;
    punch: string;
  }>,
  clean: boolean = true
): string {
  const kernelsText = kernels
    .map(
      (k, i) => `Kernel ${i + 1}:
- Mechanism: ${k.mechanism}
- Stance: ${k.stance}
- Anchor: ${k.anchor}
- Setup: ${k.setup}
- Punch: ${k.punch}`
    )
    .join('\n\n');

  return `Topic: ${topic}
Joke count: ${jokeCount}
Clean: ${clean ? 'YES' : 'NO'}

Selected Kernels:
${kernelsText}

INSTRUCTIONS:
- Each kernel becomes exactly 1 final joke paragraph.
- Keep jokes punchy; primary punch must be last sentence.
- No narrative glue.
- Keep 1-3 sentences per joke.
- Output jokes only, separated by blank lines.`;
}

