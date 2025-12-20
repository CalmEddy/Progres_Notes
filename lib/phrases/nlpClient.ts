import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

// Import winkNLP helpers for accessing token properties
const its = require('wink-nlp/src/its.js');

/**
 * Initialize and configure winkNLP with the English language model
 * This is a singleton instance that can be reused across requests
 */
let nlp: ReturnType<typeof winkNLP> | null = null;

export function getNLP() {
  if (!nlp) {
    try {
      nlp = winkNLP(model);
      // Verify initialization by testing with a simple sentence
      const testDoc = nlp.readDoc('The quick brown fox jumps.');
      const testTokens = testDoc.tokens();
      if (!testTokens || testTokens.length() === 0) {
        console.error('winkNLP initialization failed: unable to tokenize test sentence');
        throw new Error('winkNLP initialization failed');
      }
    } catch (error) {
      console.error('Error initializing winkNLP:', error);
      throw error;
    }
  }
  return nlp;
}

/**
 * Get the NLP instance, initializing if necessary
 * This function ensures we have a single instance of the NLP processor
 */
export function initializeNLP() {
  return getNLP();
}

/**
 * Diagnostic function to test NLP functionality
 * Returns diagnostic information about NLP initialization and token extraction
 */
export function testNLP(text: string = 'The quick brown fox jumps over the lazy dog.'): {
  initialized: boolean;
  canTokenize: boolean;
  tokenCount: number;
  sampleTokens: Array<{ text: string; pos: string }>;
  error?: string;
} {
  try {
    const nlp = getNLP();
    const doc = nlp.readDoc(text);
    
    const tokenTexts = doc.tokens().out(its.text);
    const posTags = doc.tokens().out(its.pos);
    
    const sampleTokens: Array<{ text: string; pos: string }> = [];
    const minLength = Math.min(tokenTexts?.length || 0, posTags?.length || 0);
    
    for (let i = 0; i < Math.min(minLength, 10); i++) {
      sampleTokens.push({
        text: String(tokenTexts[i] || ''),
        pos: String(posTags[i] || 'UNKNOWN'),
      });
    }
    
    return {
      initialized: true,
      canTokenize: minLength > 0,
      tokenCount: minLength,
      sampleTokens,
    };
  } catch (error) {
    return {
      initialized: false,
      canTokenize: false,
      tokenCount: 0,
      sampleTokens: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

