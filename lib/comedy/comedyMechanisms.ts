/**
 * Comedy Mechanism Library
 * 
 * Defines the 12 core comedy mechanisms used for kernel generation.
 * These mechanisms represent distinct comedic techniques that can be
 * applied to generate diverse joke kernels.
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

