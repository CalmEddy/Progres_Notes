'use client';

import { useState } from 'react';
import { Note } from '@/lib/notes';
import { Phrase } from '@/lib/phrases/types';
import PhraseTags from './PhraseTags';
import EditNoteModal from './EditNoteModal';

interface NoteCardProps {
  note: Note;
  phrases?: Phrase[];
  onEdit?: (noteId: string, title: string | null, body: string) => Promise<void>;
  onPhraseClick?: (phrase: Phrase) => void;
  showFullContent?: boolean;
  similarity?: number;
}

const TRUNCATE_LENGTH = 200;

export default function NoteCard({
  note,
  phrases = [],
  onEdit,
  onPhraseClick,
  showFullContent = false,
  similarity,
}: NoteCardProps) {
  const [isExpanded, setIsExpanded] = useState(showFullContent);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const shouldTruncate = !isExpanded && note.body.length > TRUNCATE_LENGTH;
  const displayBody = shouldTruncate
    ? `${note.body.substring(0, TRUNCATE_LENGTH)}...`
    : note.body;

  const handleEdit = async (noteId: string, title: string | null, body: string) => {
    if (onEdit) {
      setIsEditing(true);
      try {
        await onEdit(noteId, title, body);
        setIsEditModalOpen(false);
      } finally {
        setIsEditing(false);
      }
    }
  };

  const similarityPercent = similarity ? (similarity * 100).toFixed(1) : null;
  const similarityColor = similarity
    ? similarity > 0.85
      ? 'bg-green-100 text-green-700'
      : similarity > 0.75
      ? 'bg-blue-100 text-blue-700'
      : 'bg-yellow-100 text-yellow-700'
    : null;

  return (
    <>
      <div className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all duration-200 bg-white">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            {note.title && (
              <h3 className="font-bold text-lg mb-2 text-gray-900">{note.title}</h3>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {new Date(note.created_at).toLocaleDateString()}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {similarityPercent && (
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${similarityColor}`}>
                {similarityPercent}% match
              </span>
            )}
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

        {/* Body */}
        <p className="text-gray-700 mb-4 whitespace-pre-wrap leading-relaxed">
          {displayBody}
        </p>

        {/* Expand/Collapse */}
        {note.body.length > TRUNCATE_LENGTH && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-4"
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        )}

        {/* Phrases */}
        {phrases && phrases.length > 0 && (
          <div className="pt-4 border-t border-gray-100">
            <div className="mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Phrases ({phrases.length})
              </span>
            </div>
            <PhraseTags
              phrases={phrases}
              onPhraseClick={onPhraseClick}
              maxDisplay={10}
            />
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {onEdit && (
        <EditNoteModal
          note={note}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleEdit}
        />
      )}
    </>
  );
}

