'use client';

import { NoteChunk } from '@/lib/chunks/chunking';

interface ChunkContentColumnProps {
  chunk: NoteChunk;
}

export default function ChunkContentColumn({ chunk }: ChunkContentColumnProps) {
  return (
    <div className="flex-1 bg-white flex flex-col min-w-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">
              Chunk {chunk.chunk_index + 1}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {chunk.chunk_text.length} characters
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="prose prose-sm max-w-none">
          <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
            {chunk.chunk_text}
          </div>
        </div>
      </div>
    </div>
  );
}

