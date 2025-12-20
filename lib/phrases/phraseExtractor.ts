import { getNLP } from './nlpClient';
import { matchIdiom, findIdiomsInText } from './idioms';
import { ExtractedPhrase, PhraseCategory } from './types';

// Import winkNLP helpers for accessing token properties
const its = require('wink-nlp/src/its.js');

/**
 * POS pattern definitions for meaningful phrase extraction
 * Patterns are defined as arrays of POS tags
 */
interface POSPattern {
  pattern: string[];
  category: PhraseCategory;
  minLength: number;
  maxLength: number;
}

const POS_PATTERNS: POSPattern[] = [
  // Verb phrases: VERB-DET-NOUN (e.g., "shoot the breeze", "take action")
  {
    pattern: ['VERB', 'DET', 'NOUN'],
    category: 'verb_phrase',
    minLength: 3,
    maxLength: 3,
  },
  // Noun phrases: NOUN-PREP-NOUN (e.g., "man of action", "home on the range")
  {
    pattern: ['NOUN', 'PREP', 'NOUN'],
    category: 'noun_phrase',
    minLength: 3,
    maxLength: 3,
  },
  // Extended noun phrases: NOUN-PREP-DET-NOUN
  {
    pattern: ['NOUN', 'PREP', 'DET', 'NOUN'],
    category: 'noun_phrase',
    minLength: 4,
    maxLength: 4,
  },
  // Compound nouns: NOUN-NOUN (e.g., "coffee cup", "apple pie")
  {
    pattern: ['NOUN', 'NOUN'],
    category: 'compound_noun',
    minLength: 2,
    maxLength: 2,
  },
  // Adjective-noun: ADJ-NOUN (e.g., "alpha male")
  {
    pattern: ['ADJ', 'NOUN'],
    category: 'adjective_phrase',
    minLength: 2,
    maxLength: 2,
  },
  // Extended adjective phrases: ADJ-ADJ-NOUN (e.g., "hot coffee cup")
  {
    pattern: ['ADJ', 'ADJ', 'NOUN'],
    category: 'adjective_phrase',
    minLength: 3,
    maxLength: 3,
  },
  // ADJ-NOUN-NOUN (e.g., "hot coffee cup")
  {
    pattern: ['ADJ', 'NOUN', 'NOUN'],
    category: 'compound_noun',
    minLength: 3,
    maxLength: 3,
  },
];

/**
 * Map winkNLP POS tags to our standardized POS tags
 * winkNLP uses tags like: NOUN, PROPN, VERB, ADJ, ADV, DET, ADP (adposition/preposition), etc.
 */
function normalizePOSTag(winkTag: string): string {
  if (!winkTag) return 'UNKNOWN';
  
  const upperTag = winkTag.toUpperCase();
  
  // Map winkNLP tags to our standard tags
  const tagMap: Record<string, string> = {
    // Nouns
    'NOUN': 'NOUN',
    'PROPN': 'NOUN', // Proper noun treated as noun
    'NN': 'NOUN',
    'NNS': 'NOUN',
    'NNP': 'NOUN',
    'NNPS': 'NOUN',
    
    // Verbs
    'VERB': 'VERB',
    'VB': 'VERB',
    'VBD': 'VERB',
    'VBG': 'VERB',
    'VBN': 'VERB',
    'VBP': 'VERB',
    'VBZ': 'VERB',
    
    // Adjectives
    'ADJ': 'ADJ',
    'JJ': 'ADJ',
    'JJR': 'ADJ',
    'JJS': 'ADJ',
    
    // Adverbs
    'ADV': 'ADV',
    'RB': 'ADV',
    'RBR': 'ADV',
    'RBS': 'ADV',
    
    // Determiners
    'DET': 'DET',
    'DT': 'DET',
    'PDT': 'DET',
    'WDT': 'DET',
    
    // Prepositions/Adpositions
    'PREP': 'PREP',
    'ADP': 'PREP',
    'IN': 'PREP',
    'TO': 'PREP',
    
    // Pronouns
    'PRON': 'PRON',
    'PRP': 'PRON',
    'PRP$': 'PRON',
    'WP': 'PRON',
    'WP$': 'PRON',
    
    // Conjunctions
    'CONJ': 'CONJ',
    'CC': 'CONJ',
    'CCONJ': 'CONJ',
    
    // Numbers
    'NUM': 'NUM',
    'CD': 'NUM',
  };
  
  // Check direct mapping first
  if (tagMap[upperTag]) {
    return tagMap[upperTag];
  }
  
  // Extract base tag (winkNLP may return tags like "NOUN_SING" or "VERB_PAST")
  const baseTag = upperTag.split('_')[0];
  if (tagMap[baseTag]) {
    return tagMap[baseTag];
  }
  
  // Return original if no mapping found
  return baseTag;
}

/**
 * Extract phrases from text using POS pattern matching, idiom detection, and compound noun detection
 */
export function extractPhrases(text: string): ExtractedPhrase[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const phrases: ExtractedPhrase[] = [];
  const seenPhrases = new Set<string>();

  try {
    const nlp = getNLP();
    const doc = nlp.readDoc(text);

    // Get tokens with POS tags using the correct winkNLP API
    const tokens: Array<{ text: string; pos: string }> = [];
    
    try {
      // Use the correct winkNLP API: tokens().out(its.text) and tokens().out(its.pos)
      const tokenTexts = doc.tokens().out(its.text);
      const posTags = doc.tokens().out(its.pos);
      
      // Verify we got data
      if (!tokenTexts || !posTags) {
        console.error('winkNLP failed to extract tokens or POS tags');
        console.error('Token texts:', tokenTexts);
        console.error('POS tags:', posTags);
        return phrases; // Return empty phrases array
      }
      
      // Ensure arrays are the same length
      const minLength = Math.min(tokenTexts.length, posTags.length);
      
      for (let i = 0; i < minLength; i++) {
        const tokenText = String(tokenTexts[i] || '').trim();
        const posTag = String(posTags[i] || '');
        const normalizedPos = normalizePOSTag(posTag);
        
        if (tokenText) {
          tokens.push({
            text: tokenText,
            pos: normalizedPos,
          });
        }
      }
      
      // Debug: Log first few tokens if verbose (can be enabled via environment)
      if (process.env.DEBUG_PHRASES === 'true' && tokens.length > 0) {
        console.log('Sample tokens extracted:', tokens.slice(0, 10).map(t => `${t.text}(${t.pos})`).join(' '));
      }
      
      // Warn if no tokens were extracted
      if (tokens.length === 0) {
        console.warn('Warning: No tokens extracted from text. Text length:', text.length);
        console.warn('Sample text:', text.substring(0, 100));
        return phrases; // Return empty phrases array
      }
    } catch (tokenError) {
      console.error('Error extracting tokens with winkNLP API:', tokenError);
      if (tokenError instanceof Error) {
        console.error('Error stack:', tokenError.stack);
      }
      // Return empty phrases array - don't try fallback as it likely won't work either
      return phrases;
    }

    // 1. Check for idioms first (most specific)
    const idiomMatches = findIdiomsInText(text);
    for (const match of idiomMatches) {
      const normalized = match.idiom.toLowerCase().trim();
      if (!seenPhrases.has(normalized)) {
        seenPhrases.add(normalized);
        phrases.push({
          text: match.idiom,
          category: 'idiom',
          posPattern: 'IDIOM',
        });
      }
    }

    // 2. Apply POS patterns
    for (const posPattern of POS_PATTERNS) {
      for (let i = 0; i <= tokens.length - posPattern.minLength; i++) {
        const window = tokens.slice(i, i + posPattern.maxLength);
        
        // Check if window matches pattern
        if (window.length >= posPattern.minLength && window.length <= posPattern.maxLength) {
          const matchesPattern = posPattern.pattern.every(
            (expectedPos, idx) => idx < window.length && window[idx].pos === expectedPos
          );

          if (matchesPattern) {
            // Extract the phrase text
            const phraseText = window
              .slice(0, posPattern.pattern.length)
              .map(t => t.text)
              .join(' ')
              .trim();

            // Skip if too short or too long
            if (phraseText.length < 3 || phraseText.length > 50) {
              continue;
            }

            const normalized = phraseText.toLowerCase().trim();
            
            // Skip if already seen (from idiom detection or previous pattern match)
            if (!seenPhrases.has(normalized)) {
              seenPhrases.add(normalized);
              phrases.push({
                text: phraseText,
                category: posPattern.category,
                posPattern: posPattern.pattern.join('-'),
              });
            }
          }
        }
      }
    }

    // 3. Detect additional compound nouns (NOUN-NOUN sequences not caught by patterns)
    // This catches cases like "coffee cup" that might be split differently
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i].pos === 'NOUN' && tokens[i + 1].pos === 'NOUN') {
        const phraseText = `${tokens[i].text} ${tokens[i + 1].text}`.trim();
        const normalized = phraseText.toLowerCase().trim();
        
        if (!seenPhrases.has(normalized) && phraseText.length >= 3 && phraseText.length <= 50) {
          seenPhrases.add(normalized);
          phrases.push({
            text: phraseText,
            category: 'compound_noun',
            posPattern: 'NOUN-NOUN',
          });
        }
      }
    }

    // 4. Detect ADJ-NOUN sequences (additional adjective phrases)
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i].pos === 'ADJ' && tokens[i + 1].pos === 'NOUN') {
        const phraseText = `${tokens[i].text} ${tokens[i + 1].text}`.trim();
        const normalized = phraseText.toLowerCase().trim();
        
        if (!seenPhrases.has(normalized) && phraseText.length >= 3 && phraseText.length <= 50) {
          seenPhrases.add(normalized);
          phrases.push({
            text: phraseText,
            category: 'adjective_phrase',
            posPattern: 'ADJ-NOUN',
          });
        }
      }
    }

  } catch (error) {
    console.error('Error extracting phrases:', error);
    // Return empty array on error rather than throwing
    // This ensures note creation doesn't fail if phrase extraction fails
  }

  return phrases;
}

/**
 * Normalize phrase text for storage (lowercase, trim)
 */
export function normalizePhraseText(text: string): string {
  return text.toLowerCase().trim();
}

