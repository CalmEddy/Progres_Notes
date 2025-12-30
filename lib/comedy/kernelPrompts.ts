/**
 * Prompt Templates for Kernel Generation and Rendering
 */

import { COMEDY_MECHANISMS } from './comedyMechanisms';

export const KERNEL_GENERATOR_SYSTEM_PROMPT = `You are generating joke kernels (NOT final jokes). Return ONLY valid JSON that matches this schema exactly:

{
  "topic": string,
  "requestedCount": number,
  "kernels": [
    {
      "id": string,
      "mechanism": string,
      "stance": string,
      "anchor": string,
      "signal": string,
      "misread": string,
      "consequence": string,
      "setup": string,
      "punch": string,
      "tags": [string]
    }
  ]
}

RULES (NON-NEGOTIABLE):
1) Output JSON only. No markdown. No backticks. No commentary.
2) Create 36 kernels total: exactly 3 kernels for each mechanism from the provided mechanism list (12 mechanisms × 3 = 36).
3) Every kernel MUST follow SIGNAL → MISREAD → CONSEQUENCE/REVERSAL:
   - signal: the exact phrase/request/text (3–10 words)
   - misread: how it is interpreted differently (3–14 words)
   - consequence: the forced outcome/reversal caused by the misread (3–14 words)
4) setup must be 8–18 words and MUST include the signal verbatim inside quotation marks.
5) punch must be 4–14 words, MUST express the consequence or reversal, and MUST be a terminal punch (no follow-up thought).
6) Anchor must be concrete and specific (object/place/system/sensory detail). Do not use "stuff/things/people" as anchors.
7) STRICT BAN: These are NOT allowed in punch (automatic invalid kernel):
   - rhetorical questions (punch ending with '?')
   - "who knew", "apparently", "turns out", "at this point", "it's like", "kind of", "pretty sure", "looks like", "I didn't know"
   - explanation phrases: "which means", "that means", "so basically", "in other words"
   - analogies as the entire punch ("It's like …") unless the punch is a sharp reversal AND still fits 4–14 words (generally avoid)
8) STRICT BAN: Narrative filler in setup:
   - "so there I am", "last week", "the other day", "meanwhile", "at this point", "you ever notice"
9) NO RANDOM SURREALISM:
   - Do not invent whimsical images (e.g., pillows forming alliances) unless the mechanism explicitly requires an invented rule/system AND the signal logically triggers it.
   - Do not swap in random objects (e.g., "brick instead of mug") unless the signal literally implies the swap (true literalism) and the connection is obvious without explanation.
10) Mechanism list (use exactly these values for "mechanism"):
${COMEDY_MECHANISMS.map((m, i) => `   - ${m}`).join('\n')}
11) stance must be one of:
   - annoyed, anxious, smug, delighted, confused, self_deprecating, impatient, overconfident, paranoid, earnest, skeptical
12) Each kernel must be a DISTINCT angle. Do not repeat the same scenario with different wording.
13) Tags are optional but if included keep to 0–3 short topic-relevant tags.

QUALITY REQUIREMENT:
- The punch must introduce NEW consequence/reversal/outcome not already implied by the setup.
- If the kernel could work without the misread, it is invalid.

Return exactly 36 kernels in one JSON object.`;

export function buildKernelGeneratorUserMessage(
  topic: string,
  requestedCount: number,
  clean: boolean = true
): string {
  return `Generate joke kernels for the topic: "${topic}"

Requested final joke count: ${requestedCount}
Clean humor: ${clean ? 'YES' : 'NO'}

Generate exactly 36 kernels total (3 kernels per mechanism).

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
    signal: string;
    misread: string;
    consequence: string;
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
- Signal: ${k.signal}
- Misread: ${k.misread}
- Consequence: ${k.consequence}
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

