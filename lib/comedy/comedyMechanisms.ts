/**
 * Comedy Mechanism Library
 *
 * Defines the 12 core comedy mechanisms used for skeleton generation.
 * Each mechanism includes minimal operational rules to enforce punch validity.
 */

export const COMEDY_MECHANISMS = [
  'MISDIRECTION_REVERSAL',
  'LITERALISM',
  'RULE_OF_THREE',
  'ESCALATION_LADDER',
  'OVERCOMMITMENT',
  'FAULTY_LOGIC',
  'STATUS_FLIP',
  'UNEXPECTED_RULE_SYSTEM',
  'SPECIFICITY_SWAP',
  'REDUCTIO',
  'CATEGORY_ERROR',
  'CONTRAST_COLLISION',
] as const;

export type ComedyMechanism = typeof COMEDY_MECHANISMS[number];

export type ComedyMechanismRule = {
  id: ComedyMechanism;
  setupRule: string;
  punchRule: string;
};

export const COMEDY_MECHANISM_RULES: ComedyMechanismRule[] = [
  {
    id: 'MISDIRECTION_REVERSAL',
    setupRule: 'Lead audience to assume outcome A.',
    punchRule: 'Punch must contradict or flip that assumption.',
  },
  {
    id: 'LITERALISM',
    setupRule: 'Use a phrase that implies non-literal meaning.',
    punchRule: 'Punch applies the literal meaning directly.',
  },
  {
    id: 'RULE_OF_THREE',
    setupRule: 'Establish two parallel beats.',
    punchRule: 'Punch is a distinct third beat.',
  },
  {
    id: 'ESCALATION_LADDER',
    setupRule: 'Begin with a small, clear action.',
    punchRule: 'Punch escalates to an absurdly higher rung.',
  },
  {
    id: 'OVERCOMMITMENT',
    setupRule: 'Introduce a minor requirement or choice.',
    punchRule: 'Punch shows extreme commitment to it.',
  },
  {
    id: 'FAULTY_LOGIC',
    setupRule: 'Set up a reasonable premise.',
    punchRule: 'Punch draws an illogical but “logical” conclusion.',
  },
  {
    id: 'STATUS_FLIP',
    setupRule: 'Establish a normal power or competence order.',
    punchRule: 'Punch reverses that order.',
  },
  {
    id: 'UNEXPECTED_RULE_SYSTEM',
    setupRule: 'Introduce a normal situation or request.',
    punchRule: 'Punch reveals a bogus rule triggered by it.',
  },
  {
    id: 'SPECIFICITY_SWAP',
    setupRule: 'Start with a vague or generic expectation.',
    punchRule: 'Punch swaps in overly specific detail.',
  },
  {
    id: 'REDUCTIO',
    setupRule: 'Start from a reasonable rule or belief.',
    punchRule: 'Punch takes it to an absurd extreme.',
  },
  {
    id: 'CATEGORY_ERROR',
    setupRule: 'Frame something in the wrong category.',
    punchRule: 'Punch treats it according to that wrong category.',
  },
  {
    id: 'CONTRAST_COLLISION',
    setupRule: 'Place two incompatible ideas together.',
    punchRule: 'Punch highlights the collision.',
  },
];
