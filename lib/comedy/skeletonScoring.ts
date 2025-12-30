/**
 * Skeleton Scoring and Selection
 *
 * Scores and filters joke skeletons using deterministic heuristics
 * to remove invalid jokes and select the best diverse set.
 */

import { ComedyMechanism } from './comedyMechanisms';
import { JokeSkeleton, ScoredSkeleton, SkeletonBatch } from './jokeSkeletons';

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
  'thing',
]);

const BANNED_PUNCH_PATTERNS = [
  /who knew/i,
  /apparently/i,
  /turns out/i,
  /at this point/i,
  /looks like/i,
  /pretty sure/i,
  /i didn['’]t know/i,
];

const EXPLANATORY_PATTERNS = [
  /which means/i,
  /that means/i,
  /so basically/i,
  /in other words/i,
];

const NARRATIVE_GLUE_PATTERNS = [
  /last week/i,
  /so there i am/i,
  /the other day/i,
  /meanwhile/i,
  /you ever notice/i,
];

const LOGIC_MARKERS = [
  'therefore',
  'thus',
  'so',
  'by that logic',
  'logically',
  'hence',
];

const STATUS_TERMS = [
  'boss',
  'manager',
  'intern',
  'assistant',
  'employee',
  'customer',
  'parent',
  'kid',
  'teacher',
  'student',
  'landlord',
  'tenant',
  'officer',
  'judge',
  'coach',
  'principal',
];

const RULE_SYSTEM_TERMS = [
  'policy',
  'rule',
  'bylaw',
  'protocol',
  'terms',
  'fine',
  'fee',
  'permit',
  'points',
  'violation',
  'allowed',
  'not allowed',
  'ban',
  'approved',
  'form',
  'required',
];

const LITERAL_MARKERS = [
  'literally',
  'literal',
  'word for word',
  'by the letter',
  'actual',
  'real',
  'exact',
];

const PHYSICAL_VERBS = [
  'ate',
  'fed',
  'opened',
  'carried',
  'walked',
  'lifted',
  'took',
  'wore',
  'drove',
  'washed',
  'filled',
  'poured',
  'paid',
  'signed',
  'filed',
  'shelved',
  'wrapped',
  'held',
  'dragged',
  'folded',
  'brought',
];

const CONTRAST_MARKERS = [
  'but',
  'instead',
  'except',
  'rather',
  'actually',
  'not',
  'never',
  'no longer',
  'now',
];

function normalizeWords(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function calculateStringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const wordsA = new Set(normalizeWords(a));
  const wordsB = new Set(normalizeWords(b));

  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

function matchesPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

function isSpecificAnchor(anchor: string): boolean {
  if (!anchor || anchor.trim().length === 0) return false;
  if (anchor.length <= 6) return false;

  const words = normalizeWords(anchor);
  if (words.length === 0) return false;
  if (words.every(word => GENERIC_ANCHOR_WORDS.has(word))) {
    return false;
  }

  return true;
}

function hasAnyTerm(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some(term => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
    return pattern.test(lower);
  });
}

function hasContrastMarker(text: string): boolean {
  return hasAnyTerm(text, CONTRAST_MARKERS);
}

function hasLogicMarker(text: string): boolean {
  return hasAnyTerm(text, LOGIC_MARKERS);
}

function hasStatusMarker(text: string): boolean {
  return hasAnyTerm(text, STATUS_TERMS);
}

function hasRuleSystemMarker(text: string): boolean {
  return hasAnyTerm(text, RULE_SYSTEM_TERMS);
}

function hasLiteralMarker(text: string): boolean {
  return hasAnyTerm(text, LITERAL_MARKERS);
}

function hasPhysicalVerb(text: string): boolean {
  return hasAnyTerm(text, PHYSICAL_VERBS);
}

function hasListMarker(text: string): boolean {
  return /,/.test(text) || /\band\b/.test(text.toLowerCase());
}

function introducesNovelWord(setupLine: string, punchLine: string): boolean {
  const setupWords = new Set(normalizeWords(setupLine));
  const punchWords = new Set(normalizeWords(punchLine));
  for (const word of punchWords) {
    if (!setupWords.has(word)) return true;
  }
  return false;
}

function mechanismValid(skeleton: JokeSkeleton): { valid: boolean; reason?: string } {
  const assumption = skeleton.assumption || '';
  const turn = skeleton.turn || '';
  const punch = skeleton.punch || skeleton.punchLine || '';
  const setupLine = skeleton.setupLine || '';

  switch (skeleton.mechanism) {
    case 'MISDIRECTION_REVERSAL': {
      const similarity = calculateStringSimilarity(assumption, punch);
      const hasFlip = hasContrastMarker(`${turn} ${punch}`);
      if (similarity > 0.65 || !hasFlip) {
        return { valid: false, reason: 'mechanism invalid: misdirection reversal' };
      }
      return { valid: true };
    }
    case 'LITERALISM': {
      const hasLiteral = hasLiteralMarker(`${turn} ${punch}`);
      const anchorWords = normalizeWords(skeleton.anchor || '');
      const anchorReferenced = anchorWords.some(word => punch.toLowerCase().includes(word));
      const hasAction = hasPhysicalVerb(punch);
      if (!(hasLiteral || (anchorReferenced && hasAction))) {
        return { valid: false, reason: 'mechanism invalid: literalism' };
      }
      return { valid: true };
    }
    case 'RULE_OF_THREE': {
      if (!hasListMarker(setupLine) || !introducesNovelWord(setupLine, punch)) {
        return { valid: false, reason: 'mechanism invalid: rule of three' };
      }
      return { valid: true };
    }
    case 'FAULTY_LOGIC':
    case 'REDUCTIO': {
      if (!hasLogicMarker(`${turn} ${punch}`)) {
        return { valid: false, reason: 'mechanism invalid: faulty logic/reductio' };
      }
      return { valid: true };
    }
    case 'STATUS_FLIP': {
      if (!hasStatusMarker(`${turn} ${punch}`) || !hasContrastMarker(`${turn} ${punch}`)) {
        return { valid: false, reason: 'mechanism invalid: status flip' };
      }
      return { valid: true };
    }
    case 'UNEXPECTED_RULE_SYSTEM': {
      if (!hasRuleSystemMarker(`${turn} ${punch}`)) {
        return { valid: false, reason: 'mechanism invalid: unexpected rule system' };
      }
      return { valid: true };
    }
    default:
      return { valid: true };
  }
}

type SkeletonScoreResult = {
  scored: ScoredSkeleton | null;
  rejectionReason?: string;
};

function scoreSkeleton(skeleton: JokeSkeleton): SkeletonScoreResult {
  const reasons: string[] = [];
  let score = 0;

  if (
    !skeleton ||
    !skeleton.assumption ||
    !skeleton.turn ||
    !skeleton.punch ||
    !skeleton.anchor ||
    !skeleton.setupLine ||
    !skeleton.punchLine
  ) {
    return { scored: null, rejectionReason: 'missing required fields' };
  }

  if (!isSpecificAnchor(skeleton.anchor)) {
    return { scored: null, rejectionReason: 'vague anchor' };
  }

  if (matchesPattern(skeleton.punchLine, BANNED_PUNCH_PATTERNS)) {
    return { scored: null, rejectionReason: 'banned punch phrase' };
  }

  if (matchesPattern(skeleton.punchLine, EXPLANATORY_PATTERNS)) {
    return { scored: null, rejectionReason: 'explanatory ending' };
  }

  if (skeleton.punchLine.trim().endsWith('?')) {
    return { scored: null, rejectionReason: 'rhetorical question' };
  }

  if (matchesPattern(skeleton.setupLine, NARRATIVE_GLUE_PATTERNS)) {
    return { scored: null, rejectionReason: 'narrative glue in setup' };
  }

  const assumptionPunchSimilarity = calculateStringSimilarity(
    skeleton.assumption,
    skeleton.punchLine
  );
  if (assumptionPunchSimilarity > 0.7) {
    return { scored: null, rejectionReason: 'punch restates assumption' };
  }

  const punchSimilarity = calculateStringSimilarity(skeleton.punch, skeleton.punchLine);
  if (punchSimilarity < 0.6) {
    return { scored: null, rejectionReason: 'punchLine mismatch' };
  }

  const mechanismCheck = mechanismValid(skeleton);
  if (!mechanismCheck.valid) {
    return { scored: null, rejectionReason: mechanismCheck.reason };
  }

  if (assumptionPunchSimilarity < 0.4) {
    score += 20;
    reasons.push('strong turn from assumption');
  }

  if (skeleton.punchLine.split(/\s+/).length <= skeleton.setupLine.split(/\s+/).length) {
    score += 10;
    reasons.push('punch shorter than setup');
  }

  if (introducesNovelWord(skeleton.setupLine, skeleton.punchLine)) {
    score += 10;
    reasons.push('novel detail in punch');
  }

  score = Math.max(0, score);

  return {
    scored: {
      skeleton,
      score,
      reasons,
    },
  };
}

export function scoreSkeletons(batch: SkeletonBatch): ScoredSkeleton[] {
  const scored: ScoredSkeleton[] = [];
  for (const skeleton of batch.candidates) {
    const result = scoreSkeleton(skeleton);
    if (result.scored) {
      scored.push(result.scored);
    }
  }
  return scored;
}

export function scoreSkeletonsWithStats(batch: SkeletonBatch): {
  scored: ScoredSkeleton[];
  rejectionCounts: Record<string, number>;
  rejectedTotal: number;
  total: number;
} {
  const scored: ScoredSkeleton[] = [];
  const rejectionCounts: Record<string, number> = {};
  let rejectedTotal = 0;

  for (const skeleton of batch.candidates) {
    const result = scoreSkeleton(skeleton);
    if (result.scored) {
      scored.push(result.scored);
    } else {
      rejectedTotal += 1;
      const reason = result.rejectionReason || 'unknown';
      rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1;
    }
  }

  return {
    scored,
    rejectionCounts,
    rejectedTotal,
    total: batch.candidates.length,
  };
}

export function getMechanismDistribution(
  skeletons: JokeSkeleton[]
): Record<ComedyMechanism, number> {
  return skeletons.reduce(
    (acc, skeleton) => {
      acc[skeleton.mechanism] = (acc[skeleton.mechanism] || 0) + 1;
      return acc;
    },
    {} as Record<ComedyMechanism, number>
  );
}

export function selectBestSkeletons(
  scored: ScoredSkeleton[],
  count: number
): JokeSkeleton[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score);

  const selected: JokeSkeleton[] = [];
  const usedMechanisms = new Set<ComedyMechanism>();
  const usedTexts = new Set<string>();

  for (const scoredSkeleton of sorted) {
    if (selected.length >= count) break;

    const { skeleton } = scoredSkeleton;
    const normalizedText = `${skeleton.setupLine || ''} ${skeleton.punchLine || ''}`
      .toLowerCase()
      .trim();

    let isDuplicate = false;
    for (const usedText of usedTexts) {
      if (calculateStringSimilarity(normalizedText, usedText) > 0.85) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) continue;

    if (!usedMechanisms.has(skeleton.mechanism)) {
      selected.push(skeleton);
      usedMechanisms.add(skeleton.mechanism);
      usedTexts.add(normalizedText);
    }
  }

  let lastMechanism: ComedyMechanism | null =
    selected.length > 0 ? selected[selected.length - 1].mechanism : null;
  for (const scoredSkeleton of sorted) {
    if (selected.length >= count) break;

    const { skeleton } = scoredSkeleton;
    const normalizedText = `${skeleton.setupLine || ''} ${skeleton.punchLine || ''}`
      .toLowerCase()
      .trim();

    if (selected.some(s => s.id === skeleton.id)) continue;

    let isDuplicate = false;
    for (const usedText of usedTexts) {
      if (calculateStringSimilarity(normalizedText, usedText) > 0.85) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) continue;

    if (lastMechanism && skeleton.mechanism === lastMechanism) {
      continue;
    }

    selected.push(skeleton);
    lastMechanism = skeleton.mechanism;
    usedTexts.add(normalizedText);
  }

  return selected;
}
