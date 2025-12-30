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
  anchor: string; // concrete object/place/system/sensory detail
  setup: string; // short setup line (spoken)
  punch: string; // short terminal punch line (must add consequence/reversal)
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

