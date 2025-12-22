'use client';

import { useState, useEffect } from 'react';
import { Tag } from '@/lib/tags/types';
import TagChip from './TagChip';
import { createSupabaseClient } from '@/lib/supabaseClient';

interface TagSuggestionsProps {
  noteId: string;
  noteTitle: string | null;
  noteBody: string;
  currentTagIds: string[];
  onTagAccept: (tagId: string) => void;
  onDismiss?: () => void;
}

export default function TagSuggestions({
  noteId,
  noteTitle,
  noteBody,
  currentTagIds,
  onTagAccept,
  onDismiss,
}: TagSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSuggestions();
  }, [noteId, noteTitle, noteBody]);

  const loadSuggestions = async () => {
    try {
      setLoading(true);
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/tags/suggest', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          noteId,
          title: noteTitle,
          body: noteBody,
        }),
      });

      if (response.ok) {
        const suggestedTags = await response.json();
        // Filter out tags that are already assigned
        const filtered = suggestedTags.filter((tag: Tag) => !currentTagIds.includes(tag.id));
        setSuggestions(filtered);
      }
    } catch (error) {
      console.error('Error loading tag suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-blue-900">Suggested Tags</span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            Dismiss
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((tag) => (
          <button
            key={tag.id}
            onClick={() => onTagAccept(tag.id)}
            className="transition-transform hover:scale-105"
          >
            <TagChip tag={tag} size="sm" />
            <span className="ml-1 text-blue-600 text-xs">+</span>
          </button>
        ))}
      </div>
    </div>
  );
}

