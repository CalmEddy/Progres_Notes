'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Tag } from '@/lib/tags/types';
import TagChip from './TagChip';
import { createSupabaseClient } from '@/lib/supabaseClient';

interface TagSelectorProps {
  selectedTagIds: string[];
  onSelectionChange: (tagIds: string[]) => void;
  placeholder?: string;
  maxSuggestions?: number;
}

export default function TagSelector({
  selectedTagIds,
  onSelectionChange,
  placeholder = 'Type to search or create tags...',
  maxSuggestions = 10,
}: TagSelectorProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load all tags
  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/tags', { headers });
      if (response.ok) {
        const tags = await response.json();
        setAllTags(tags);
      }
    } catch (error) {
      console.error('Error loading tags:', error);
    }
  };

  // Filter suggestions based on input
  useEffect(() => {
    if (!inputValue.trim()) {
      // Show all unselected tags when input is empty
      const unselected = allTags.filter(tag => !selectedTagIds.includes(tag.id));
      setSuggestions(unselected.slice(0, maxSuggestions));
    } else {
      const searchLower = inputValue.toLowerCase();
      const matching = allTags.filter(
        tag =>
          !selectedTagIds.includes(tag.id) &&
          tag.name.toLowerCase().includes(searchLower)
      );
      setSuggestions(matching.slice(0, maxSuggestions));
    }
  }, [inputValue, allTags, selectedTagIds, maxSuggestions]);

  const selectedTags = allTags.filter(tag => selectedTagIds.includes(tag.id));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleInputBlur = () => {
    // Delay to allow click events to fire
    setTimeout(() => setIsOpen(false), 200);
  };

  const handleSelectTag = useCallback((tag: Tag) => {
    if (!selectedTagIds.includes(tag.id)) {
      onSelectionChange([...selectedTagIds, tag.id]);
    }
    setInputValue('');
    setIsOpen(false);
    inputRef.current?.focus();
  }, [selectedTagIds, onSelectionChange]);

  const handleRemoveTag = useCallback((tagId: string) => {
    onSelectionChange(selectedTagIds.filter(id => id !== tagId));
  }, [selectedTagIds, onSelectionChange]);

  const handleCreateTag = async () => {
    const tagName = inputValue.trim();
    if (!tagName) return;

    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/tags', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: tagName }),
      });

      if (response.ok) {
        const newTag = await response.json();
        await loadTags();
        handleSelectTag(newTag);
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to create tag');
      }
    } catch (error) {
      console.error('Error creating tag:', error);
      alert('Failed to create tag');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && e.key === 'ArrowDown') {
      setIsOpen(true);
      return;
    }

    if (isOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSelectTag(suggestions[highlightedIndex]);
        } else if (inputValue.trim() && suggestions.length === 0) {
          // Create new tag if no suggestions
          handleCreateTag();
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        setInputValue('');
      }
    }

    if (e.key === 'Backspace' && inputValue === '' && selectedTagIds.length > 0) {
      // Remove last tag on backspace when input is empty
      handleRemoveTag(selectedTagIds[selectedTagIds.length - 1]);
    }
  };

  return (
    <div className="relative w-full">
      {/* Selected tags */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {selectedTags.map(tag => (
          <TagChip
            key={tag.id}
            tag={tag}
            onRemove={() => handleRemoveTag(tag.id)}
            showRemove
            size="sm"
          />
        ))}
      </div>

      {/* Input and dropdown */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />

        {/* Dropdown */}
        {isOpen && (
          <div
            ref={dropdownRef}
            className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
          >
            {suggestions.length > 0 ? (
              <ul className="py-1">
                {suggestions.map((tag, index) => (
                  <li
                    key={tag.id}
                    className={`
                      px-3 py-2 cursor-pointer hover:bg-gray-100
                      ${highlightedIndex === index ? 'bg-gray-100' : ''}
                    `}
                    onClick={() => handleSelectTag(tag)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <TagChip tag={tag} size="sm" />
                  </li>
                ))}
              </ul>
            ) : inputValue.trim() ? (
              <div className="px-3 py-2 text-sm text-gray-600">
                <button
                  onClick={handleCreateTag}
                  className="w-full text-left hover:bg-gray-100 rounded px-2 py-1 flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create "{inputValue.trim()}"
                </button>
              </div>
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500">
                No tags available
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

