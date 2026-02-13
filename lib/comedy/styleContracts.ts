/**
 * Style Contracts for Re-authoring Observational Material
 * 
 * Style contracts define expression constraints (diction, rhythm, energy, etc.)
 * for re-authoring collision notes. They do NOT contain analysis verbs.
 */

export interface StyleContract {
  styleId: string;
  reference: string;
  voiceDescription: string;
  diction: string;
  rhythm: string;
  energy: string;
  languageConstraints: string[];
  structuralBehavior: {
    multiLine: 'allowed' | 'discouraged' | 'forbidden';
    tagging: 'light' | 'moderate' | 'heavy' | 'none';
  };
}

export const STYLE_CONTRACTS: Record<string, StyleContract> = {
  warm_physical_storyteller: {
    styleId: 'warm_physical_storyteller',
    reference: 'ken_davis_adjacent',
    voiceDescription:
      'Warm, expressive, physical storytelling. Relatable, wholesome, high-energy narrator who sees everyday life as a series of perfectly timed mishaps. The narrator tries to do the right thing and keeps getting outmaneuvered by life.',
    diction: 'plain, conversational, accessible',
    rhythm: 'medium spoken cadence, frequent punch beats, quick switches between narration and acted dialogue',
    energy: 'earnest, animated, good-natured, enthusiastic',
    languageConstraints: [
      'Use language that sounds spoken aloud.',
      'Favor physical actions, posture, and visible behavior.',
      'Let escalation come from accumulating details.',
      'Include specific sensory details (places, objects, sounds).',
      'Prefer act-outs and physical comedy described in words.',
    ],
    structuralBehavior: {
      multiLine: 'allowed',
      tagging: 'moderate',
    },
  },

  obsessive_precision_ranter: {
    styleId: 'obsessive_precision_ranter',
    reference: 'gary_gulman_adjacent',
  
    voiceDescription:
      'Obsessive precision and fixation. The narrator selects a single irritation and relentlessly tightens focus on it, escalating by refining rules, standards, and consequences rather than introducing new scenes, settings, or ideas.',
  
    diction:
      'Highly precise, specific, and exacting. Prefers concrete nouns, measurements, classifications, and procedural language over metaphor or emotion.',
  
    rhythm:
      'Measured cadence that narrows with each beat, repeatedly returning to the same object, rule, or process while increasing specificity and logical pressure.',
  
    energy:
      'Intense focus with controlled agitation that escalates through accumulation of constraints rather than emotional outbursts.',
  
    languageConstraints: [
      'Fixate on a single object, process, or rule per bit.',
      'Do not introduce new locations, scenes, or thematic ideas once fixation is established.',
      'Each sentence must further constrain, qualify, or tighten the same central irritation.',
      'Escalation must occur through increasingly narrow definitions, edge cases, or procedural implications.',
      'Do not escalate through atmosphere, imagery, or emotional reflection.',
      'Use metaphors sparingly and only to clarify a rule or standard.',
      'Do not stack, rotate, or escalate metaphors.',
      'Avoid reflective or narrative storytelling tones.',
      'Prefer methodical deconstruction over expressive description.',
    ],
  
    structuralBehavior: {
      multiLine: 'allowed',
      tagging: 'moderate',
    },
  },
  
  cold_minimalist_observer: {
    styleId: 'cold_minimalist_observer',
    reference: 'deadpan_minimalism_adjacent',
    voiceDescription:
      'Detached, restrained observer who does not perform or emote. The speaker reports what is happening without warmth, enthusiasm, or visible reaction. The humor emerges from understatement, distance, and what is left unsaid.',
    diction: 'spare, precise, restrained',
    rhythm: 'short sentences, flat cadence, minimal variation',
    energy: 'low, neutral, emotionally withheld',
    languageConstraints: [
      'Avoid expressive or enthusiastic language.',
      'Avoid physical act-outs or described gestures.',
      'State observations plainly without commentary.',
      'Let implication replace explanation.',
      'Prefer silence and restraint over escalation.'
    ],
    structuralBehavior: {
      multiLine: 'discouraged',
      tagging: 'none'
    },
  },

  hyper_logical_literalist: {
    styleId: 'hyper_logical_literalist',
    reference: 'Hyper-Logical Literalist',
    voiceDescription:
      'A calm, literal speaker who treats language as an exact system of rules and follows wording to its logical conclusion without interpreting intent or metaphor.',
    diction:
      'Plain, precise, and literal. Prefers concrete nouns and procedural verbs. Avoids figurative language and emotional adjectives unless explicitly present in the collision.',
    rhythm:
      'Methodical and step-by-step. Sentences often unfold as conditional statements or logical progressions. Pauses are implied through clean sentence breaks rather than dramatic emphasis.',
    energy:
      'Low and steady. Neutral delivery that remains consistent regardless of how impractical or absurd the conclusion becomes.',
    languageConstraints: [
      'Do not use metaphor or symbolic language',
      'Do not reinterpret wording based on intent or tone',
      'Do not add emotional reactions or judgments',
      'Treat all phrasing as intentional and binding',
      'Maintain a reasonable tone at every step',
    ],
  
    structuralBehavior: {
      multiLine: 'allowed',
      tagging: 'none',
    },
  },
  
  cheerfully_misguided_optimist: {
    styleId: 'cheerfully_misguided_optimist',
    reference: 'cheerfully_misguided_optimist',
    voiceDescription:
      'Bright, upbeat, sincerely encouraging voice that treats the collision as an obvious upgrade. The speaker stays positive and confident, reframing the flawed logic as a helpful improvement and acting as if the alternative is clearly inferior.',

    diction:
      'Sunny, supportive, simple wording. Uses upbeat verbs and positive labels (upgrade, win, bonus, perfect, great). Avoids harsh phrasing; uses friendly euphemisms while keeping concrete anchors intact.',

    rhythm:
      'Bouncy and affirmative with confident declarative openings. Builds by stacking upbeat reframes and “practical-sounding” encouragement. Avoids question-led transitions.',

    energy:
      'High, warm, enthusiastic, sincere. No sarcasm. No wink.',

    languageConstraints: [
      'Begin each bit with a confident declarative statement that asserts the collision as an improvement.',
      'Do not use rhetorical questions as the default transition device.',
      'Do not concede value to the alternative (avoid “while X is nice/has its charm”).',
      'Do not acknowledge drawbacks, danger, or awkwardness as problems.',
      'Reframe the collision as an improvement or solution with sincere encouragement.',
      'Preserve both anchors of the collision clearly; do not replace or abstract them.',
      'No cynicism, no snark, no “isn’t this ridiculous” commentary.',
      'Do not use concession structures that grant value to the alternative (avoid: “while X is nice”, “X has its place”, “can be lively”, “has its charm”).',
    ],

    structuralBehavior: {
      multiLine: 'allowed',
      tagging: 'light',
    },
  },
};
  

/**
 * Get default style contract (neutral/warm storyteller)
 */
export function getDefaultStyleContract(): StyleContract {
  return STYLE_CONTRACTS.warm_physical_storyteller;
}

/**
 * Get style contract by ID
 */
export function getStyleContract(styleId: string): StyleContract | null {
  return STYLE_CONTRACTS[styleId] || null;
}

