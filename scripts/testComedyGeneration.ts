/**
 * Manual test script for comedy generation
 *
 * Run with: tsx scripts/testComedyGeneration.ts
 */

import { generateComedy } from '../lib/comedy/generateComedy';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function testComedyGeneration() {
  const topic = 'air travel';
  const jokeCount = 5;

  console.log('Testing comedy generation (single-call pipeline)...');
  console.log(`Topic: ${topic}`);
  console.log(`Joke Count: ${jokeCount}`);
  console.log('---\n');

  try {
    console.log('Test: Default (clean)');
    const result = await generateComedy({ topic, jokeCount });
    const text = result.jokes.join('\n\n');
    
    console.log('Generated Comedy:');
    console.log('---');
    console.log(text);
    console.log('---\n');
    
    // Test chunk splitting
    const chunks = result.jokes;
    
    console.log(`Total chunks: ${chunks.length} (expected: ${jokeCount})`);
    console.log('\nChunks:');
    chunks.forEach((chunk, index) => {
      console.log(`\n[${index + 1}]`);
      console.log(chunk);
    });

    // Verify output format
    console.log('\nFormat Verification:');
    const hasCorrectCount = chunks.length === jokeCount;
    const hasBlankLines = text.includes('\n\n');
    const hasMarkdown = /(^|\n)\s*(#{1,6}|\*|-|\d+\.)\s+|`/.test(text);

    console.log(`Count correct: ${hasCorrectCount ? 'YES' : 'NO'}`);
    console.log(`Blank line separation: ${hasBlankLines ? 'YES' : 'NO'}`);
    console.log(`No markdown: ${hasMarkdown ? 'NO' : 'YES'}`);

    if (!hasCorrectCount) {
      throw new Error(`Expected ${jokeCount} jokes but found ${chunks.length}`);
    }

    if (!hasBlankLines && jokeCount > 1) {
      throw new Error('Expected blank line separation between jokes');
    }

    if (hasMarkdown) {
      throw new Error('Detected markdown in output');
    }
  } catch (error) {
    console.error('Error during comedy generation test:', error);
    process.exit(1);
  }
}

testComedyGeneration();
