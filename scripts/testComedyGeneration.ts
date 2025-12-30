/**
 * Manual test script for comedy generation
 * 
 * Run with: npm run test-comedy (add script to package.json)
 * Or: tsx scripts/testComedyGeneration.ts
 */

import { generateComedy } from '../lib/comedy/generateComedy';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function testComedyGeneration() {
  const topic = 'air travel';
  const jokeCount = 5;

  console.log('Testing comedy generation...');
  console.log(`Topic: ${topic}`);
  console.log(`Joke Count: ${jokeCount}`);
  console.log('---\n');

  try {
    const text = await generateComedy({ topic, jokeCount });
    
    console.log('Generated Comedy:');
    console.log('---');
    console.log(text);
    console.log('---\n');
    
    // Also test chunk splitting
    const chunks = text
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/)
      .map(chunk => chunk.trim())
      .filter(chunk => chunk.length > 0);
    
    console.log(`Total chunks: ${chunks.length}`);
    console.log('\nChunks:');
    chunks.forEach((chunk, index) => {
      console.log(`\n[${index + 1}]`);
      console.log(chunk);
    });
  } catch (error) {
    console.error('Error during comedy generation test:', error);
    process.exit(1);
  }
}

testComedyGeneration();

