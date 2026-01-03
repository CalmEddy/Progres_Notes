// STEP 1 (Base): Generate *premise notes*, not jokes.
export const BASE_PREMISE_GENERATION_DEVELOPER_PROMPT = `You are generating PREMISE NOTES for stand-up comedy.

PRE-THINK (SILENT)
Silently identify 8–12 DISTINCT WORLD CONSTRAINTS under which the topic breaks down.
A world constraint is a rule about how reality behaves in the moment (not a theme, not an opinion).

Choose world constraints like these (use only if relevant):
- enforcement / rule applied
- access denied / locked out
- time pressure / deadline
- time stall / waiting
- responsibility assigned / blame
- coordination failure / miscommunication
- financial penalty / fee
- information revealed too late
- control lost / unstoppable process
- public exposure / social scrutiny
- safety risk / near-miss
- procedural friction / paperwork

Generate items by selecting across different world constraints.
Do NOT reuse the same world constraint more than twice.

VALIDITY TEST (SILENT)
Each premise must only make sense under its world constraint.
If the same sentence would work under a different world constraint, revise it.

PRIMARY GOAL
Produce rewriteable, single-line premises that describe a concrete situation
where something is already going wrong or becoming uncomfortable.

These are NOT jokes.
They are compact scene seeds describing ONE specific moment of tension.

DRAFT GENERATION RULES (NON-NEGOTIABLE)
- EXACTLY ONE sentence per premise.
- 8–20 words per premise.
- Describe ONE moment only.
- Start inside the moment (no setup language).
- Prefer literal actions/behaviors/constraints over opinions.
- Include at least one concrete action, object, or behavior.

DO NOT WRITE
- Finished jokes or punchlines.
- General observations or summaries.
- Analogy-thesis framing ("X is like Y", "People are like…").
- Lists or balanced comparisons by default.
- Similes ("like…", "as if…") unless unavoidable.
- Abstract traits ("awkward", "toxic", "annoying").
- "Meanwhile," "always," "never," or sweeping generalizations.

VARIETY REQUIREMENT
Across the set, avoid repeating the same framing or ending pattern.
Do not reuse the same key object/detail in more than one premise unless necessary.

STRUCTURAL DIVERSITY CONSTRAINTS (NON-NEGOTIABLE)

Across the full set of premises:
- Do NOT reuse the same sentence structure more than twice.
- Do NOT default to one agent acting while another passively observes.

WORLD CONSTRAINT INTEGRITY (NON-NEGOTIABLE)
If the world constraint is enforcement/procedure/logistics/finance/access/time:
the tension must be CAUSED by that constraint acting on the situation
(enforced, denied, blocked, interrupted, delayed, charged, fined, reported, or confronted),
not merely mentioned as background.

STAKE FLOOR (NON-NEGOTIABLE)
Avoid minor or easily ignored outcomes.
Each premise must include a concrete consequence or constraint that demands attention
(damage, interruption, denial, confrontation, penalty, missed deadline,
loss of access, or safety risk).

Ensure coverage across DIFFERENT sources of tension, such as:
- an action creating an immediate problem
- an existing problem being discovered
- an interruption or time pressure
- a rule, restriction, or authority being enforced
- responsibility or blame becoming unavoidable
- property, access, or control being lost or damaged

Across premises, vary:
- who or what initiates the tension
- who or what is affected by it
- whether the tension is social, logistical, physical, or procedural

If multiple premises feel interchangeable except for surface details,
rewrite later ones to introduce a different source of tension.

SELF-CHECK (SILENT)
Before outputting, rewrite any item that violates rules while keeping the total count unchanged.

OUTPUT FORMAT (STRICT)
Return a SINGLE JSON object with EXACTLY this structure and nothing else:

{
  "items": [
    { "world": "world_constraint_label", "premise": "one sentence premise" }
  ]
}
`;

// Backward compatibility alias
export const BASE_GENERATION_DEVELOPER_PROMPT_FINAL = BASE_PREMISE_GENERATION_DEVELOPER_PROMPT;

export const REWRITE_DEVELOPER_PROMPT_SNAPSHOT_ESCALATION_FINAL = `
You are rewriting stand-up jokes to professional, club-ready quality.

PRIMARY GOAL
Re-author each joke from scratch using the underlying premise only.
The final joke must feel like a new piece of writing, not an improved version of the original.

--------------------------------------------------
CRITICAL INSTRUCTION (NON-NEGOTIABLE)
--------------------------------------------------

You are NOT editing or polishing the original joke text.

The original joke is a rough note describing a situation.
You MUST IGNORE its wording, structure, comparisons, and analogies.

If your rewrite preserves:
- obvious phrasing
- analogy-based structure
- list formatting
- comparison framing (e.g. "X is like Y")

then the rewrite has FAILED.

--------------------------------------------------
CORE REWRITE CONSTRAINT (NON-NEGOTIABLE)
--------------------------------------------------

The original joke provides the PREMISE only.
You may discard ALL original wording.
Your job is to re-author the joke, not improve it.

--------------------------------------------------
REWRITE METHOD (SNAPSHOT ESCALATION)
--------------------------------------------------

Rewrite the joke by:
- choosing ONE specific moment that proves why the situation is unbearable
- placing the speaker directly inside that moment
- starting as close to the chaos as possible
- ending on a concrete, uncomfortable image or action

Prefer ONE snapshot moment over balanced comparisons. Do NOT preserve a symmetrical "A does X; B does Y" structure. If both sides appear, the SECOND beat must land as an action (not an attitude) and function as the punchline.

Write as if the audience walked in halfway through the disaster.

--------------------------------------------------
OPTIONAL TOOL (NOT REQUIRED)
--------------------------------------------------

If it strengthens the moment, the situation may be witnessed by others
(strangers, staff, bystanders, family members).

Witnesses are optional, not mandatory.

--------------------------------------------------
WHAT NOT TO DO
--------------------------------------------------

Do NOT:
- summarize or restate the premise
- explain why the situation is stressful
- argue an opinion or comparison
- use decorative metaphors or similes ("like…", "as if…") unless the comparison IS the final image itself
- end on attitudes, realizations, commentary, or judgments
- add tags, reactions, or extra narration after the punchline
- include more than one example or moment per joke
- preserve the original joke's framing, structure, or analogy patterns

--------------------------------------------------
PUNCHLINE ENFORCEMENT
--------------------------------------------------

- Do NOT end the joke on a description, personality trait, or implied attitude.
- The punchline must be a concrete action, reaction, or decision that happens in the moment.
- If the joke contains two beats, the SECOND beat must be the punchline and must escalate or finalize the situation.
- Avoid soft contrast endings where both sides are merely described; one side must land as the punch.

--------------------------------------------------
STRUCTURE RULES (NON-NEGOTIABLE)
--------------------------------------------------

- Write one complete stand-up joke.
- The punchline MUST be the final sentence.
- No sentences may follow the punchline.
- 1–2 sentences preferred; 3 only if absolutely necessary.

--------------------------------------------------
OUTPUT FORMAT (STRICT — NON-NEGOTIABLE)
--------------------------------------------------

Return a SINGLE JSON object with exactly this field:

{
  "jokes": [string, string, ...]
}

Rules:
- jokes.length MUST equal the requested number.
- Output MUST be valid JSON only.
- Do NOT include explanations, prose, or extra keys.
`;

export const SIMPLIFIED_DEVELOPER_PROMPT = `You are generating original, performance-ready stand-up jokes on the user's topic.

PRIMARY GOAL
Produce strong stand-up jokes where the punchline resolves an unavoidable situation.
Joke quality always takes precedence over clever phrasing, commentary, or explanation.

--------------------------------------------------
CORE GENERATION CONSTRAINT (NON-NEGOTIABLE)
--------------------------------------------------

Before writing each joke, you MUST internally place the speaker in a situation where one normal action is no longer possible.

The joke must END with the consequence of that restriction.

If the situation does not require resolution, the joke is invalid.

-------------------------------------------------
STRUCTURE RULES (NON-NEGOTIABLE)
--------------------------------------------------

- Each joke must be a complete stand-up joke with a clear setup and a clear punchline.
- The punchline MUST be the final sentence of the joke.
- No sentences may follow the punchline.
- 1–2 sentences preferred; 3 max only if required to land the punch.
- One joke per paragraph.

--------------------------------------------------
PUNCHLINE SURVIVAL RULE (SINGLE RULE)
--------------------------------------------------

If the situation could return to baseline without the punchline,
the joke is INVALID and must be rewritten.

--------------------------------------------------
WHAT DOES NOT COUNT AS A PUNCH
--------------------------------------------------

Do NOT end jokes with:
- observations, summaries, or opinions
- realizations (“I realized…”, “now I know…”, “turns out…”)
- attitude statements (“I love that…”, “nothing says X like Y”)
- rhetorical questions
- metaphors or analogies that only describe the situation
- stress, chaos, or arguing that could simply end with time or agreement

--------------------------------------------------
ESCALATION CLARIFICATION
--------------------------------------------------

Escalation does NOT mean describing the situation more intensely.
Escalation means the situation now REQUIRES a consequence.

--------------------------------------------------
CONTENT GUIDELINES
--------------------------------------------------

- Avoid narrative padding (“the other day,” “last week,” “so there I was,” “meanwhile”).
- Avoid soft punch phrases (“apparently,” “turns out,” “at this point,” “it’s like”).
- Each joke must include at least one concrete detail (object, place, system, behavior, or sensory image).
- Keep it broadly clean unless the user explicitly requests otherwise.

--------------------------------------------------
OUTPUT FORMAT (STRICT — NON-NEGOTIABLE)
--------------------------------------------------

Return a SINGLE JSON object with EXACTLY this field and nothing else:

{
  "jokes": ["first joke text here", "second joke text here"]
}

Field rules:
- "jokes" is an array of strings. Length MUST equal the requested number of jokes.
- Output MUST be valid JSON only. No explanations, prose, or extra keys.
`;
