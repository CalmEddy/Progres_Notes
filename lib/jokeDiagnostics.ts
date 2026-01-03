export type ResolutionType =
  | 'Consequence'
  | 'Reversal'
  | 'ExpectationCollapse'
  | 'ConcreteEscalation'
  | 'AbsurdResolution'
  | 'Reframe';

export type PunchStrength = 'Strong' | 'Medium' | 'Soft';

export type FailureFlag =
  | 'CommentaryEnding'
  | 'AnalogyDecoration'
  | 'ReversibleOutcome'
  | 'NoClearPunch'
  | 'DecorativeEscalation'
  | 'AttitudePunch'
  | 'ExplainsInsteadOfTurns'
  | 'ShrugEnding'
  | 'VagueSpecificity';

export type Irreversibility = 'High' | 'Medium' | 'Low';
export type Specificity = 'Concrete' | 'Mixed' | 'Vague';

export interface JokeDiagnostics {
  resolutionType: ResolutionType;
  punchStrength: PunchStrength;
  failureFlags: FailureFlag[];
  irreversibility: Irreversibility;
  specificity: Specificity;
}

export interface JokeGenResponse {
  // Each input item yields two joke options.
  jokes: JokePair[];
  diagnostics?: JokeDiagnostics[]; // Optional since prompts no longer return diagnostics
}

export interface JokePair {
  world?: string;
  premise?: string;
  a: string;
  b: string;
}

const RESOLUTION_TYPES: ResolutionType[] = [
  'Consequence',
  'Reversal',
  'ExpectationCollapse',
  'ConcreteEscalation',
  'AbsurdResolution',
  'Reframe',
];

const PUNCH_STRENGTHS: PunchStrength[] = ['Strong', 'Medium', 'Soft'];
const FAILURE_FLAGS: FailureFlag[] = [
  'CommentaryEnding',
  'AnalogyDecoration',
  'ReversibleOutcome',
  'NoClearPunch',
  'DecorativeEscalation',
  'AttitudePunch',
  'ExplainsInsteadOfTurns',
  'ShrugEnding',
  'VagueSpecificity',
];
const IRREVERSIBILITY_LEVELS: Irreversibility[] = ['High', 'Medium', 'Low'];
const SPECIFICITY_LEVELS: Specificity[] = ['Concrete', 'Mixed', 'Vague'];

const ROOT_KEYS = ['jokes']; // Diagnostics are optional now
const DIAGNOSTICS_KEYS = [
  'resolutionType',
  'punchStrength',
  'failureFlags',
  'irreversibility',
  'specificity',
];

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const valueKeys = Object.keys(value);
  return valueKeys.length === keys.length && keys.every(key => valueKeys.includes(key));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

export function splitJokesFromText(text: string): string[] {
  const normalized = text.trim().replace(/\r\n/g, '\n');
  return normalized
    .split(/\n{2,}/)
    .map(joke => joke.trim())
    .filter(Boolean);
}

export function normalizeJokes(jokes: string[]): string[] {
  return jokes.map(joke => joke.trim().replace(/\s*\n\s*/g, ' '));
}

export function isJokeDiagnostics(value: unknown): value is JokeDiagnostics {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (!hasExactKeys(record, DIAGNOSTICS_KEYS)) return false;
  if (!RESOLUTION_TYPES.includes(record.resolutionType as ResolutionType)) return false;
  if (!PUNCH_STRENGTHS.includes(record.punchStrength as PunchStrength)) return false;
  if (!IRREVERSIBILITY_LEVELS.includes(record.irreversibility as Irreversibility)) return false;
  if (!SPECIFICITY_LEVELS.includes(record.specificity as Specificity)) return false;
  if (!Array.isArray(record.failureFlags)) return false;

  return record.failureFlags.every(flag => FAILURE_FLAGS.includes(flag as FailureFlag));
}

export function validateJokeGenResponse(
  value: unknown,
  expectedCount?: number
): value is JokeGenResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  
  // Jokes are required
  if (!('jokes' in record) || !isStringArray(record.jokes)) return false;
  if (expectedCount !== undefined && record.jokes.length !== expectedCount) return false;
  
  // Diagnostics are optional (prompts no longer return them)
  if ('diagnostics' in record) {
    if (!Array.isArray(record.diagnostics)) return false;
    if (record.diagnostics.length !== record.jokes.length) return false;
    if (!record.diagnostics.every(isJokeDiagnostics)) return false;
  }
  
  return true;
}

export function parseJokeGenResponse(raw: string, expectedCount: number): JokeGenResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch (error) {
    throw new Error(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  if (!validateJokeGenResponse(parsed, expectedCount)) {
    // Provide detailed error information
    const record = parsed as Record<string, unknown>;
    const errors: string[] = [];
    
    if (!parsed || typeof parsed !== 'object') {
      errors.push('Response is not an object');
    } else {
      if (!('jokes' in record)) {
        errors.push('Missing "jokes" field');
      } else if (!Array.isArray(record.jokes)) {
        errors.push('"jokes" is not an array');
      } else if (record.jokes.length !== expectedCount) {
        errors.push(`Expected ${expectedCount} jokes, got ${record.jokes.length}`);
      }
      
      if (!('diagnostics' in record)) {
        errors.push('Missing "diagnostics" field');
      } else if (!Array.isArray(record.diagnostics)) {
        errors.push('"diagnostics" is not an array');
      } else if (Array.isArray(record.jokes) && record.diagnostics.length !== record.jokes.length) {
        errors.push(`Diagnostics count (${record.diagnostics.length}) doesn't match jokes count (${record.jokes.length})`);
      } else if (Array.isArray(record.diagnostics)) {
        // Check each diagnostic
        record.diagnostics.forEach((diag, idx) => {
          if (!isJokeDiagnostics(diag)) {
            errors.push(`Diagnostics[${idx}] is invalid`);
          }
        });
      }
    }
    
    throw new Error(
      `Response JSON did not match expected joke diagnostics schema: ${errors.join('; ')}`
    );
  }

  const normalizedJokes = normalizeJokes(parsed.jokes);
  if (normalizedJokes.some(joke => joke.length === 0)) {
    throw new Error('Response JSON contained empty jokes');
  }

  return {
    jokes: normalizedJokes,
    diagnostics: parsed.diagnostics || [], // Default to empty array if missing
  };
}

export const PUNCH_STRENGTH_RANK: Record<PunchStrength, number> = {
  Strong: 3,
  Medium: 2,
  Soft: 1,
};

export const IRREVERSIBILITY_RANK: Record<Irreversibility, number> = {
  High: 3,
  Medium: 2,
  Low: 1,
};

export const SPECIFICITY_RANK: Record<Specificity, number> = {
  Concrete: 3,
  Mixed: 2,
  Vague: 1,
};

export interface JokeDiagnosticsItem {
  joke: string;
  diagnostics?: JokeDiagnostics;
}

export interface DiagnosticsFilters {
  punchStrength?: PunchStrength | 'All';
  resolutionType?: ResolutionType | 'All';
  strongOnly?: boolean;
}

export function alignJokesWithDiagnostics(
  jokes: string[],
  diagnostics?: JokeDiagnostics[] | null
): JokeDiagnosticsItem[] {
  if (!diagnostics || diagnostics.length !== jokes.length) {
    return jokes.map(joke => ({ joke }));
  }

  return jokes.map((joke, index) => ({
    joke,
    diagnostics: diagnostics[index],
  }));
}

export function applyDiagnosticsFilters(
  items: JokeDiagnosticsItem[],
  filters: DiagnosticsFilters
): JokeDiagnosticsItem[] {
  return items.filter(item => {
    if (!item.diagnostics) {
      const hasActiveFilter =
        filters.strongOnly ||
        (filters.punchStrength && filters.punchStrength !== 'All') ||
        (filters.resolutionType && filters.resolutionType !== 'All');
      return !hasActiveFilter;
    }
    if (filters.strongOnly && item.diagnostics.punchStrength !== 'Strong') return false;
    if (
      filters.punchStrength &&
      filters.punchStrength !== 'All' &&
      item.diagnostics.punchStrength !== filters.punchStrength
    ) {
      return false;
    }
    if (
      filters.resolutionType &&
      filters.resolutionType !== 'All' &&
      item.diagnostics.resolutionType !== filters.resolutionType
    ) {
      return false;
    }
    return true;
  });
}

export function sortJokesByDiagnostics(items: JokeDiagnosticsItem[]): JokeDiagnosticsItem[] {
  return [...items].sort((a, b) => {
    if (!a.diagnostics && !b.diagnostics) return 0;
    if (!a.diagnostics) return 1;
    if (!b.diagnostics) return -1;
    const punchDelta =
      PUNCH_STRENGTH_RANK[b.diagnostics.punchStrength] -
      PUNCH_STRENGTH_RANK[a.diagnostics.punchStrength];
    if (punchDelta !== 0) return punchDelta;

    const irreversibilityDelta =
      IRREVERSIBILITY_RANK[b.diagnostics.irreversibility] -
      IRREVERSIBILITY_RANK[a.diagnostics.irreversibility];
    if (irreversibilityDelta !== 0) return irreversibilityDelta;

    return (
      SPECIFICITY_RANK[b.diagnostics.specificity] -
      SPECIFICITY_RANK[a.diagnostics.specificity]
    );
  });
}

export interface DiagnosticsSummary {
  strong: number;
  medium: number;
  soft: number;
  failureFlagCounts: Record<FailureFlag, number>;
}

export function summarizeDiagnostics(items: JokeDiagnosticsItem[]): DiagnosticsSummary {
  const summary: DiagnosticsSummary = {
    strong: 0,
    medium: 0,
    soft: 0,
    failureFlagCounts: FAILURE_FLAGS.reduce((acc, flag) => {
      acc[flag] = 0;
      return acc;
    }, {} as Record<FailureFlag, number>),
  };

  items.forEach(item => {
    if (!item.diagnostics) return;
    if (item.diagnostics.punchStrength === 'Strong') summary.strong += 1;
    if (item.diagnostics.punchStrength === 'Medium') summary.medium += 1;
    if (item.diagnostics.punchStrength === 'Soft') summary.soft += 1;

    item.diagnostics.failureFlags.forEach(flag => {
      summary.failureFlagCounts[flag] += 1;
    });
  });

  return summary;
}

export function getTopFailureFlags(summary: DiagnosticsSummary, maxCount = 3) {
  return Object.entries(summary.failureFlagCounts)
    .map(([flag, count]) => ({ flag: flag as FailureFlag, count }))
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, maxCount);
}

export const RESOLUTION_TYPE_OPTIONS = RESOLUTION_TYPES;
export const PUNCH_STRENGTH_OPTIONS = PUNCH_STRENGTHS;
