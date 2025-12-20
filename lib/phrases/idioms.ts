/**
 * Curated list of common idioms for phrase extraction
 * This list can be expanded over time
 */
export const COMMON_IDIOMS: string[] = [
  // Action and behavior idioms
  'shoot the breeze',
  'take action',
  'break the ice',
  'hit the nail on the head',
  'burn the midnight oil',
  'go the extra mile',
  'jump on the bandwagon',
  'pull strings',
  'rock the boat',
  'spill the beans',
  'throw in the towel',
  'turn a blind eye',
  'bite the bullet',
  'call it a day',
  'cut corners',
  'get the ball rolling',
  'go back to the drawing board',
  'hit the road',
  'keep an eye on',
  'let the cat out of the bag',
  'make a long story short',
  'on cloud nine',
  'once in a blue moon',
  'piece of cake',
  'pull someone\'s leg',
  'rain cats and dogs',
  'see eye to eye',
  'speak of the devil',
  'the ball is in your court',
  'the best of both worlds',
  'the elephant in the room',
  'under the weather',
  'when pigs fly',
  'you can\'t have your cake and eat it too',
  
  // Time and opportunity idioms
  'in the nick of time',
  'time flies',
  'kill two birds with one stone',
  'strike while the iron is hot',
  'better late than never',
  
  // Communication idioms
  'beat around the bush',
  'get straight to the point',
  'read between the lines',
  'speak your mind',
  'word of mouth',
  
  // Success and failure idioms
  'hit the jackpot',
  'miss the boat',
  'back to square one',
  'on top of the world',
  'down in the dumps',
];

/**
 * Normalize idiom text for matching (lowercase, trim)
 */
export function normalizeIdiom(idiom: string): string {
  return idiom.toLowerCase().trim();
}

/**
 * Check if a text segment matches any known idiom
 * Returns the matched idiom if found, null otherwise
 */
export function matchIdiom(text: string): string | null {
  const normalizedText = normalizeIdiom(text);
  
  for (const idiom of COMMON_IDIOMS) {
    const normalizedIdiom = normalizeIdiom(idiom);
    if (normalizedText === normalizedIdiom) {
      return idiom;
    }
  }
  
  return null;
}

/**
 * Find all idioms in a text string
 * Returns an array of matched idioms with their positions
 */
export function findIdiomsInText(text: string): Array<{ idiom: string; startIndex: number; endIndex: number }> {
  const matches: Array<{ idiom: string; startIndex: number; endIndex: number }> = [];
  const lowerText = text.toLowerCase();
  
  for (const idiom of COMMON_IDIOMS) {
    const normalizedIdiom = normalizeIdiom(idiom);
    const index = lowerText.indexOf(normalizedIdiom);
    
    if (index !== -1) {
      matches.push({
        idiom,
        startIndex: index,
        endIndex: index + normalizedIdiom.length,
      });
    }
  }
  
  return matches;
}

