import { getTagsForNote, listTagsForUser, getNotesWithTag as getNotesWithTagFunc } from './tags';
import { searchNotesForUser, Note } from '../notes';
import { extractPhrases } from '../phrases/phraseExtractor';
import { Tag } from './types';

/**
 * Suggest tags for a note based on:
 * 1. Existing tags on similar notes (using embeddings)
 * 2. Common phrases in the note content
 * 3. Most frequently used tags by the user
 */
export async function suggestTagsForNote(
  noteId: string,
  noteContent: { title: string | null; body: string },
  userId: string,
  accessToken?: string,
  maxSuggestions: number = 5
): Promise<Tag[]> {
  const suggestions: Map<string, { tag: Tag; score: number }> = new Map();

  // Get all user tags
  const allTags = await listTagsForUser(userId, accessToken);
  const tagMap = new Map(allTags.map(tag => [tag.id, tag]));

  // Strategy 1: Find similar notes and suggest their tags
  const searchText = noteContent.title 
    ? `${noteContent.title}\n\n${noteContent.body}`.trim()
    : noteContent.body.trim();

  if (searchText.length > 0) {
    try {
      const similarNotes = await searchNotesForUser(
        userId,
        searchText,
        0.7, // threshold
        10,  // max notes
        accessToken
      );

      // Count tag frequency from similar notes
      for (const similarNote of similarNotes.slice(0, 5)) { // Top 5 similar
        const tags = await getTagsForNote(similarNote.id, userId, accessToken);
        for (const tag of tags) {
          const existing = suggestions.get(tag.id);
          if (existing) {
            existing.score += 1.0; // Boost score for each similar note
          } else {
            suggestions.set(tag.id, { tag, score: 1.0 });
          }
        }
      }
    } catch (error) {
      console.error('Error finding similar notes for tag suggestion:', error);
      // Continue with other strategies
    }
  }

  // Strategy 2: Extract phrases and match against tag names
  const fullText = searchText.toLowerCase();
  for (const tag of allTags) {
    const tagNameLower = tag.name.toLowerCase();
    // Check if tag name appears in note content
    if (fullText.includes(tagNameLower)) {
      const existing = suggestions.get(tag.id);
      if (existing) {
        existing.score += 2.0; // High score for direct match
      } else {
        suggestions.set(tag.id, { tag, score: 2.0 });
      }
    }

    // Check if tag name is similar to extracted phrases
    try {
      const phrases = extractPhrases(searchText);
      for (const phrase of phrases) {
        if (phrase.toLowerCase().includes(tagNameLower) || 
            tagNameLower.includes(phrase.toLowerCase())) {
          const existing = suggestions.get(tag.id);
          if (existing) {
            existing.score += 1.5;
          } else {
            suggestions.set(tag.id, { tag, score: 1.5 });
          }
        }
      }
    } catch (error) {
      // Continue if phrase extraction fails
    }
  }

  // Strategy 3: Boost frequently used tags
  // Get tag usage counts
  const tagUsageCounts = new Map<string, number>();
  for (const tag of allTags) {
    try {
      const notesWithTag = await getNotesWithTagFunc(tag.id, userId, accessToken);
      tagUsageCounts.set(tag.id, notesWithTag.length);
    } catch (error) {
      tagUsageCounts.set(tag.id, 0);
    }
  }

  // Boost tags that are used frequently (but not too much to avoid bias)
  const maxUsage = Math.max(...Array.from(tagUsageCounts.values()), 1);
  for (const [tagId, usage] of tagUsageCounts) {
    if (usage > 0) {
      const existing = suggestions.get(tagId);
      const usageScore = (usage / maxUsage) * 0.5; // Max 0.5 boost
      if (existing) {
        existing.score += usageScore;
      } else if (usageScore > 0.3) { // Only suggest if usage is significant
        suggestions.set(tagId, { tag: tagMap.get(tagId)!, score: usageScore });
      }
    }
  }

  // Sort by score and return top suggestions
  const sortedSuggestions = Array.from(suggestions.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSuggestions)
    .map(item => item.tag);

  return sortedSuggestions;
}


