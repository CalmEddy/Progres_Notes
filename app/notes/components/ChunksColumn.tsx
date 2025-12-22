'use client';

import { useState, useEffect } from 'react';
import { NoteChunk } from '@/lib/chunks/chunking';
import { createSupabaseClient } from '@/lib/supabaseClient';

interface ChunksColumnProps {
  noteId: string;
  selectedChunkId: string | null;
  onChunkSelect: (chunk: NoteChunk) => void;
}

export default function ChunksColumn({
  noteId,
  selectedChunkId,
  onChunkSelect,
}: ChunksColumnProps) {
  const [chunks, setChunks] = useState<NoteChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadChunks();
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
        <h2 className="text-sm font-semibold text-gray-700">
          Chunks ({chunks.length})
        </h2>
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
                <button
                  key={chunk.id}
                  onClick={() => onChunkSelect(chunk)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                    isSelected
                      ? 'bg-blue-50 border-l-4 border-blue-500'
                      : 'border-l-4 border-transparent'
                  }`}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

