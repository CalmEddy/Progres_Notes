/**
 * Joke Skeleton Data Model
 *
 * Skeletons encode mechanism-first structure only (no stance or mood).
 */

import { ComedyMechanism } from './comedyMechanisms';

export interface JokeSkeleton {
  id: string; // uuid
  mechanism: ComedyMechanism;
  anchor: string; // specific concrete object/place/system/sensory detail

  // Core mechanism structure
  assumption: string; // what the audience initially believes
  turn: string; // how that assumption is broken/reframed
  punch: string; // the final punchline (terminal)

  // Optional mechanism-dependent helpers only
  signal?: string;
  misread?: string;
  consequence?: string;

  // Language scaffolding
  setupLine: string; // short spoken setup
  punchLine: string; // must equal or closely match punch

  tags?: string[];
}

export interface SkeletonBatch {
  topic: string;
  requestedCount: number;
  candidates: JokeSkeleton[];
}

export interface ScoredSkeleton {
  skeleton: JokeSkeleton;
  score: number;
  reasons: string[];
}
