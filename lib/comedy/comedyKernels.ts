/**
 * Kernel Data Model
 * 
 * Types and interfaces for joke kernels, the raw joke ideas
 * that are generated, scored, and then rendered through voice contracts.
 */

import { ComedyMechanism } from './comedyMechanisms';

export type ComedicStance =
  | 'annoyed'
  | 'anxious'
  | 'smug'
  | 'delighted'
  | 'confused'
  | 'self_deprecating'
  | 'impatient'
  | 'overconfident'
  | 'paranoid'
  | 'earnest'
  | 'skeptical';

export interface JokeKernel {
  id: string; // uuid
  mechanism: ComedyMechanism;
  stance: ComedicStance;
  anchor: string; // concrete object/place/system/sensory detail (must be specific)
  signal: string; // EXACT words/request/text/phrase (3–10 words)
  misread: string; // WHAT IT GETS INTERPRETED AS (3–14 words)
  consequence: string; // FORCED outcome/reversal (3–14 words)
  setup: string; // 8–18 words; MUST include the signal verbatim in quotes
  punch: string; // 4–14 words; MUST express consequence or reversal (terminal)
  tags?: string[]; // optional (topic-related)
  notes?: string; // optional internal note
  risk?: 'low' | 'med' | 'high'; // optional
}

export interface KernelBatch {
  topic: string;
  requestedCount: number;
  kernels: JokeKernel[];
}

export interface ScoredKernel {
  kernel: JokeKernel;
  score: number;
  reasons: string[];
}

