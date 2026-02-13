export interface RewrittenItem {
  world: string;
  premise: string;
  text: string;
}

export interface JokePair {
  world?: string;
  premise?: string;
  a: string;
  b: string;
}

/**
 * Type guard to check if an item is a RewrittenItem (new format)
 */
export function isRewrittenItem(item: RewrittenItem | JokePair): item is RewrittenItem {
  return 'text' in item && typeof item.text === 'string';
}

/**
 * Type guard to check if an item is a JokePair (legacy format)
 */
export function isJokePair(item: RewrittenItem | JokePair): item is JokePair {
  return 'a' in item && 'b' in item && typeof item.a === 'string' && typeof item.b === 'string';
}

export interface JokeGenResponse {
  // New format: RewrittenItem[] with text property
  // Legacy format: JokePair[] with a/b properties (for backward compatibility)
  jokes: Array<RewrittenItem | JokePair>;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

export function validateJokeGenResponse(
  value: unknown,
  expectedCount?: number
): value is JokeGenResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  
  // Jokes are required
  if (!('jokes' in record) || !Array.isArray(record.jokes)) return false;
  if (expectedCount !== undefined && record.jokes.length !== expectedCount) return false;
  
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
    }
    
    throw new Error(
      `Response JSON did not match expected joke schema: ${errors.join('; ')}`
    );
  }

  return {
    jokes: parsed.jokes as Array<RewrittenItem | JokePair>,
  };
}
