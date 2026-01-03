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
      tagging: 'light-to-moderate',
    },
  },

  obsessive_precision_ranter: {
    styleId: 'obsessive_precision_ranter',
    reference: 'gary_gulman_adjacent',
    voiceDescription:
      'Obsessive precision, exhaustive detail, methodical escalation. The narrator meticulously deconstructs everyday frustrations through exhaustive examination, building to a cathartic release through sheer accumulation of specifics.',
    diction: 'precise, specific, deliberately detailed',
    rhythm: 'measured, building cadence that accelerates through accumulation',
    energy: 'intense focus, building frustration, cathartic release',
    languageConstraints: [
      'Include exhaustive, specific details that build tension.',
      'Use precise language that shows deep observation.',
      'Build through accumulation of specifics rather than emotional escalation.',
      'Allow the specificity itself to create the impact.',
      'Prefer methodical deconstruction over quick punchlines.',
    ],
    structuralBehavior: {
      multiLine: 'allowed',
      tagging: 'moderate',
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

