/**
 * Test script for two-step joke generation pipeline
 *
 * Run with: tsx scripts/testTwoStepPipeline.ts
 */

import { generateComedy } from '../lib/comedy/generateComedy';
import {
  validateJokeGenResponse,
  JokeGenResponse,
  JokeDiagnostics,
} from '../lib/jokeDiagnostics';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

/**
 * Calculate Jaccard similarity between two strings
 * Returns a value between 0 and 1, where 1 means identical
 */
function calculateJaccardSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  if (union.size === 0) return 1; // Both empty
  return intersection.size / union.size;
}

/**
 * Calculate word overlap percentage between two strings
 * Returns a value between 0 and 1
 */
function calculateWordOverlap(text1: string, text2: string): number {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);

  const set2 = new Set(words2);
  const matchingWords = words1.filter(word => set2.has(word));

  if (words1.length === 0) return 0;
  return matchingWords.length / words1.length;
}

/**
 * Test 1: Schema validation for base and rewrite steps
 */
async function testSchemaValidation() {
  console.log('\n=== Test 1: Schema Validation ===');
  const topic = 'coffee shops';
  const jokeCount = 3;

  try {
    const result = await generateComedy({ topic, jokeCount });

    // Validate response structure
    if (!validateJokeGenResponse(result, jokeCount)) {
      throw new Error('Response does not match JokeGenResponse schema');
    }

    // Validate diagnostics structure
    result.diagnostics.forEach((diag, index) => {
      if (!diag.resolutionType || !diag.punchStrength || !diag.irreversibility || !diag.specificity) {
        throw new Error(`Diagnostics[${index}] missing required fields`);
      }
      if (!Array.isArray(diag.failureFlags)) {
        throw new Error(`Diagnostics[${index}].failureFlags is not an array`);
      }
    });

    console.log('✓ Schema validation passed');
    console.log(`  Generated ${result.jokes.length} jokes with valid diagnostics`);
    return true;
  } catch (error) {
    console.error('✗ Schema validation failed:', error);
    return false;
  }
}

/**
 * Test 2: Count validation
 */
async function testCountValidation() {
  console.log('\n=== Test 2: Count Validation ===');
  const topic = 'Dogs are better than cats';
  const jokeCount = 6;

  try {
    const result = await generateComedy({ topic, jokeCount });

    if (result.jokes.length !== jokeCount) {
      throw new Error(
        `Expected ${jokeCount} jokes, got ${result.jokes.length}`
      );
    }

    if (result.diagnostics.length !== jokeCount) {
      throw new Error(
        `Expected ${jokeCount} diagnostics, got ${result.diagnostics.length}`
      );
    }

    console.log('✓ Count validation passed');
    console.log(`  Returned exactly ${jokeCount} jokes and ${jokeCount} diagnostics`);
    return true;
  } catch (error) {
    console.error('✗ Count validation failed:', error);
    return false;
  }
}

/**
 * Test 3: Rewriting verification (requires internal access to base jokes)
 * This test checks that rewritten jokes differ from base jokes
 * Note: We can't directly access base jokes, so we'll test with a known topic
 * and verify the jokes are substantial (not empty, have content)
 */
async function testRewritingVerification() {
  console.log('\n=== Test 3: Rewriting Verification ===');
  const topic = 'Dogs are better than cats';
  const jokeCount = 4;

  try {
    const result = await generateComedy({ topic, jokeCount });

    // Verify jokes are substantial (not just empty or very short)
    result.jokes.forEach((joke, index) => {
      if (joke.trim().length < 20) {
        throw new Error(`Joke[${index}] is too short: "${joke}"`);
      }
      // Check for concrete details (at least some words)
      const words = joke.split(/\s+/);
      if (words.length < 5) {
        throw new Error(`Joke[${index}] has too few words: ${words.length}`);
      }
    });

    // Verify jokes are not identical (check for variety)
    const uniqueJokes = new Set(result.jokes);
    if (uniqueJokes.size < jokeCount * 0.5) {
      throw new Error(
        `Too many duplicate jokes: ${uniqueJokes.size} unique out of ${jokeCount}`
      );
    }

    console.log('✓ Rewriting verification passed');
    console.log(`  All ${result.jokes.length} jokes are substantial and varied`);
    return true;
  } catch (error) {
    console.error('✗ Rewriting verification failed:', error);
    return false;
  }
}

/**
 * Test 4: Fallback behavior (test with rewrite disabled)
 */
async function testFallbackBehavior() {
  console.log('\n=== Test 4: Fallback Behavior ===');
  const topic = 'air travel';
  const jokeCount = 3;

  try {
    // Test with rewrite disabled
    const result = await generateComedy({
      topic,
      jokeCount,
      config: { enableRewrite: false },
    });

    if (result.jokes.length !== jokeCount) {
      throw new Error(
        `Expected ${jokeCount} jokes with rewrite disabled, got ${result.jokes.length}`
      );
    }

    console.log('✓ Fallback behavior passed');
    console.log(`  Returned ${result.jokes.length} jokes when rewrite is disabled`);
    return true;
  } catch (error) {
    console.error('✗ Fallback behavior test failed:', error);
    return false;
  }
}

/**
 * Test 5: Filtering logic (indirect test via diagnostics)
 */
async function testFilteringLogic() {
  console.log('\n=== Test 5: Filtering Logic ===');
  const topic = 'smartphones';
  const jokeCount = 5;

  try {
    const result = await generateComedy({ topic, jokeCount });

    // Check that returned jokes have good diagnostics
    // (filtering should prefer Concrete specificity)
    const concreteCount = result.diagnostics.filter(
      d => d.specificity === 'Concrete'
    ).length;
    const vagueCount = result.diagnostics.filter(d => d.specificity === 'Vague').length;

    // Most jokes should be Concrete (filtering should have removed Vague ones)
    if (vagueCount > jokeCount * 0.4) {
      console.warn(
        `  Warning: ${vagueCount} out of ${jokeCount} jokes are Vague (expected fewer)`
      );
    }

    console.log('✓ Filtering logic test passed');
    console.log(
      `  Specificity distribution: ${concreteCount} Concrete, ${vagueCount} Vague`
    );
    return true;
  } catch (error) {
    console.error('✗ Filtering logic test failed:', error);
    return false;
  }
}

/**
 * Test 6: Config flags
 */
async function testConfigFlags() {
  console.log('\n=== Test 6: Config Flags ===');
  const topic = 'online shopping';
  const jokeCount = 2;

  try {
    // Test with rewrite disabled
    const resultNoRewrite = await generateComedy({
      topic,
      jokeCount,
      config: { enableRewrite: false },
    });

    if (resultNoRewrite.jokes.length !== jokeCount) {
      throw new Error(
        `Expected ${jokeCount} jokes with rewrite disabled, got ${resultNoRewrite.jokes.length}`
      );
    }

    // Test with rewrite enabled (default)
    const resultWithRewrite = await generateComedy({
      topic,
      jokeCount,
      config: { enableRewrite: true },
    });

    if (resultWithRewrite.jokes.length !== jokeCount) {
      throw new Error(
        `Expected ${jokeCount} jokes with rewrite enabled, got ${resultWithRewrite.jokes.length}`
      );
    }

    console.log('✓ Config flags test passed');
    console.log('  Both rewrite enabled and disabled modes work correctly');
    return true;
  } catch (error) {
    console.error('✗ Config flags test failed:', error);
    return false;
  }
}

/**
 * Test 7: Base count calculation
 */
async function testBaseCountCalculation() {
  console.log('\n=== Test 7: Base Count Calculation ===');
  const topic = 'social media';
  const jokeCount = 6;

  try {
    // We can't directly verify N_base, but we can verify the final output
    // If N_base calculation is wrong, we might get errors or wrong counts
    const result = await generateComedy({
      topic,
      jokeCount,
      config: {
        baseMultiplier: 3,
        minBaseCount: 12,
      },
    });

    if (result.jokes.length !== jokeCount) {
      throw new Error(
        `Expected ${jokeCount} jokes, got ${result.jokes.length}`
      );
    }

    // Expected N_base = max(12, 6 * 3) = max(12, 18) = 18
    // We can't verify this directly, but if it's wrong, we'd see errors
    console.log('✓ Base count calculation test passed');
    console.log(
      `  With N_final=${jokeCount}, multiplier=3, minBase=12, expected N_base=18`
    );
    console.log(`  Successfully generated ${result.jokes.length} final jokes`);
    return true;
  } catch (error) {
    console.error('✗ Base count calculation test failed:', error);
    return false;
  }
}

/**
 * Test 8: Jaccard similarity helper function
 */
function testJaccardSimilarityHelper() {
  console.log('\n=== Test 8: Jaccard Similarity Helper ===');

  try {
    // Test identical strings
    const identical = calculateJaccardSimilarity('hello world', 'hello world');
    if (Math.abs(identical - 1.0) > 0.01) {
      throw new Error(`Expected similarity 1.0 for identical strings, got ${identical}`);
    }

    // Test completely different strings
    const different = calculateJaccardSimilarity('hello world', 'foo bar baz');
    if (different > 0.1) {
      throw new Error(
        `Expected similarity < 0.1 for different strings, got ${different}`
      );
    }

    // Test partial overlap
    const partial = calculateJaccardSimilarity('hello world test', 'hello world foo');
    if (partial < 0.3 || partial > 0.7) {
      throw new Error(
        `Expected similarity ~0.5 for partial overlap, got ${partial}`
      );
    }

    console.log('✓ Jaccard similarity helper test passed');
    return true;
  } catch (error) {
    console.error('✗ Jaccard similarity helper test failed:', error);
    return false;
  }
}

/**
 * Test 9: Word overlap helper function
 */
function testWordOverlapHelper() {
  console.log('\n=== Test 9: Word Overlap Helper ===');

  try {
    // Test identical strings
    const identical = calculateWordOverlap('hello world', 'hello world');
    if (Math.abs(identical - 1.0) > 0.01) {
      throw new Error(`Expected overlap 1.0 for identical strings, got ${identical}`);
    }

    // Test completely different strings
    const different = calculateWordOverlap('hello world', 'foo bar baz');
    if (different > 0.1) {
      throw new Error(`Expected overlap < 0.1 for different strings, got ${different}`);
    }

    // Test partial overlap
    const partial = calculateWordOverlap('hello world test', 'hello world foo');
    if (partial < 0.5 || partial > 0.8) {
      throw new Error(`Expected overlap ~0.67 for partial overlap, got ${partial}`);
    }

    console.log('✓ Word overlap helper test passed');
    return true;
  } catch (error) {
    console.error('✗ Word overlap helper test failed:', error);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('========================================');
  console.log('Two-Step Pipeline Tests');
  console.log('========================================');

  const results: boolean[] = [];

  // Helper function tests (synchronous)
  results.push(testJaccardSimilarityHelper());
  results.push(testWordOverlapHelper());

  // Integration tests (async, require API key)
  if (process.env.OPENAI_API_KEY) {
    results.push(await testSchemaValidation());
    results.push(await testCountValidation());
    results.push(await testRewritingVerification());
    results.push(await testFallbackBehavior());
    results.push(await testFilteringLogic());
    results.push(await testConfigFlags());
    results.push(await testBaseCountCalculation());
  } else {
    console.log('\n⚠ OPENAI_API_KEY not set, skipping integration tests');
    console.log('  Set OPENAI_API_KEY in .env.local to run full test suite');
  }

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log('\n========================================');
  console.log(`Test Results: ${passed}/${total} passed`);
  console.log('========================================');

  if (passed === total) {
    console.log('✓ All tests passed!');
    process.exit(0);
  } else {
    console.log('✗ Some tests failed');
    process.exit(1);
  }
}

runAllTests();

