'use client';

import { Phrase, PhraseCategory } from '@/lib/phrases/types';

interface PhraseTagsProps {
  phrases: Phrase[];
  onPhraseClick?: (phrase: Phrase) => void;
  maxDisplay?: number;
  showCategory?: boolean;
}

const categoryColors: Record<PhraseCategory, string> = {
  idiom: 'bg-purple-100 text-purple-700 border-purple-200',
  compound_noun: 'bg-blue-100 text-blue-700 border-blue-200',
  verb_phrase: 'bg-green-100 text-green-700 border-green-200',
  noun_phrase: 'bg-orange-100 text-orange-700 border-orange-200',
  adjective_phrase: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

const categoryLabels: Record<PhraseCategory, string> = {
  idiom: 'Idiom',
  compound_noun: 'Compound',
  verb_phrase: 'Verb',
  noun_phrase: 'Noun',
  adjective_phrase: 'Adj',
};

export default function PhraseTags({
  phrases,
  onPhraseClick,
  maxDisplay,
  showCategory = false,
}: PhraseTagsProps) {
  if (!phrases || phrases.length === 0) {
    return null;
  }

  // Group phrases by category
  const phrasesByCategory: Record<PhraseCategory, Phrase[]> = {
    idiom: [],
    compound_noun: [],
    verb_phrase: [],
    noun_phrase: [],
    adjective_phrase: [],
  };

  phrases.forEach((phrase) => {
    if (phrase.category in phrasesByCategory) {
      phrasesByCategory[phrase.category].push(phrase);
    }
  });

  // Flatten and limit if needed
  let displayPhrases = phrases;
  if (maxDisplay && phrases.length > maxDisplay) {
    displayPhrases = phrases.slice(0, maxDisplay);
  }

  const handlePhraseClick = (phrase: Phrase) => {
    if (onPhraseClick) {
      onPhraseClick(phrase);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {displayPhrases.map((phrase) => {
        const colorClass = categoryColors[phrase.category] || 'bg-gray-100 text-gray-700 border-gray-200';
        const categoryLabel = categoryLabels[phrase.category] || phrase.category;
        
        return (
          <button
            key={phrase.id}
            onClick={() => handlePhraseClick(phrase)}
            className={`
              px-2 py-1 rounded-md text-xs font-medium border
              ${colorClass}
              ${onPhraseClick ? 'hover:opacity-80 cursor-pointer transition-opacity' : 'cursor-default'}
            `}
            title={showCategory ? `${categoryLabel}: ${phrase.phrase_text}` : phrase.phrase_text}
          >
            {showCategory && (
              <span className="opacity-70 mr-1">{categoryLabel}:</span>
            )}
            {phrase.phrase_text}
          </button>
        );
      })}
      {maxDisplay && phrases.length > maxDisplay && (
        <span className="px-2 py-1 text-xs text-gray-500">
          +{phrases.length - maxDisplay} more
        </span>
      )}
    </div>
  );
}

/**
 * Grouped phrase display by category
 */
export function GroupedPhraseTags({
  phrases,
  onPhraseClick,
  collapsed = false,
}: {
  phrases: Phrase[];
  onPhraseClick?: (phrase: Phrase) => void;
  collapsed?: boolean;
}) {
  if (!phrases || phrases.length === 0) {
    return null;
  }

  // Group phrases by category
  const phrasesByCategory: Record<PhraseCategory, Phrase[]> = {
    idiom: [],
    compound_noun: [],
    verb_phrase: [],
    noun_phrase: [],
    adjective_phrase: [],
  };

  phrases.forEach((phrase) => {
    if (phrase.category in phrasesByCategory) {
      phrasesByCategory[phrase.category].push(phrase);
    }
  });

  const categoriesWithPhrases = Object.entries(phrasesByCategory).filter(
    ([, categoryPhrases]) => categoryPhrases.length > 0
  );

  if (categoriesWithPhrases.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {categoriesWithPhrases.map(([category, categoryPhrases]) => {
        const colorClass = categoryColors[category as PhraseCategory];
        const categoryLabel = categoryLabels[category as PhraseCategory];
        
        return (
          <div key={category} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${colorClass}`}>
                {categoryLabel} ({categoryPhrases.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 ml-1">
              {categoryPhrases.map((phrase) => (
                <button
                  key={phrase.id}
                  onClick={() => onPhraseClick?.(phrase)}
                  className={`
                    px-2 py-0.5 rounded text-xs border
                    ${colorClass}
                    ${onPhraseClick ? 'hover:opacity-80 cursor-pointer transition-opacity' : 'cursor-default'}
                  `}
                  title={phrase.phrase_text}
                >
                  {phrase.phrase_text}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

