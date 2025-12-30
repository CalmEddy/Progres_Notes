'use client';

import { useState, useEffect } from 'react';
import { NoteChunk } from '@/lib/chunks/chunking';
import { createSupabaseClient } from '@/lib/supabaseClient';
import CollectionPicker from './CollectionPicker';
import ChunkSearchButton from './ChunkSearchButton';

interface ChunksColumnProps {
  noteId: string;
  selectedChunkId: string | null;
  onChunkSelect: (chunk: NoteChunk) => void;
  activeCollectionId?: string;
  onAddChunkToCollection?: (chunk: NoteChunk) => void;
  onChunkSearch?: (chunkId: string, scope: 'all' | 'note') => void;
}

interface NoteTheme {
  theme_label: string | null;
}

export default function ChunksColumn({
  noteId,
  selectedChunkId,
  onChunkSelect,
  activeCollectionId,
  onAddChunkToCollection,
  onChunkSearch,
}: ChunksColumnProps) {
  const [chunks, setChunks] = useState<NoteChunk[]>([]);
  const [theme, setTheme] = useState<NoteTheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedChunkForCollection, setSelectedChunkForCollection] = useState<NoteChunk | null>(null);

  useEffect(() => {
    loadChunks();
    loadTheme();
  }, [noteId]);

  const loadChunks = async () => {
    try {
      setLoading(true);
      setError(null);

      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/notes/${noteId}/chunks`, { headers });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load chunks');
      }

      const data = await response.json();
      setChunks(data || []);
    } catch (err) {
      console.error('Error loading chunks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chunks');
    } finally {
      setLoading(false);
    }
  };

  const loadTheme = async () => {
    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return;
      }

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Fetch theme from note_themes table
      const { data: themeData, error: themeError } = await supabase
        .from('note_themes')
        .select('theme_label')
        .eq('note_id', noteId)
        .maybeSingle();

      if (themeError) {
        // Theme might not exist, which is fine
        if (themeError.code !== 'PGRST116') {
          console.error('Error loading theme:', themeError);
        }
        setTheme(null);
        return;
      }

      setTheme(themeData ? { theme_label: themeData.theme_label } : null);
    } catch (err) {
      console.error('Error loading theme:', err);
      setTheme(null);
    }
  };

  // Get preview text for chunk (first 100 characters)
  const getChunkPreview = (chunkText: string): string => {
    const preview = chunkText.trim().substring(0, 100);
    return preview.length < chunkText.trim().length ? preview + '...' : preview;
  };

  if (loading) {
    return (
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Chunks</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
            <p className="text-sm text-gray-500">Loading chunks...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Chunks</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-sm text-red-600 mb-2">{error}</p>
            <button
              onClick={loadChunks}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">
          Chunks ({chunks.length})
        </h2>
        {theme?.theme_label && (
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            <span className="text-xs text-gray-600 font-medium">{theme.theme_label}</span>
          </div>
        )}
      </div>

      {/* Chunks List */}
      <div className="flex-1 overflow-y-auto">
        {chunks.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">
            <p>No chunks found for this note.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {chunks.map((chunk) => {
              const isSelected = chunk.id === selectedChunkId;
              return (
                <div
                  key={chunk.id}
                  className={`flex items-start gap-2 hover:bg-gray-50 transition-colors ${
                    isSelected
                      ? 'bg-blue-50 border-l-4 border-blue-500'
                      : 'border-l-4 border-transparent'
                  }`}
                >
                  <button
                    onClick={() => onChunkSelect(chunk)}
                    className="flex-1 text-left px-4 py-3"
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500">
                        Chunk {chunk.chunk_index + 1}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-3">
                      {getChunkPreview(chunk.chunk_text)}
                    </p>
                  </button>
                  <div className="flex items-center gap-1 px-2">
                    {onChunkSearch && (
                      <ChunkSearchButton
                        chunk={chunk}
                        noteId={noteId}
                        onSearch={onChunkSearch}
                      />
                    )}
                    {onAddChunkToCollection && (
                      <button
                        onClick={() => {
                          setSelectedChunkForCollection(chunk);
                          setPickerOpen(true);
                        }}
                        className="px-3 py-3 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Add to collection"
                      >
                        + Set
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Collection Picker Modal */}
      {onAddChunkToCollection && (
        <CollectionPicker
          isOpen={pickerOpen}
          onClose={() => {
            setPickerOpen(false);
            setSelectedChunkForCollection(null);
          }}
          onSelect={async (collectionId) => {
            if (selectedChunkForCollection) {
              try {
                const supabase = createSupabaseClient();
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                const headers: HeadersInit = { 'Content-Type': 'application/json' };
                if (session.access_token) {
                  headers['Authorization'] = `Bearer ${session.access_token}`;
                }

                const response = await fetch('/api/collection-binder-items', {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    collection_id: collectionId,
                    item_type: 'chunk_ref',
                    chunk_id: selectedChunkForCollection.id,
                  }),
                });

                if (response.ok) {
                  onAddChunkToCollection(selectedChunkForCollection);
                  setPickerOpen(false);
                  setSelectedChunkForCollection(null);
                } else {
                  const errorData = await response.json();
                  alert(errorData.error || 'Failed to add chunk to collection');
                }
              } catch (err) {
                console.error('Error adding chunk to collection:', err);
                alert('Failed to add chunk to collection');
              }
            }
          }}
          onCreateAndSelect={async (name) => {
            if (selectedChunkForCollection) {
              try {
                const supabase = createSupabaseClient();
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                const headers: HeadersInit = { 'Content-Type': 'application/json' };
                if (session.access_token) {
                  headers['Authorization'] = `Bearer ${session.access_token}`;
                }

                // Create collection
                const createResponse = await fetch('/api/collections', {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ name }),
                });

                if (!createResponse.ok) {
                  const errorData = await createResponse.json();
                  throw new Error(errorData.error || 'Failed to create collection');
                }

                const newCollection = await createResponse.json();

                // Add chunk to collection
                const addResponse = await fetch('/api/collection-binder-items', {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    collection_id: newCollection.id,
                    item_type: 'chunk_ref',
                    chunk_id: selectedChunkForCollection.id,
                  }),
                });

                if (addResponse.ok) {
                  onAddChunkToCollection(selectedChunkForCollection);
                  setPickerOpen(false);
                  setSelectedChunkForCollection(null);
                } else {
                  const errorData = await addResponse.json();
                  alert(errorData.error || 'Failed to add chunk to collection');
                }
              } catch (err) {
                console.error('Error creating collection and adding chunk:', err);
                alert(err instanceof Error ? err.message : 'Failed to create collection and add chunk');
              }
            }
          }}
        />
      )}
    </div>
  );
}

