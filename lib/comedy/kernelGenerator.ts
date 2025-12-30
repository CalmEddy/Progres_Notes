/**
 * Kernel Generator (Stage A)
 * 
 * Generates diverse joke kernels using the comedy mechanism library.
 * This stage focuses on creativity and variety, not voice.
 */

import { getOpenAIClient } from '@/lib/openaiClient';
import { KERNEL_GENERATOR_SYSTEM_PROMPT, buildKernelGeneratorUserMessage } from './kernelPrompts';
import { KernelBatch, JokeKernel } from './comedyKernels';
import { randomUUID } from 'crypto';

/**
 * Comprehensive JSON sanitizer that fixes common LLM JSON errors
 * Handles: unquoted strings, unquoted keys, curly quotes, control chars, trailing commas, etc.
 */
function sanitizeJsonString(jsonText: string): string {
  // Step 1: Remove comments (JSON doesn't support them)
  jsonText = jsonText.replace(/\/\/.*$/gm, ''); // Single line comments
  jsonText = jsonText.replace(/\/\*[\s\S]*?\*\//g, ''); // Multi-line comments
  
  // Step 2: Replace ALL curly/smart quotes with straight quotes (comprehensive)
  // Handle all Unicode quote variants - be very aggressive about this
  // Common curly quotes (most frequent)
  jsonText = jsonText.replace(/[""]/g, '"'); // Left/right double quotation marks (U+201C, U+201D)
  jsonText = jsonText.replace(/[""]/g, '"');
  jsonText = jsonText.replace(/['']/g, "'"); // Left/right single quotation marks (U+2018, U+2019)
  jsonText = jsonText.replace(/['']/g, "'");
  
  // All Unicode quote variants using character code ranges
  // Double quote variants: U+201C, U+201D, U+201E, U+201F, U+2033, U+2036
  jsonText = jsonText.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
  // Single quote variants: U+2018, U+2019, U+201A, U+201B, U+2032, U+2035
  jsonText = jsonText.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
  
  // Run the replacement again to catch any that might have been missed
  // (sometimes quotes can be in different contexts)
  jsonText = jsonText.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
  jsonText = jsonText.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
  
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
  
  // Step 7: Remove trailing commas
  result = result.replace(/,(\s*[}\]])/g, '$1');
  
  // Step 8: Normalize whitespace around colons
  result = result.replace(/:\s{2,}/g, ': ');
  
  return result;
}

export interface KernelGenerationConstraints {
  clean?: boolean;
}

/**
 * Generate joke kernels for a topic
 * 
 * @param topic - The topic to generate jokes about
 * @param targetKernelCount - Target number of kernels to generate (typically jokeCount * 3)
 * @param constraints - Optional constraints (clean/edgy)
 * @returns KernelBatch with generated kernels
 */
export async function generateKernels(
  topic: string,
  targetKernelCount: number,
  constraints: KernelGenerationConstraints = {}
): Promise<KernelBatch> {
  const openai = getOpenAIClient();
  const clean = constraints.clean !== false; // default to true

  const userMessage = buildKernelGeneratorUserMessage(topic, targetKernelCount, clean);

  let retryCount = 0;
  const maxRetries = 1;

  while (retryCount <= maxRetries) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: KERNEL_GENERATOR_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: userMessage + (retryCount > 0 ? '\n\nCRITICAL: Return STRICT JSON ONLY. No markdown, no code blocks, no explanations. Valid JSON that can be parsed directly. Ensure proper JSON formatting with no trailing spaces.' : ''),
          },
        ],
        temperature: 1.0,
        top_p: 0.95,
        presence_penalty: 0.5,
        frequency_penalty: 0.2,
        max_tokens: 2000,
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

      let batch: KernelBatch;
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
          
          // Re-run full sanitization
          jsonText = sanitizeJsonString(jsonText);
          
          // Additional aggressive fixes
          
          // Re-run curly quote replacement (sometimes they slip through)
          jsonText = jsonText.replace(/[""]/g, '"');
          jsonText = jsonText.replace(/[""]/g, '"');
          jsonText = jsonText.replace(/['']/g, "'");
          jsonText = jsonText.replace(/['']/g, "'");
          jsonText = jsonText.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
          jsonText = jsonText.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
          
          // Fix unquoted property names more aggressively
          jsonText = jsonText.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
          jsonText = jsonText.replace(/({\s*\n\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
          jsonText = jsonText.replace(/(,\s*\n\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
          
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
      if (!batch.kernels || !Array.isArray(batch.kernels)) {
        throw new Error('Invalid kernel batch: missing kernels array');
      }

      // Ensure all kernels have IDs
      batch.kernels = batch.kernels.map(kernel => ({
        ...kernel,
        id: kernel.id || randomUUID(),
      }));

      // Validate topic and requestedCount
      batch.topic = batch.topic || topic;
      batch.requestedCount = batch.requestedCount || targetKernelCount;

      return batch;
    } catch (error) {
      if (retryCount < maxRetries) {
        retryCount++;
        continue;
      }
      console.error('Error generating kernels:', error);
      throw new Error(
        `Failed to generate kernels: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  throw new Error('Failed to generate kernels after retries');
}

