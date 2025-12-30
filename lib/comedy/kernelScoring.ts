/**
 * Kernel Scoring and Selection
 * 
 * Scores and filters joke kernels using deterministic heuristics
 * to remove weak jokes and select the best diverse set.
 */

import { KernelBatch, JokeKernel, ScoredKernel } from './comedyKernels';
import { ComedyMechanism } from './comedyMechanisms';

// Generic words that indicate vague anchors
const GENERIC_ANCHOR_WORDS = new Set([
  'stuff',
  'things',
  'people',
  'someone',
  'somebody',
  'something',
  'anything',
  'everything',
  'nothing',
  'everyone',
  'anyone',
  'nobody',
]);

// Patterns that indicate weak endings
const RHETORICAL_PATTERNS = [
  /who knew/i,
  /apparently/i,
  /turns out/i,
  /at this point/i,
  /it's like/i,
  /kind of/i,
  /sort of/i,
];

const EXPLANATORY_PATTERNS = [
  /which means/i,
  /that means/i,
  /so basically/i,
  /in other words/i,
  /what i mean is/i,
  /the point is/i,
];

const NARRATIVE_GLUE_PATTERNS = [
  /last week/i,
  /so there i am/i,
  /the other day/i,
  /yesterday/i,
  /earlier today/i,
  /just now/i,
];

/**
 * Calculate Jaccard similarity between two strings (word-based)
 */
export function calculateStringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = new Set(
    (a || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0)
  );
  const wordsB = new Set(
    (b || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0)
  );

  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Check if a string contains any of the given patterns
 */
function matchesPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

/**
 * Check if anchor is specific (not generic)
 */
function isSpecificAnchor(anchor: string): boolean {
  if (!anchor || anchor.trim().length === 0) return false;
  if (anchor.length <= 6) return false;

  const anchorLower = anchor.toLowerCase();
  const words = anchorLower.split(/\s+/);
  
  // Check if all words are generic
  if (words.every(word => GENERIC_ANCHOR_WORDS.has(word))) {
    return false;
  }

  return true;
}

/**
 * Check if punch introduces concrete consequence
 */
function hasConcreteConsequence(punch: string): boolean {
  if (!punch) return false;
  const consequenceMarkers = [
    'so now',
    'which means',
    'and now',
    'now i',
    'now you',
    'now we',
    'now they',
  ];

  const punchLower = punch.toLowerCase();
  return consequenceMarkers.some(marker => punchLower.includes(marker));
}

/**
 * Extract concrete nouns from text (simple heuristic)
 */
function extractConcreteNouns(text: string): Set<string> {
  if (!text) return new Set();
  // Simple heuristic: words that are likely nouns (capitalized or common nouns)
  const words = (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !GENERIC_ANCHOR_WORDS.has(w));

  return new Set(words);
}

/**
 * Score a single kernel
 */
function scoreKernel(kernel: JokeKernel): ScoredKernel | null {
  const reasons: string[] = [];
  let score = 0;

  // Validate required fields exist
  if (!kernel || !kernel.setup || !kernel.punch || !kernel.anchor) {
    return null; // Missing required fields
  }

  // Hard filters - reject immediately
  if (!kernel.punch || kernel.punch.trim().length === 0) {
    return null; // Missing punch
  }
  
  if (!kernel.setup || kernel.setup.trim().length === 0) {
    return null; // Missing setup
  }
  
  if (!kernel.anchor || kernel.anchor.trim().length === 0) {
    return null; // Missing anchor
  }

  // Check if punch is too similar to setup
  const similarity = calculateStringSimilarity(kernel.setup, kernel.punch);
  if (similarity > 0.85) {
    return null; // Too similar
  }

  // Check for rhetorical question endings
  if (kernel.punch.trim().endsWith('?')) {
    return null; // Rhetorical question
  }

  if (matchesPattern(kernel.punch, RHETORICAL_PATTERNS)) {
    return null; // Rhetorical pattern
  }

  // Check for explanatory endings
  if (matchesPattern(kernel.punch, EXPLANATORY_PATTERNS)) {
    return null; // Explanatory ending
  }

  // Check for narrative glue in setup
  if (matchesPattern(kernel.setup, NARRATIVE_GLUE_PATTERNS)) {
    return null; // Narrative glue
  }

  // Check for vague anchor
  if (!isSpecificAnchor(kernel.anchor)) {
    return null; // Vague anchor
  }

  // Soft scoring
  if (hasConcreteConsequence(kernel.punch)) {
    score += 20;
    reasons.push('concrete consequence');
  }

  const setupNouns = extractConcreteNouns(kernel.setup);
  const punchNouns = extractConcreteNouns(kernel.punch);
  const novelNouns = [...punchNouns].filter(noun => !setupNouns.has(noun));
  if (novelNouns.length > 0) {
    score += 15;
    reasons.push('novel concrete noun');
  }

  const setupWords = kernel.setup.split(/\s+/).length;
  const punchWords = kernel.punch.split(/\s+/).length;
  if (punchWords < setupWords) {
    score += 10;
    reasons.push('punch shorter than setup');
  }

  if (isSpecificAnchor(kernel.anchor)) {
    score += 10;
    reasons.push('specific anchor');
  }

  // Penalties
  if (setupWords > 20) {
    score -= 10;
    reasons.push('setup too long');
  }

  if (punchWords > 18) {
    score -= 15;
    reasons.push('punch too long');
  }

  // Check for analogy-only structure
  if (kernel.punch && /like (a|an|the) /.test(kernel.punch.toLowerCase())) {
    if (kernel.mechanism !== 'CONTRAST_COLLISION') {
      score -= 20;
      reasons.push('analogy-only structure');
    }
  }

  // Ensure score is non-negative
  score = Math.max(0, score);

  return {
    kernel,
    score,
    reasons,
  };
}

/**
 * Score all kernels in a batch
 */
export function scoreKernels(batch: KernelBatch): ScoredKernel[] {
  const scored: ScoredKernel[] = [];

  for (const kernel of batch.kernels) {
    const scoredKernel = scoreKernel(kernel);
    if (scoredKernel) {
      scored.push(scoredKernel);
    }
  }

  return scored;
}

/**
 * Select the best kernels with mechanism diversity
 */
export function selectBestKernels(
  scored: ScoredKernel[],
  count: number
): JokeKernel[] {
  // Sort by score (descending)
  const sorted = [...scored].sort((a, b) => b.score - a.score);

  const selected: JokeKernel[] = [];
  const usedMechanisms = new Set<ComedyMechanism>();
  const usedTexts = new Set<string>(); // For deduplication

  // First pass: one kernel per mechanism
  for (const scoredKernel of sorted) {
    if (selected.length >= count) break;

    const { kernel } = scoredKernel;
    const normalizedText = `${kernel.setup || ''} ${kernel.punch || ''}`.toLowerCase().trim();
    
    // Skip if too similar to already selected
    let isDuplicate = false;
    for (const usedText of usedTexts) {
      if (calculateStringSimilarity(normalizedText, usedText) > 0.85) {
        isDuplicate = true;
        break;
      }
    }

    if (isDuplicate) continue;

    if (!usedMechanisms.has(kernel.mechanism)) {
      selected.push(kernel);
      usedMechanisms.add(kernel.mechanism);
      usedTexts.add(normalizedText);
    }
  }

  // Second pass: fill remaining slots, avoiding back-to-back mechanism repeats
  let lastMechanism: ComedyMechanism | null = null;
  for (const scoredKernel of sorted) {
    if (selected.length >= count) break;

    const { kernel } = scoredKernel;
    const normalizedText = `${kernel.setup || ''} ${kernel.punch || ''}`.toLowerCase().trim();
    
    // Skip if already selected
    if (selected.some(k => k.id === kernel.id)) continue;

    // Skip if too similar
    let isDuplicate = false;
    for (const usedText of usedTexts) {
      if (calculateStringSimilarity(normalizedText, usedText) > 0.85) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) continue;

    // Avoid back-to-back mechanism repeats
    if (lastMechanism && kernel.mechanism === lastMechanism) {
      continue;
    }

    selected.push(kernel);
    lastMechanism = kernel.mechanism;
    usedTexts.add(normalizedText);
  }

  return selected;
}

