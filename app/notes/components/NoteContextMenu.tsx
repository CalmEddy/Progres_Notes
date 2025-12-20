'use client';

import { useEffect, useRef } from 'react';
import { createSupabaseClient } from '@/lib/supabaseClient';

interface NoteContextMenuProps {
  noteId: string;
  noteName: string;
  position: { x: number; y: number };
  onClose: () => void;
  onStructureChange: () => void;
  onNoteSelect?: () => void;
}

export default function NoteContextMenu({
  noteId,
  noteName,
  position,
  onClose,
  onStructureChange,
  onNoteSelect,
}: NoteContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleCreateChildNote = async () => {
    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/notes', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: null,
          body: '',
          parent_note_id: noteId,
          position: 0,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to create child note');
        return;
      }

      onStructureChange();
      onClose();
    } catch (err) {
      console.error('Error creating child note:', err);
      alert('Failed to create child note');
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${noteName}"?`)) {
      onClose();
      return;
    }

    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to delete note');
        return;
      }

      onStructureChange();
      onClose();
    } catch (err) {
      console.error('Error deleting note:', err);
      alert('Failed to delete note');
    }
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      {onNoteSelect && (
        <>
          <button
            onClick={() => {
              onNoteSelect();
              onClose();
            }}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Open
          </button>
          <div className="border-t border-gray-200 my-1" />
        </>
      )}
      <button
        onClick={handleCreateChildNote}
        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors"
      >
        Create Child Note
      </button>
      <div className="border-t border-gray-200 my-1" />
      <button
        onClick={handleDelete}
        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
      >
        Delete
      </button>
    </div>
  );
}

