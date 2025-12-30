'use client';

import { useState, useEffect, useCallback } from 'react';
import { Note } from '@/lib/notes';
import { Phrase } from '@/lib/phrases/types';
import { Tag } from '@/lib/tags/types';
import { NoteChunk } from '@/lib/chunks/chunking';
import PhraseTags from './PhraseTags';
import EditNoteModal from './EditNoteModal';
import NoteChildrenView from './NoteChildrenView';
import TagChip from './TagChip';
import TagSelector from './TagSelector';
import ChunkEditor from './ChunkEditor';
import { createSupabaseClient } from '@/lib/supabaseClient';

interface NoteEditorProps {
  note: Note | null;
  childNotes?: Note[];
  phrases?: Phrase[];
  tags?: Tag[];
  onEdit?: (noteId: string, title: string | null, body: string) => Promise<void>;
  onTagsChange?: (noteId: string, tagIds: string[]) => Promise<void>;
  onPhraseClick?: (phrase: Phrase) => void;
  onNoteSelect?: (note: Note) => void;
  onCreateChildNote?: () => void;
}

export default function NoteEditor({
  note,
  childNotes = [],
  phrases = [],
  tags = [],
  onEdit,
  onTagsChange,
  onPhraseClick,
  onNoteSelect,
  onCreateChildNote,
}: NoteEditorProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'content' | 'children' | 'chunks' | null>(null);
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [chunks, setChunks] = useState<NoteChunk[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [chunksError, setChunksError] = useState<string | null>(null);

  // Update selected tag IDs when tags prop changes
  useEffect(() => {
    if (note) {
      setSelectedTagIds(tags.map(tag => tag.id));
    }
  }, [tags, note?.id]);

  // Reset view mode when note changes
  useEffect(() => {
    setViewMode(null);
    setChunks([]);
    setChunksError(null);
  }, [note?.id]);

  // Load chunks when switching to chunks view
  const loadChunks = useCallback(async () => {
    if (!note) return;

    try {
      setLoadingChunks(true);
      setChunksError(null);

      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setChunksError('Not authenticated');
        return;
      }

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/notes/${note.id}/chunks`, { headers });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load chunks');
      }

      const loadedChunks = await response.json();
      setChunks(loadedChunks);
    } catch (err) {
      console.error('Error loading chunks:', err);
      setChunksError(err instanceof Error ? err.message : 'Failed to load chunks');
    } finally {
      setLoadingChunks(false);
    }
  }, [note]);

  // Load chunks when switching to chunks view
  useEffect(() => {
    if (viewMode === 'chunks' && note) {
      loadChunks();
    }
  }, [viewMode, note, loadChunks]);

  // Reload chunks after note is edited
  const handleNoteEdit = useCallback(async (noteId: string, title: string | null, body: string) => {
    if (onEdit) {
      await onEdit(noteId, title, body);
      // Reload chunks if in chunks view
      if (viewMode === 'chunks') {
        await loadChunks();
      }
    }
  }, [onEdit, viewMode, loadChunks]);

  // Handle chunk updates - refresh note data
  const handleChunksChange = useCallback((updatedChunks: NoteChunk[]) => {
    setChunks(updatedChunks);
  }, []);

  const handleNoteUpdate = useCallback(() => {
    // Note was updated via chunk edit, refresh chunks to get latest state
    if (viewMode === 'chunks' && note) {
      loadChunks();
    }
  }, [viewMode, note, loadChunks]);

  if (!note) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="inline-block p-4 bg-gray-100 rounded-full mb-4">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-500 text-lg">Select a note to view</p>
        </div>
      </div>
    );
  }

  const hasChildren = childNotes.length > 0;
  // Default to children view if note has children, otherwise content view
  const currentViewMode = viewMode ?? (hasChildren ? 'children' : 'content');
  
  // Show chunks view if selected
  if (currentViewMode === 'chunks') {
    return (
      <>
        <div className="h-full flex flex-col bg-white">
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <div className="flex-1">
              {note.title && (
                <h2 className="text-2xl font-bold text-gray-900 mb-1">{note.title}</h2>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('content')}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                title="View note content"
              >
                View Note
              </button>
              {onEdit && (
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Edit note"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Chunks Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {loadingChunks ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-gray-600">Loading chunks...</p>
                </div>
              </div>
            ) : chunksError ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="text-red-700 text-sm">{chunksError}</span>
                </div>
              </div>
            ) : (
              <ChunkEditor
                noteId={note.id}
                chunks={chunks}
                onChunksChange={handleChunksChange}
                onNoteUpdate={handleNoteUpdate}
              />
            )}
          </div>
        </div>

        {/* Edit Modal */}
        {onEdit && (
          <EditNoteModal
            note={note}
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            onSave={handleNoteEdit}
          />
        )}
      </>
    );
  }

  // If note has children, show children view by default (Scrivener behavior)
  if (hasChildren && currentViewMode === 'children') {
    return (
      <NoteChildrenView
        parentNote={note}
        children={childNotes}
        onNoteSelect={onNoteSelect || (() => {})}
        onCreateChildNote={onCreateChildNote}
      />
    );
  }

  return (
    <>
      <div className="h-full flex flex-col bg-white">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex-1">
            {note.title && (
              <h2 className="text-2xl font-bold text-gray-900 mb-1">{note.title}</h2>
            )}
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {new Date(note.created_at).toLocaleDateString()}
              </div>
              {note.updated_at !== note.created_at && (
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Updated {new Date(note.updated_at).toLocaleDateString()}
                </div>
              )}
            </div>

            {/* Tags Section */}
            <div className="mt-3">
              {!isEditingTags ? (
                <div className="flex items-center gap-2 flex-wrap">
                  {tags.length > 0 ? (
                    tags.map(tag => (
                      <TagChip
                        key={tag.id}
                        tag={tag}
                        size="sm"
                        onClick={() => {
                          // TODO: Filter by tag
                          console.log('Filter by tag:', tag.name);
                        }}
                      />
                    ))
                  ) : null}
                  {onTagsChange && (
                    <button
                      onClick={() => setIsEditingTags(true)}
                      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      {tags.length === 0 ? 'Add tags' : 'Edit tags'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <TagSelector
                    selectedTagIds={selectedTagIds}
                    onSelectionChange={async (newTagIds) => {
                      setSelectedTagIds(newTagIds);
                      if (onTagsChange && note) {
                        try {
                          await onTagsChange(note.id, newTagIds);
                          setIsEditingTags(false);
                        } catch (err) {
                          console.error('Error updating tags:', err);
                          // Revert on error
                          setSelectedTagIds(tags.map(t => t.id));
                        }
                      }
                    }}
                    placeholder="Type to search or create tags..."
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => {
                        setSelectedTagIds(tags.map(t => t.id));
                        setIsEditingTags(false);
                      }}
                      className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasChildren && (
              <button
                onClick={() => setViewMode(currentViewMode === 'children' ? 'content' : 'children')}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                title={currentViewMode === 'children' ? 'View content' : 'View children'}
              >
                {currentViewMode === 'children' ? 'View Content' : 'View Children'}
              </button>
            )}
            <button
              onClick={() => setViewMode('chunks')}
              className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
              title="View chunks"
            >
              View Chunks
            </button>
            {onEdit && (
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Edit note"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="prose max-w-none">
            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
              {note.body}
            </p>
          </div>

          {/* Phrases */}
          {phrases && phrases.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="mb-3">
                <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  Phrases ({phrases.length})
                </span>
              </div>
              <PhraseTags
                phrases={phrases}
                onPhraseClick={onPhraseClick}
                maxDisplay={20}
              />
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {onEdit && (
        <EditNoteModal
          note={note}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleNoteEdit}
        />
      )}
    </>
  );
}

