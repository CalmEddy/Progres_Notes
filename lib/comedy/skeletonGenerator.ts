/**
 * Skeleton Generator (Stage A)
 *
 * Generates diverse mechanism-first joke skeletons.
 * This stage focuses on structure and variety, not voice.
 */

import { getOpenAIClient } from '@/lib/openaiClient';
import { SKELETON_GENERATOR_SYSTEM_PROMPT, buildSkeletonGeneratorUserMessage } from './skeletonPrompts';
import { SkeletonBatch, JokeSkeleton } from './jokeSkeletons';
import { randomUUID } from 'crypto';

const DOUBLE_QUOTE_VARIANTS = /[\u201C\u201D\u201E\u201F\u2033\u2036\u00AB\u00BB\u301D\u301E\u301F\uFF02]/g;
const SINGLE_QUOTE_VARIANTS = /[\u2018\u2019\u201A\u201B\u2032\u2035\u2039\u203A\uFF07]/g;

function normalizeQuotes(text: string): string {
  return text
    .replace(DOUBLE_QUOTE_VARIANTS, '"')
    .replace(SINGLE_QUOTE_VARIANTS, "'");
}

/**
 * Comprehensive JSON sanitizer that fixes common LLM JSON errors
 * Handles: unquoted strings, unquoted keys, curly quotes, control chars, trailing commas, etc.
 */
function sanitizeJsonString(jsonText: string): string {
  // Step 1: Remove comments (JSON doesn't support them)
  jsonText = jsonText.replace(/\/\/.*$/gm, ''); // Single line comments
  jsonText = jsonText.replace(/\/\*[\s\S]*?\*\//g, ''); // Multi-line comments
  
  // Step 2: Replace ALL curly/smart quotes with straight quotes
  jsonText = normalizeQuotes(jsonText);
  
  // Remove any BOM markers that can break JSON parsing
  jsonText = jsonText.replace(/^\uFEFF/, '');
  
  // Step 3: Fix single quotes used as string delimiters
  // Pattern: 'word': or 'word', or : 'value' or , 'value'
  jsonText = jsonText.replace(/([{:,]\s*)'([^']+)'(\s*[:,\]}])/g, '$1"$2"$3');
  
  // Step 4: Fix unquoted property names
  // Match: { key: or , key: or [ key: (in some edge cases)
  // Also handle cases where there might be whitespace or newlines
  jsonText = jsonText.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  // Also catch property names that might be on new lines after opening brace
  jsonText = jsonText.replace(/({\s*\n\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  // Catch property names after commas with newlines
  jsonText = jsonText.replace(/(,\s*\n\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  
  // Step 4b: Fix property names that have newline between name and colon
  // Pattern: "propertyName"\n : or "propertyName" \n:
  jsonText = jsonText.replace(/"([a-zA-Z_][a-zA-Z0-9_]*)"\s*\n\s*:/g, '"$1":');
  
  // Step 5: Fix unquoted string values using regex (simpler and more reliable)
  // Pattern: ": unquoted_text (where text starts with letter and continues to comma/brace)
  jsonText = jsonText.replace(/":\s+([A-Za-z][A-Za-z0-9_\s]*?)(\s*[,}\]])/g, (match, value, ending) => {
    const trimmed = value.trim();
    // Don't quote if it's a JSON keyword
    if (trimmed === 'true' || trimmed === 'false' || trimmed === 'null') {
      return match;
    }
    // Don't quote if it's a number
    if (!isNaN(Number(trimmed))) {
      return match;
    }
    // Quote the value and escape any quotes inside it
    const escaped = trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return ': "' + escaped + '"' + ending;
  });
  
  // Step 6: Now use state machine for control character escaping
  let result = '';
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < jsonText.length; i++) {
    const char = jsonText[i];
    const code = char.charCodeAt(0);
    
    // Handle escape sequences
    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      result += char;
      escapeNext = true;
      continue;
    }
    
    // Handle string boundaries
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }
    
    if (inString) {
      // Inside a string - escape control characters that are invalid in JSON
      // JSON allows: \n (0x0A), \r (0x0D), \t (0x09)
      // Must escape: \x00-\x08, \x0B, \x0C, \x0E-\x1F, \x7F
      if ((code >= 0x00 && code <= 0x08) || 
          code === 0x0B || 
          code === 0x0C || 
          (code >= 0x0E && code <= 0x1F) || 
          code === 0x7F) {
        // Escape as \uXXXX
        result += '\\u' + code.toString(16).padStart(4, '0').toUpperCase();
      } else {
        result += char;
      }
    } else {
      // Outside a string - remove control characters (they're invalid in JSON structure)
      if ((code >= 0x00 && code <= 0x08) || 
          code === 0x0B || 
          code === 0x0C || 
          (code >= 0x0E && code <= 0x1F) || 
          code === 0x7F) {
        // Skip invalid control chars outside strings
        continue;
      }
      result += char;
    }
  }
  
  // Step 7: Fix missing commas between array elements
  // Pattern: "value" "value" -> "value", "value" (but only inside arrays)
  // Be careful - only fix if we're clearly in an array context
  // Use RegExp constructor to avoid quote escaping issues
  result = result.replace(new RegExp('(\\]\\s*")\\s*"', 'g'), '$1, "'); // After closing bracket, before string
  result = result.replace(new RegExp('"\\s*"\\s*([,\\]])', 'g'), '", "$1'); // String followed by string then comma/bracket
  
  // Step 8: Fix missing commas before closing array bracket
  // Pattern: value ] -> value, ] (but be careful not to break valid JSON)
  // Only add comma if there's a value-like pattern before ]
  result = result.replace(/([^,\s[\]{}])\s*(\])/g, (match, before, bracket) => {
    // Don't add comma if before is already a closing bracket/brace
    if (before === '}' || before === ']' || before === ',') {
      return match;
    }
    return before + ', ' + bracket;
  });
  
  // Step 9: Remove trailing commas (do this after fixing array issues)
  result = result.replace(/,(\s*[}\]])/g, '$1');
  
  // Step 10: Normalize whitespace around colons
  result = result.replace(/:\s{2,}/g, ': ');
  
  // Step 11: Fix missing commas between object/array elements
  // Pattern: } { -> }, { (objects in array) - be more aggressive with whitespace
  // This handles cases like: }\n{ or }  { or }\n  { - must have at least one whitespace char
  result = result.replace(/}\s+{/g, '}, {');
  // Pattern: ] [ -> ], [ (arrays in array - less common but possible)
  result = result.replace(/\]\s+\[/g, '], [');
  
  // Step 12: Additional pass to fix } followed by newline and { (common in formatted JSON)
  // This catches cases where the regex above might have missed due to complex whitespace
  result = result.replace(/}\s*\n\s*{/g, '},\n  {');
  
  return result;
}

export function validateSkeletonBatch(batch: SkeletonBatch): void {
  if (!batch || typeof batch !== 'object') {
    throw new Error('Invalid skeleton batch: not an object');
  }
  if (typeof batch.topic !== 'string' || batch.topic.trim().length === 0) {
    throw new Error('Invalid skeleton batch: missing topic');
  }
  if (typeof batch.requestedCount !== 'number') {
    throw new Error('Invalid skeleton batch: missing requestedCount');
  }
  if (!Array.isArray(batch.candidates)) {
    throw new Error('Invalid skeleton batch: missing candidates array');
  }
  for (const candidate of batch.candidates) {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error('Invalid skeleton batch: candidate is not an object');
    }
    const requiredFields: Array<keyof JokeSkeleton> = [
      'id',
      'mechanism',
      'anchor',
      'assumption',
      'turn',
      'punch',
      'setupLine',
      'punchLine',
    ];
    for (const field of requiredFields) {
      if (!candidate[field] || String(candidate[field]).trim().length === 0) {
        throw new Error(`Invalid skeleton batch: candidate missing ${field}`);
      }
    }
  }
}

export interface SkeletonGenerationConstraints {
  clean?: boolean;
}

/**
 * Generate joke skeletons for a topic
 *
 * @param topic - The topic to generate jokes about
 * @param targetSkeletonCount - Target number of skeletons to generate
 * @param constraints - Optional constraints (clean/edgy)
 * @returns SkeletonBatch with generated skeletons
 */
export async function generateSkeletons(
  topic: string,
  targetSkeletonCount: number,
  constraints: SkeletonGenerationConstraints = {}
): Promise<SkeletonBatch> {
  const openai = getOpenAIClient();
  const clean = constraints.clean !== false; // default to true

  const userMessage = buildSkeletonGeneratorUserMessage(topic, targetSkeletonCount, clean);

  let retryCount = 0;
  const maxRetries = 1;

  while (retryCount <= maxRetries) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: SKELETON_GENERATOR_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: userMessage + (retryCount > 0 ? '\n\nCRITICAL: Return STRICT JSON ONLY. No markdown, no code blocks, no explanations. Valid JSON that can be parsed directly. Ensure proper JSON formatting with no trailing spaces.' : ''),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 1.0,
        top_p: 0.95,
        presence_penalty: 0.5,
        frequency_penalty: 0.2,
        max_tokens: 3000,
      });

      const outputText = completion.choices[0]?.message?.content || '';

      if (!outputText.trim()) {
        throw new Error('Empty response from OpenAI');
      }

      // Try to extract JSON from response (handle markdown code blocks)
      let jsonText = outputText.trim();
      
      // Remove markdown code blocks if present
      const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      } else {
        // Try to find JSON object boundaries
        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonText = jsonText.substring(firstBrace, lastBrace + 1);
        }
      }

      // Comprehensive JSON sanitization - handles all common LLM JSON errors
      jsonText = sanitizeJsonString(jsonText);

      let batch: SkeletonBatch;
      try {
        batch = JSON.parse(jsonText);
      } catch (parseError) {
        // Log the problematic JSON for debugging
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
        console.error('JSON parse error:', errorMessage);
        
        // Extract position from error message if available
        const positionMatch = errorMessage.match(/position (\d+)/);
        if (positionMatch) {
          const pos = parseInt(positionMatch[1], 10);
          const start = Math.max(0, pos - 200);
          const end = Math.min(jsonText.length, pos + 200);
          const context = jsonText.substring(start, end);
          console.error(`Context around error position ${pos} (line ${errorMessage.match(/line (\d+)/)?.[1] || 'unknown'}):`);
          console.error(context);
          console.error(' '.repeat(Math.min(200, pos - start)) + '^');
          console.error(`Character at position ${pos}:`, JSON.stringify(jsonText[pos] || '(end of string)'));
          if (pos < jsonText.length) {
            console.error(`Character code:`, jsonText.charCodeAt(pos));
          }
        }
        
        console.error('Raw response (first 2000 chars):', outputText.substring(0, 2000));
        console.error('Extracted JSON (first 2000 chars):', jsonText.substring(0, 2000));
        
        // Try one more aggressive sanitization pass with regex-based unquoted value fixing
        if (retryCount === 0) {
          console.log('Attempting aggressive JSON sanitization...');
          
          // CRITICAL: Fix missing commas between objects in arrays first (most common issue)
          // This must be done before other sanitization to avoid breaking the structure
          jsonText = jsonText.replace(/}\s+{/g, '}, {');
          jsonText = jsonText.replace(/}\s*\n\s*{/g, '},\n  {');
          
          // Re-run full sanitization
          jsonText = sanitizeJsonString(jsonText);
          
          // Additional aggressive fixes
          
          // Re-run curly quote replacement (sometimes they slip through)
          jsonText = normalizeQuotes(jsonText);
          
          // Fix missing colons after property names (critical fix for this error type)
          // Fix property names with newlines before colon
          jsonText = jsonText.replace(/"([a-zA-Z_][a-zA-Z0-9_]*)"\s*\n\s*:/g, '"$1":');
          
          // Fix missing colon: "propertyName" value -> "propertyName": value
          // Look for quoted property name followed by whitespace and then a value token (but no colon)
          // Fix patterns like: "prop" "value", "prop" 123, "prop" true, "prop" {, "prop" [
          // Use negative lookahead to avoid matching if colon already exists
          // Match and capture the value token so we can preserve it
          jsonText = jsonText.replace(/"([a-zA-Z_][a-zA-Z0-9_]*)"\s+(?!:)([{"\[]|-?\d+\.?\d*|true|false|null)/g, '"$1": $2');
          
          // Fix unquoted property names more aggressively
          jsonText = jsonText.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
          jsonText = jsonText.replace(/({\s*\n\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
          jsonText = jsonText.replace(/(,\s*\n\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
          
          // Fix array syntax issues more aggressively
          // Fix missing commas between array elements
          jsonText = jsonText.replace(new RegExp('(\\]\\s*")\\s*"', 'g'), '$1, "');
          jsonText = jsonText.replace(new RegExp('"\\s*"\\s*([,\\]])', 'g'), '", "$1');
          // Fix missing commas before closing array bracket
          jsonText = jsonText.replace(/([^,\s[\]{}])\s*(\])/g, (match, before, bracket) => {
            if (before === '}' || before === ']' || before === ',') {
              return match;
            }
            return before + ', ' + bracket;
          });
          // Remove duplicate commas that might have been created
          jsonText = jsonText.replace(/,\s*,/g, ',');
          
          // Fix unquoted string values using regex
          // Pattern: ": word (where word continues until comma, }, or ])
          // This handles cases like: "punch": I end up spending
          // Use a more lenient pattern that matches any characters except structural JSON chars
          jsonText = jsonText.replace(/":\s+([A-Za-z][^\n\r,}\]]*?)(\s*[,}\]]|\s*\n)/g, (match, value, ending) => {
            const trimmed = value.trim();
            // Don't quote if it's empty
            if (!trimmed) {
              return match;
            }
            // Don't quote if it's a JSON keyword
            if (trimmed === 'true' || trimmed === 'false' || trimmed === 'null') {
              return match;
            }
            // Don't quote if it's a number
            if (!isNaN(Number(trimmed)) && trimmed.match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/)) {
              return match;
            }
            // Don't quote if it starts with { or [ (nested object/array)
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              return match;
            }
            // Quote the value and escape properly
            const escaped = trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
            return ': "' + escaped + '"' + (ending || '');
          });
          
          // Final pass: ensure commas between objects (in case sanitizeJsonString didn't catch it)
          jsonText = jsonText.replace(/}\s+{/g, '}, {');
          jsonText = jsonText.replace(/}\s*\n\s*{/g, '},\n  {');
          
          try {
            batch = JSON.parse(jsonText);
            console.log('JSON parse succeeded after aggressive sanitization');
          } catch (secondError) {
            // Still failed, continue to retry
            throw new Error(
              `Invalid JSON response from LLM: ${errorMessage}`
            );
          }
        } else {
          // Re-throw to be caught by outer catch for retry logic
          throw new Error(
            `Invalid JSON response from LLM: ${errorMessage}`
          );
        }
      }

      // Validate and ensure IDs
      validateSkeletonBatch(batch);

      // Ensure all skeletons have IDs
      batch.candidates = batch.candidates.map(skeleton => ({
        ...skeleton,
        id: skeleton.id || randomUUID(),
      }));

      // Validate topic and requestedCount
      batch.topic = batch.topic || topic;
      batch.requestedCount = batch.requestedCount || targetSkeletonCount;

      return batch;
    } catch (error) {
      if (retryCount < maxRetries) {
        retryCount++;
        continue;
      }
      console.error('Error generating skeletons:', error);
      throw new Error(
        `Failed to generate skeletons: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  throw new Error('Failed to generate skeletons after retries');
}
