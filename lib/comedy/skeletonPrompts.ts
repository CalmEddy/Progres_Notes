/**
 * Prompt Templates for Skeleton Generation and Rendering
 */

import { COMEDY_MECHANISMS, COMEDY_MECHANISM_RULES } from './comedyMechanisms';

export const SKELETON_GENERATOR_SYSTEM_PROMPT = `You are generating mechanism-first joke skeletons (NOT final jokes). Return ONLY valid JSON that matches this schema exactly:

{
  "topic": string,
  "requestedCount": number,
  "candidates": [
    {
      "id": string,
      "mechanism": string,
      "anchor": string,
      "assumption": string,
      "turn": string,
      "punch": string,
      "setupLine": string,
      "punchLine": string,
      "tags": [string]
    }
  ]
}

MECHANISM RULES (minimal operational):
${COMEDY_MECHANISM_RULES.map(rule => `- ${rule.id}: ${rule.setupRule} ${rule.punchRule}`).join('\n')}

RULES (NON-NEGOTIABLE):
1) Output JSON only. No markdown. No backticks. No commentary.
2) Create 36 skeletons total: exactly 3 per mechanism from the provided list.
3) Each skeleton must include a real joke turn (assumption -> turn -> punch).
4) assumption / turn / punch: each 14 words or fewer.
5) setupLine: 6–16 words.
6) punchLine: 3–14 words, MUST equal or closely match punch.
7) Anchor must be concrete and specific (object/place/system/sensory detail). Do not use "thing/stuff/people".
8) STRICT BAN in punchLine (automatic invalid):
   - rhetorical questions (punchLine ending with '?')
   - "who knew", "apparently", "turns out", "at this point", "looks like", "pretty sure", "I didn't know"
   - explanation phrases: "which means", "that means", "so basically", "in other words"
9) STRICT BAN in setupLine:
   - "the other day", "last week", "so there I am", "meanwhile", "you ever notice"
10) NO RANDOM SURREALISM:
   - Do not anthropomorphize objects or insert whimsical imagery unless required by UNEXPECTED_RULE_SYSTEM.
11) Mechanism list (use exactly these values for "mechanism"):
${COMEDY_MECHANISMS.map(m => `   - ${m}`).join('\n')}
12) Each skeleton must be a distinct angle; do not repeat the same scenario with new wording.

QUALITY REQUIREMENT:
- If the punch could be removed without collapsing the joke, the skeleton is invalid.
- If the punch does not contradict, escalate, or reframe the assumption, the skeleton is invalid.

Return exactly 36 skeletons in one JSON object.`;

export function buildSkeletonGeneratorUserMessage(
  topic: string,
  requestedCount: number,
  clean: boolean = true
): string {
  return `Generate joke skeletons for the topic: "${topic}"

Requested final joke count: ${requestedCount}
Clean humor: ${clean ? 'YES' : 'NO'}

Generate exactly 36 skeletons total (3 per mechanism).

Return ONLY valid JSON matching the SkeletonBatch schema. No markdown, no prose, no code blocks.
CRITICAL: Use ASCII straight double quotes (") only. No trailing commas. Valid JSON syntax only.`;
}

export function buildRendererUserMessage(
  topic: string,
  jokeCount: number,
  skeletons: Array<{
    id: string;
    mechanism: string;
    anchor: string;
    assumption: string;
    turn: string;
    punch: string;
    setupLine: string;
    punchLine: string;
  }>,
  clean: boolean = true
): string {
  const skeletonsText = skeletons
    .map(
      (s, i) => `Skeleton ${i + 1}:
- Mechanism: ${s.mechanism}
- Anchor: ${s.anchor}
- Assumption: ${s.assumption}
- Turn: ${s.turn}
- Punch: ${s.punch}
- SetupLine: ${s.setupLine}
- PunchLine: ${s.punchLine}`
    )
    .join('\n\n');

  return `Topic: ${topic}
Joke count: ${jokeCount}
Clean: ${clean ? 'YES' : 'NO'}

Selected Skeletons:
${skeletonsText}

INSTRUCTIONS:
- Rewrite for phrasing, rhythm, and tone ONLY.
- Preserve assumption → turn → punch exactly.
- punchLine MUST be the final sentence.
- No added commentary after the punch.
- No narrative filler.
- Prefer 1–2 sentences; 3 max.
- Output jokes only, separated by blank lines.`;
}
