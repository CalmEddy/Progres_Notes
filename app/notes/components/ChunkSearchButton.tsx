'use client';

import { useState } from 'react';
import { NoteChunk } from '@/lib/chunks/chunking';

interface ChunkSearchButtonProps {
  chunk: NoteChunk;
  noteId: string;
  onSearch: (chunkId: string, scope: 'all' | 'note') => void;
}

export default function ChunkSearchButton({
  chunk,
  noteId,
  onSearch,
}: ChunkSearchButtonProps) {
  const [showMenu, setShowMenu] = useState(false);

  const handleSearch = (scope: 'all' | 'note') => {
    onSearch(chunk.id, scope);
    setShowMenu(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
        title="Find similar chunks"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>
      
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
            <button
              onClick={() => handleSearch('note')}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg"
            >
              Find similar in this note
            </button>
            <button
              onClick={() => handleSearch('all')}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 last:rounded-b-lg"
            >
              Find similar in all notes
            </button>
          </div>
        </>
      )}
    </div>
  );
}

