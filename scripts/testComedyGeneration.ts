/**
 * Manual test script for comedy generation
 * 
 * Run with: npm run test-comedy (add script to package.json)
 * Or: tsx scripts/testComedyGeneration.ts
 * 
 * Set COMEDY_DEBUG=true to see skeleton generation details
 */

import { generateComedy } from '../lib/comedy/generateComedy';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function testComedyGeneration() {
  const topic = 'air travel';
  const jokeCount = 5;

  console.log('Testing comedy generation (three-stage pipeline)...');
  console.log(`Topic: ${topic}`);
  console.log(`Joke Count: ${jokeCount}`);
  console.log(`Debug mode: ${process.env.COMEDY_DEBUG === 'true' ? 'ON' : 'OFF'}`);
  console.log('---\n');

  try {
    // Test with default (Dave Barry, clean)
    console.log('Test 1: Default (Dave Barry, clean)');
    const text1 = await generateComedy({ topic, jokeCount });
    
    console.log('Generated Comedy:');
    console.log('---');
    console.log(text1);
    console.log('---\n');
    
    // Test chunk splitting
    const chunks1 = text1
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/)
      .map(chunk => chunk.trim())
      .filter(chunk => chunk.length > 0);
    
    console.log(`Total chunks: ${chunks1.length} (expected: ${jokeCount})`);
    console.log('\nChunks:');
    chunks1.forEach((chunk, index) => {
      console.log(`\n[${index + 1}]`);
      console.log(chunk);
    });

    // Test with Steven Wright (single sentence)
    console.log('\n\nTest 2: Steven Wright (single sentence)');
    const text2 = await generateComedy({ 
      topic: 'time', 
      jokeCount: 3, 
      humoristId: 'steven_wright' 
    });
    
    console.log('Generated Comedy:');
    console.log('---');
    console.log(text2);
    console.log('---\n');

    // Test with Ken Davis
    console.log('\n\nTest 3: Ken Davis');
    const text3 = await generateComedy({ 
      topic: 'family life', 
      jokeCount: 3, 
      humoristId: 'ken_davis' 
    });
    
    console.log('Generated Comedy:');
    console.log('---');
    console.log(text3);
    console.log('---\n');

    // Verify output format
    console.log('\nFormat Verification:');
    const allTexts = [text1, text2, text3];
    allTexts.forEach((text, i) => {
      const chunks = text
        .replace(/\r\n/g, '\n')
        .split(/\n{2,}/)
        .map(chunk => chunk.trim())
        .filter(chunk => chunk.length > 0);
      
      console.log(`Test ${i + 1}: ${chunks.length} jokes, blank line separation: ${text.includes('\n\n') ? 'YES' : 'NO'}`);
    });

  } catch (error) {
    console.error('Error during comedy generation test:', error);
    process.exit(1);
  }
}

testComedyGeneration();
