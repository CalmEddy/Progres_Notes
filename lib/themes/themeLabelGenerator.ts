import { getNLP } from '../phrases/nlpClient';
import { NoteChunk } from '../chunks/chunking';

// Import winkNLP helpers
const its = require('wink-nlp/src/its.js');

/**
 * Common stop words to filter out when extracting keywords
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'up', 'about', 'into', 'through', 'during', 'including', 'against', 'among', 'throughout',
  'despite', 'towards', 'upon', 'concerning', 'to', 'of', 'in', 'for', 'on', 'at', 'by', 'with',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'should', 'could', 'may', 'might', 'must', 'can', 'cannot'
]);

/**
 * Normalize POS tag from winkNLP to standard format
 */
function normalizePOSTag(winkTag: string): string {
  if (!winkTag) return 'UNKNOWN';
  
  const upperTag = winkTag.toUpperCase();
  const baseTag = upperTag.split('_')[0];
  
  const tagMap: Record<string, string> = {
    'NOUN': 'NOUN',
    'PROPN': 'NOUN',
    'VERB': 'VERB',
    'ADJ': 'ADJ',
    'ADV': 'ADV',
    'DET': 'DET',
    'PREP': 'PREP',
    'ADP': 'PREP',
  };
  
  return tagMap[baseTag] || baseTag;
}

/**
 * Extract keywords from text using winkNLP
 * Returns noun phrases, compound nouns, and significant terms
 */
function extractKeywords(text: string): Array<{ phrase: string; score: number; category: string }> {
  const keywords: Array<{ phrase: string; score: number; category: string }> = [];
  const seenPhrases = new Set<string>();

  try {
    const nlp = getNLP();
    const doc = nlp.readDoc(text);

    const tokenTexts = doc.tokens().out(its.text);
    const posTags = doc.tokens().out(its.pos);

    if (!tokenTexts || !posTags || tokenTexts.length === 0) {
      return keywords;
    }

    const tokens: Array<{ text: string; pos: string }> = [];
    const minLength = Math.min(tokenTexts.length, posTags.length);

    for (let i = 0; i < minLength; i++) {
      const tokenText = String(tokenTexts[i] || '').trim().toLowerCase();
      const posTag = String(posTags[i] || '');
      const normalizedPos = normalizePOSTag(posTag);

      if (tokenText && !STOP_WORDS.has(tokenText)) {
        tokens.push({
          text: tokenText,
          pos: normalizedPos,
        });
      }
    }

    // Extract noun phrases: NOUN-PREP-NOUN, NOUN-PREP-DET-NOUN
    for (let i = 0; i <= tokens.length - 3; i++) {
      // NOUN-PREP-NOUN
      if (i + 2 < tokens.length &&
          tokens[i].pos === 'NOUN' &&
          tokens[i + 1].pos === 'PREP' &&
          tokens[i + 2].pos === 'NOUN') {
        const phrase = `${tokens[i].text} ${tokens[i + 1].text} ${tokens[i + 2].text}`;
        const normalized = phrase.toLowerCase();
        if (!seenPhrases.has(normalized)) {
          seenPhrases.add(normalized);
          keywords.push({
            phrase: phrase,
            score: 3.0, // High score for noun phrases
            category: 'noun_phrase',
          });
        }
      }

      // NOUN-PREP-DET-NOUN
      if (i + 3 < tokens.length &&
          tokens[i].pos === 'NOUN' &&
          tokens[i + 1].pos === 'PREP' &&
          tokens[i + 2].pos === 'DET' &&
          tokens[i + 3].pos === 'NOUN') {
        const phrase = `${tokens[i].text} ${tokens[i + 1].text} ${tokens[i + 2].text} ${tokens[i + 3].text}`;
        const normalized = phrase.toLowerCase();
        if (!seenPhrases.has(normalized)) {
          seenPhrases.add(normalized);
          keywords.push({
            phrase: phrase,
            score: 3.5, // Higher score for extended noun phrases
            category: 'noun_phrase',
          });
        }
      }
    }

    // Extract compound nouns: NOUN-NOUN
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i].pos === 'NOUN' && tokens[i + 1].pos === 'NOUN') {
        const phrase = `${tokens[i].text} ${tokens[i + 1].text}`;
        const normalized = phrase.toLowerCase();
        if (!seenPhrases.has(normalized) && phrase.length >= 3 && phrase.length <= 30) {
          seenPhrases.add(normalized);
          keywords.push({
            phrase: phrase,
            score: 2.5, // Good score for compound nouns
            category: 'compound_noun',
          });
        }
      }
    }

    // Extract ADJ-NOUN phrases
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i].pos === 'ADJ' && tokens[i + 1].pos === 'NOUN') {
        const phrase = `${tokens[i].text} ${tokens[i + 1].text}`;
        const normalized = phrase.toLowerCase();
        if (!seenPhrases.has(normalized) && phrase.length >= 3 && phrase.length <= 30) {
          seenPhrases.add(normalized);
          keywords.push({
            phrase: phrase,
            score: 2.0, // Decent score for adjective-noun
            category: 'adjective_phrase',
          });
        }
      }
    }

    // Extract significant single nouns (not in stop words, longer than 3 chars)
    for (const token of tokens) {
      if (token.pos === 'NOUN' && 
          token.text.length > 3 && 
          !STOP_WORDS.has(token.text) &&
          !seenPhrases.has(token.text)) {
        seenPhrases.add(token.text);
        keywords.push({
          phrase: token.text,
          score: 1.0, // Lower score for single nouns
          category: 'noun',
        });
      }
    }

  } catch (error) {
    console.error('Error extracting keywords:', error);
  }

  return keywords;
}

/**
 * Capitalize first letter of each word in a phrase
 */
function capitalizePhrase(phrase: string): string {
  return phrase
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate a theme label from note title or chunks
 * 
 * @param noteTitle - The note title (nullable)
 * @param chunks - Array of note chunks
 * @returns A theme label (5-10 words)
 */
export async function generateThemeLabel(
  noteTitle: string | null,
  chunks: NoteChunk[]
): Promise<string> {
  // Step 1: Check if note title is suitable (target: 5-10 words for medium length)
  let titleToEnhance: string | null = null;
  
  if (noteTitle && noteTitle.trim().length > 0) {
    const trimmedTitle = noteTitle.trim();
    const wordCount = trimmedTitle.split(/\s+/).length;
    
    // Use title directly if it's 5-10 words (ideal medium length)
    if (wordCount >= 5 && wordCount <= 10) {
      return trimmedTitle;
    }
    // Use title if it's 3-4 words (can enhance with keywords)
    else if (wordCount >= 3 && wordCount < 5) {
      titleToEnhance = trimmedTitle;
    }
    // Use title if it's 11-15 words (user likely crafted it, accept as-is)
    else if (wordCount >= 11 && wordCount <= 15) {
      return trimmedTitle;
    }
    // Title too short (< 3 words) or too long (> 15 words), extract keywords instead
    else {
      noteTitle = null;
    }
  }

  // Step 2: Extract keywords from chunks
  if (chunks.length === 0) {
    return 'Note Theme'; // Fallback
  }

  // Combine all chunk text
  const combinedText = chunks
    .map(chunk => chunk.chunk_text)
    .join(' ')
    .trim();

  if (combinedText.length === 0) {
    return 'Note Theme'; // Fallback
  }

  // Extract keywords from all chunks, with position weighting
  // Earlier chunks may be more important (introduction/overview)
  const allKeywords: Array<{ phrase: string; score: number; category: string }> = [];
  
  chunks.forEach((chunk, chunkIndex) => {
    const keywords = extractKeywords(chunk.chunk_text);
    // Weight by position: earlier chunks get higher weight
    const positionWeight = 1.0 + (1.0 / (chunkIndex + 1));
    
    keywords.forEach(keyword => {
      // Check if we've seen this phrase before
      const existing = allKeywords.find(k => k.phrase.toLowerCase() === keyword.phrase.toLowerCase());
      if (existing) {
        // Increase score for repeated phrases
        existing.score += keyword.score * positionWeight;
      } else {
        allKeywords.push({
          phrase: keyword.phrase,
          score: keyword.score * positionWeight,
          category: keyword.category,
        });
      }
    });
  });

  // Sort by score (highest first)
  allKeywords.sort((a, b) => b.score - a.score);

  // Step 3: Generate label from top keywords
  if (allKeywords.length === 0) {
    // Fallback: use first few words of first chunk
    const firstChunkWords = chunks[0].chunk_text.split(/\s+/).slice(0, 8).join(' ');
    return firstChunkWords.length > 50 
      ? firstChunkWords.substring(0, 50) + '...'
      : firstChunkWords;
  }

  // Take top keywords/phrases (prioritize noun phrases and compound nouns)
  const topKeywords = allKeywords
    .filter(k => k.category === 'noun_phrase' || k.category === 'compound_noun' || k.category === 'adjective_phrase')
    .slice(0, 5);

  // If we don't have enough phrases, add single nouns
  if (topKeywords.length < 3) {
    const singleNouns = allKeywords
      .filter(k => k.category === 'noun')
      .slice(0, 5 - topKeywords.length);
    topKeywords.push(...singleNouns);
  }

  // Limit to top 5
  const selectedKeywords = topKeywords.slice(0, 5);

  if (selectedKeywords.length === 0) {
    // Fallback
    return 'Note Theme';
  }

  // Combine into readable label
  let label: string;
  
  // If we have a short title (3-4 words), enhance it with keywords
  if (titleToEnhance && selectedKeywords.length > 0) {
    const topKeyword = capitalizePhrase(selectedKeywords[0].phrase);
    label = `${titleToEnhance} and ${topKeyword}`;
  } else if (selectedKeywords.length === 1) {
    label = capitalizePhrase(selectedKeywords[0].phrase);
  } else if (selectedKeywords.length === 2) {
    label = `${capitalizePhrase(selectedKeywords[0].phrase)} and ${capitalizePhrase(selectedKeywords[1].phrase)}`;
  } else if (selectedKeywords.length === 3) {
    label = `${capitalizePhrase(selectedKeywords[0].phrase)}, ${capitalizePhrase(selectedKeywords[1].phrase)}, and ${capitalizePhrase(selectedKeywords[2].phrase)}`;
  } else {
    // For 4+ keywords, create a more structured label
    const firstThree = selectedKeywords.slice(0, 3).map(k => capitalizePhrase(k.phrase));
    label = `${firstThree.join(', ')}, and Related Topics`;
  }

  // Ensure label is between 5-10 words (target: medium length)
  const words = label.split(/\s+/);
  if (words.length > 10) {
    // Truncate to 10 words intelligently (try to keep complete phrases)
    let truncated = words.slice(0, 10).join(' ');
    // Remove trailing incomplete words if it ends mid-phrase
    if (truncated.length < label.length) {
      // Check if we cut off in the middle of a meaningful phrase
      const lastWord = words[9];
      if (lastWord && lastWord.length < 3) {
        // Remove very short trailing word
        truncated = words.slice(0, 9).join(' ');
      }
    }
    label = truncated;
  } else if (words.length < 5 && selectedKeywords.length > 1 && !titleToEnhance) {
    // If too short and no title, try to add more context
    const additional = selectedKeywords.slice(3, 5).map(k => capitalizePhrase(k.phrase));
    if (additional.length > 0) {
      const currentWords = label.split(/\s+/);
      if (currentWords.length + additional[0].split(/\s+/).length <= 10) {
        label = `${label} and ${additional[0]}`;
        // Re-check length
        const newWords = label.split(/\s+/);
        if (newWords.length > 10) {
          label = newWords.slice(0, 10).join(' ');
        }
      }
    }
  }

  return label;
}

