'use client';

import { useState, useEffect } from 'react';
import { Note } from '@/lib/notes';
import { FilterFolder } from '@/lib/filters/types';
import { createSupabaseClient } from '@/lib/supabaseClient';
import TagChip from './TagChip';
import { Tag } from '@/lib/tags/types';

interface FilteredNotesViewProps {
  filterFolder: FilterFolder;
  onNoteSelect?: (note: Note) => void;
  onClose?: () => void;
}

export default function FilteredNotesView({
  filterFolder,
  onNoteSelect,
  onClose,
}: FilteredNotesViewProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteTags, setNoteTags] = useState<Record<string, Tag[]>>({});

  useEffect(() => {
    loadFilteredNotes();
  }, [filterFolder.id]);

  const loadFilteredNotes = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('[FilteredNotesView] Loading filtered notes for folder:', filterFolder.id, filterFolder.name);
      console.log('[FilteredNotesView] Filter conditions:', JSON.stringify(filterFolder.filter_conditions, null, 2));

      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('[FilteredNotesView] No session found');
        setError('Not authenticated');
        return;
      }

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      console.log('[FilteredNotesView] Calling API endpoint:', `/api/filter-folders/${filterFolder.id}/execute`);

      const response = await fetch(`/api/filter-folders/${filterFolder.id}/execute`, {
        method: 'POST',
        headers,
      });

      console.log('[FilteredNotesView] API response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[FilteredNotesView] API error:', errorData);
        throw new Error(errorData.error || 'Failed to execute filter');
      }

      const data = await response.json();
      console.log('[FilteredNotesView] API returned', data.notes?.length || 0, 'notes');
      if (data.debug) {
        console.log('[FilteredNotesView] DEBUG INFO:', JSON.stringify(data.debug, null, 2));
      }
      setNotes(data.notes || []);

      // Use tags from API response (already loaded in bulk by the database function)
      const tagsMap: Record<string, Tag[]> = {};
      if (data.noteTags) {
        for (const [noteId, tags] of Object.entries(data.noteTags)) {
          tagsMap[noteId] = (tags as any[]) || [];
        }
      }
      setNoteTags(tagsMap);
    } catch (err) {
      console.error('Error loading filtered notes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load filtered notes');
    } finally {
      setLoading(false);
    }
  };

  const formatConditionSummary = () => {
    return filterFolder.filter_conditions.map((condition, index) => {
      switch (condition.type) {
        case 'keyword':
          return `${condition.operator === 'contains' ? 'Contains' : 'Does not contain'} "${condition.value}"`;
        case 'embedding':
          return `Semantically similar to "${condition.query}"`;
        case 'date_created':
        case 'date_modified':
          const dateType = condition.type === 'date_created' ? 'Created' : 'Modified';
          if (condition.operator === 'equals') {
            return `${dateType} on ${condition.value}`;
          } else if (condition.operator === 'range') {
            return `${dateType} between ${condition.startDate} and ${condition.endDate}`;
          } else {
            return `${dateType} ${condition.relativeValue}`;
          }
        case 'tag':
          return `Has tag${condition.operator === 'in' ? 's' : ''}: ${condition.tagIds.length} tag(s)`;
        case 'text_pattern':
          return `Contains pattern "${condition.pattern}"`;
        default:
          return 'Unknown condition';
      }
    }).join(' AND ');
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading filtered notes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-md">
            <p className="text-red-700">{error}</p>
            <button
              onClick={loadFilteredNotes}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <svg
              className="w-6 h-6 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <h2 className="text-2xl font-bold text-gray-900">{filterFolder.name}</h2>
          </div>
          <div className="text-sm text-gray-600">
            <p className="mb-1">
              <span className="font-medium">{notes.length}</span> note{notes.length !== 1 ? 's' : ''} found
            </p>
            <p className="text-xs text-gray-500">
              {formatConditionSummary()}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {notes.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg font-medium mb-2">No notes found</p>
            <p className="text-sm">No notes match the filter criteria.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {notes.map((note) => (
              <div key={note.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <h3
                    className="text-lg font-semibold text-gray-900 cursor-pointer hover:text-blue-600"
                    onClick={() => onNoteSelect?.(note)}
                  >
                    {note.title || 'Untitled Note'}
                  </h3>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>{new Date(note.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-3 line-clamp-3">{note.body}</p>
                {noteTags[note.id] && noteTags[note.id].length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {noteTags[note.id].map((tag) => (
                      <TagChip key={tag.id} tag={tag} size="sm" />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

