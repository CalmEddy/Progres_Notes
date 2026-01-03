#!/usr/bin/env tsx

/**
 * Test script to verify winkNLP initialization and POS tagging
 */

// Load environment variables from .env.local
const { resolve } = require('path');
require('dotenv').config({ path: resolve(process.cwd(), '.env.local') });

import { testNLP, getNLP } from '../lib/phrases/nlpClient';
import { extractPhrases } from '../lib/phrases/phraseExtractor';

async function main() {
  console.log('=== Testing winkNLP Initialization ===\n');
  
  // Test 1: Basic NLP initialization
  console.log('Test 1: NLP Initialization');
  try {
    const nlp = getNLP();
    console.log('✓ NLP initialized successfully\n');
  } catch (error) {
    console.error('✗ NLP initialization failed:', error);
    process.exit(1);
  }
  
  // Test 2: Token extraction and POS tagging
  console.log('Test 2: Token Extraction and POS Tagging');
  const testText = 'The quick brown fox jumps over the lazy dog. The hot coffee cup sits on the wooden table.';
  const diagnostic = testNLP(testText);
  
  if (!diagnostic.initialized) {
    console.error('✗ NLP not initialized');
    console.error('Error:', diagnostic.error);
    process.exit(1);
  }
  
  if (!diagnostic.canTokenize) {
    console.error('✗ Cannot tokenize text');
    console.error('Error:', diagnostic.error);
    process.exit(1);
  }
  
  console.log(`✓ Successfully tokenized text (${diagnostic.tokenCount} tokens)`);
  console.log('\nSample tokens with POS tags:');
  diagnostic.sampleTokens.forEach((token, i) => {
    console.log(`  ${i + 1}. "${token.text}" → ${token.pos}`);
  });
  console.log('');
  
  // Test 3: Phrase extraction
  console.log('Test 3: Phrase Extraction');
  const phrases = extractPhrases(testText);
  
  console.log(`✓ Extracted ${phrases.length} phrases:`);
  if (phrases.length > 0) {
    phrases.forEach((phrase, i) => {
      console.log(`  ${i + 1}. "${phrase.text}" (${phrase.category}, ${phrase.posPattern})`);
    });
  } else {
    console.log('  ⚠ No phrases extracted - this might indicate an issue');
  }
  console.log('');
  
  // Test 4: Test with known patterns
  console.log('Test 4: Testing Known Patterns');
  const testCases = [
    { text: 'take the action', expected: 'VERB-DET-NOUN' },
    { text: 'coffee cup', expected: 'NOUN-NOUN' },
    { text: 'hot coffee', expected: 'ADJ-NOUN' },
    { text: 'man of action', expected: 'NOUN-PREP-NOUN' },
  ];
  
  for (const testCase of testCases) {
    const extracted = extractPhrases(testCase.text);
    const found = extracted.some(p => p.posPattern === testCase.expected);
    const status = found ? '✓' : '✗';
    console.log(`  ${status} "${testCase.text}" → Expected: ${testCase.expected}`);
    if (!found && extracted.length > 0) {
      console.log(`    Found instead: ${extracted.map(p => p.posPattern).join(', ')}`);
    } else if (!found) {
      console.log(`    No phrases extracted`);
    }
  }
  
  console.log('\n=== Test Complete ===');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});




