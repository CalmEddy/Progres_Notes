'use client';

import { Note } from '@/lib/notes';

interface NoteChildrenViewProps {
  parentNote: Note;
  children: Note[];
  onNoteSelect: (note: Note) => void;
  onCreateChildNote?: () => void;
}

export default function NoteChildrenView({
  parentNote,
  children,
  onNoteSelect,
  onCreateChildNote,
}: NoteChildrenViewProps) {
  if (children.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50">
        <div className="text-center max-w-md">
          <div className="inline-block p-4 bg-gray-100 rounded-full mb-4">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-500 text-lg mb-2">No nested notes</p>
          <p className="text-gray-400 text-sm mb-6">
            This note doesn't have any child notes yet.
          </p>
          {onCreateChildNote && (
            <button
              onClick={onCreateChildNote}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 mx-auto"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Child Note
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            {parentNote.title || 'Untitled Note'}
          </h2>
          <p className="text-sm text-gray-500">
            {children.length} {children.length === 1 ? 'child note' : 'child notes'}
          </p>
        </div>
        {onCreateChildNote && (
          <button
            onClick={onCreateChildNote}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Child Note
          </button>
        )}
      </div>

      {/* Grid View */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {children.map((note) => {
            const preview = note.body.length > 150 
              ? note.body.substring(0, 150) + '...' 
              : note.body;

            return (
              <div
                key={note.id}
                onClick={() => onNoteSelect(note)}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer h-full flex flex-col"
              >
                <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                  {note.title || 'Untitled Note'}
                </h3>
                <p className="text-sm text-gray-600 mb-4 line-clamp-3 flex-1">
                  {preview}
                </p>
                <div className="flex items-center justify-between text-xs text-gray-400 mt-auto pt-2 border-t border-gray-100">
                  <span>{new Date(note.created_at).toLocaleDateString()}</span>
                  {note.updated_at !== note.created_at && (
                    <span>Updated {new Date(note.updated_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

