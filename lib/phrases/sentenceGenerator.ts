import { getPhrasesByCategory, getAllPhrasesForUser } from './phraseStorage';
import { Phrase, PhraseCategory } from './types';

/**
 * Get a random phrase from an array
 */
function getRandomItem<T>(items: T[]): T | null {
  if (items.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * items.length);
  return items[randomIndex];
}

/**
 * Get phrases by category for sentence generation
 */
export async function getPhrasesByCategoryForGeneration(
  userId: string,
  category: PhraseCategory,
  limit: number = 50,
  accessToken?: string
): Promise<Phrase[]> {
  return await getPhrasesByCategory(userId, category, limit, accessToken);
}

/**
 * Generate a random sentence using phrases from different categories
 * 
 * @param userId - User ID
 * @param template - Optional template string with placeholders like {verb_phrase}, {noun_phrase}, etc.
 * @param accessToken - Optional access token for authenticated requests
 * @returns A generated sentence
 */
export async function generateRandomSentence(
  userId: string,
  template?: string,
  accessToken?: string
): Promise<string> {
  try {
    // If no template provided, use a default template
    if (!template) {
      template = '{verb_phrase} {noun_phrase}';
    }

    // Extract category placeholders from template
    const categoryPlaceholders: PhraseCategory[] = [];
    const matches = template.match(/\{(\w+)\}/g);
    
    if (matches) {
      for (const match of matches) {
        const category = match.slice(1, -1) as PhraseCategory;
        if (['idiom', 'compound_noun', 'verb_phrase', 'noun_phrase', 'adjective_phrase'].includes(category)) {
          categoryPlaceholders.push(category);
        }
      }
    }

    // Get phrases for each category
    const phraseMap: Record<string, Phrase | null> = {};
    
    for (const category of categoryPlaceholders) {
      const phrases = await getPhrasesByCategory(userId, category, 100, accessToken);
      phraseMap[category] = getRandomItem(phrases);
    }

    // Replace placeholders in template
    let sentence = template;
    for (const [category, phrase] of Object.entries(phraseMap)) {
      const placeholder = `{${category}}`;
      if (phrase) {
        sentence = sentence.replace(placeholder, phrase.phrase_text);
      } else {
        // If no phrase found, remove the placeholder
        sentence = sentence.replace(placeholder, '').trim();
      }
    }

    // Clean up extra spaces
    sentence = sentence.replace(/\s+/g, ' ').trim();

    // Capitalize first letter
    if (sentence.length > 0) {
      sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
    }

    return sentence || 'No phrases available for sentence generation.';
  } catch (error) {
    console.error('Error generating random sentence:', error);
    throw new Error(`Failed to generate sentence: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate multiple random sentences
 */
export async function generateRandomSentences(
  userId: string,
  count: number = 5,
  template?: string,
  accessToken?: string
): Promise<string[]> {
  const sentences: string[] = [];
  
  for (let i = 0; i < count; i++) {
    try {
      const sentence = await generateRandomSentence(userId, template, accessToken);
      sentences.push(sentence);
    } catch (error) {
      console.error(`Error generating sentence ${i + 1}:`, error);
    }
  }
  
  return sentences;
}

/**
 * Get phrase statistics for a user
 */
export async function getPhraseStatistics(
  userId: string,
  accessToken?: string
): Promise<{
  totalPhrases: number;
  byCategory: Record<PhraseCategory, number>;
}> {
  try {
    const allPhrases = await getAllPhrasesForUser(userId, undefined, accessToken);
    
    const byCategory: Record<PhraseCategory, number> = {
      idiom: 0,
      compound_noun: 0,
      verb_phrase: 0,
      noun_phrase: 0,
      adjective_phrase: 0,
    };

    for (const phrase of allPhrases) {
      if (phrase.category in byCategory) {
        byCategory[phrase.category as PhraseCategory]++;
      }
    }

    return {
      totalPhrases: allPhrases.length,
      byCategory,
    };
  } catch (error) {
    console.error('Error getting phrase statistics:', error);
    throw new Error(`Failed to get phrase statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

