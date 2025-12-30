'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { NoteChunk } from '@/lib/chunks/chunking';
import { createSupabaseClient } from '@/lib/supabaseClient';

interface ChunkEditorProps {
  noteId: string;
  chunks: NoteChunk[];
  onChunksChange?: (chunks: NoteChunk[]) => void;
  onNoteUpdate?: () => void;
}

export default function ChunkEditor({
  noteId,
  chunks: initialChunks,
  onChunksChange,
  onNoteUpdate,
}: ChunkEditorProps) {
  const [chunks, setChunks] = useState<NoteChunk[]>(initialChunks);
  const [editingChunkId, setEditingChunkId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingChunkId, setSavingChunkId] = useState<string | null>(null);
  const [deletingChunkId, setDeletingChunkId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Update chunks when initialChunks prop changes
  useEffect(() => {
    setChunks(initialChunks);
  }, [initialChunks]);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      debounceTimers.current.forEach(timer => clearTimeout(timer));
      debounceTimers.current.clear();
    };
  }, []);

  const getAuthHeaders = useCallback(async () => {
    const supabase = createSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }, []);

  const handleChunkEdit = useCallback((chunkId: string, newText: string) => {
    // Optimistic update
    setChunks(prevChunks =>
      prevChunks.map(chunk =>
        chunk.id === chunkId ? { ...chunk, chunk_text: newText } : chunk
      )
    );

    // Clear existing debounce timer for this chunk
    const existingTimer = debounceTimers.current.get(chunkId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer
    const timer = setTimeout(async () => {
      try {
        setSavingChunkId(chunkId);
        setError(null);

        const headers = await getAuthHeaders();
        const response = await fetch(`/api/chunks/${chunkId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ chunk_text: newText }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update chunk');
        }

        const updatedChunk = await response.json();
        
        // Update chunks with server response
        setChunks(prevChunks =>
          prevChunks.map(chunk =>
            chunk.id === chunkId ? updatedChunk : chunk
          )
        );

        // Notify parent of changes
        if (onChunksChange) {
          setChunks(currentChunks => {
            const updated = currentChunks.map(chunk =>
              chunk.id === chunkId ? updatedChunk : chunk
            );
            onChunksChange(updated);
            return updated;
          });
        }

        // Notify that note was updated
        if (onNoteUpdate) {
          onNoteUpdate();
        }
      } catch (err) {
        console.error('Error saving chunk:', err);
        setError(err instanceof Error ? err.message : 'Failed to save chunk');
        
        // Rollback optimistic update
        setChunks(prevChunks =>
          prevChunks.map(chunk =>
            chunk.id === chunkId
              ? initialChunks.find(c => c.id === chunkId) || chunk
              : chunk
          )
        );
      } finally {
        setSavingChunkId(null);
        debounceTimers.current.delete(chunkId);
      }
    }, 500); // 500ms debounce

    debounceTimers.current.set(chunkId, timer);
  }, [getAuthHeaders, onChunksChange, onNoteUpdate, initialChunks]);

  const handleChunkDelete = useCallback(async (chunkId: string) => {
    if (!confirm('Are you sure you want to delete this chunk?')) {
      return;
    }

    // Store chunk for potential rollback
    const chunkToDelete = chunks.find(c => c.id === chunkId);
    if (!chunkToDelete) return;

    try {
      setDeletingChunkId(chunkId);
      setError(null);

      // Optimistic update - remove chunk from UI
      setChunks(prevChunks => prevChunks.filter(chunk => chunk.id !== chunkId));

      const headers = await getAuthHeaders();
      const response = await fetch(`/api/chunks/${chunkId}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete chunk');
      }

      // Reload chunks to get updated indices
      const chunksResponse = await fetch(`/api/notes/${noteId}/chunks`, { headers });
      if (chunksResponse.ok) {
        const updatedChunks = await chunksResponse.json();
        setChunks(updatedChunks);
        if (onChunksChange) {
          onChunksChange(updatedChunks);
        }
      }

      // Notify that note was updated
      if (onNoteUpdate) {
        onNoteUpdate();
      }
    } catch (err) {
      console.error('Error deleting chunk:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete chunk');
      
      // Rollback optimistic update
      setChunks(prevChunks => {
        const updated = [...prevChunks, chunkToDelete].sort(
          (a, b) => a.chunk_index - b.chunk_index
        );
        return updated;
      });
    } finally {
      setDeletingChunkId(null);
    }
  }, [chunks, noteId, getAuthHeaders, onChunksChange, onNoteUpdate]);

  const handleStartEdit = useCallback((chunk: NoteChunk) => {
    setEditingChunkId(chunk.id);
    setEditText(chunk.chunk_text);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingChunkId(null);
    setEditText('');
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingChunkId && editText.trim()) {
      handleChunkEdit(editingChunkId, editText.trim());
      setEditingChunkId(null);
      setEditText('');
    }
  }, [editingChunkId, editText, handleChunkEdit]);

  if (chunks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg font-medium mb-2">No chunks found</p>
        <p className="text-sm">This note has not been chunked yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        </div>
      )}

      {chunks.map((chunk, index) => (
        <div
          key={chunk.id}
          className="border border-gray-200 rounded-lg p-4 bg-white hover:border-gray-300 transition-colors"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                Chunk {index + 1}
              </span>
              {savingChunkId === chunk.id && (
                <span className="text-xs text-blue-600 flex items-center gap-1">
                  <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {editingChunkId !== chunk.id && (
                <>
                  <button
                    onClick={() => handleStartEdit(chunk)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Edit chunk"
                    disabled={savingChunkId === chunk.id || deletingChunkId === chunk.id}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleChunkDelete(chunk.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete chunk"
                    disabled={savingChunkId === chunk.id || deletingChunkId === chunk.id}
                  >
                    {deletingChunkId === chunk.id ? (
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {editingChunkId === chunk.id ? (
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y min-h-[100px]"
                placeholder="Edit chunk text..."
                autoFocus
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editText.trim()}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="prose max-w-none">
              <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                {chunk.chunk_text}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

