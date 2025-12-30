'use client';

import { useEffect, useRef } from 'react';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { BinderItem } from '@/lib/binder/types';
import { removeItemFromTree, createBinderItemFromNote, addItemToTree, moveItemInTree } from '../utils/binderStateUtils';

interface NoteContextMenuProps {
  noteId: string;
  noteName: string;
  position: { x: number; y: number };
  onClose: () => void;
  onStructureChange: () => void;
  onStructureUpdate?: (
    updateFn: (current: BinderItem[]) => BinderItem[],
    syncFn: () => Promise<Response>,
    errorMessage?: string
  ) => Promise<void>;
  onNoteSelect?: () => void;
  isAtRoot?: boolean;
}

export default function NoteContextMenu({
  noteId,
  noteName,
  position,
  onClose,
  onStructureChange,
  onStructureUpdate,
  onNoteSelect,
  isAtRoot = false,
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

      // Create temporary note for optimistic update
      const tempId = `temp-${Date.now()}`;
      const tempNote = {
        id: tempId,
        user_id: session.user.id,
        title: null,
        body: '',
        diagnostics: null,
        folder_id: null,
        parent_note_id: noteId,
        position: 0,
        conversation_id: null,
        is_conversation: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (onStructureUpdate) {
        const tempItem = createBinderItemFromNote(tempNote);
        await onStructureUpdate(
          (current) => addItemToTree(current, tempItem, noteId, 'note', 0),
          async () => {
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
              throw new Error(errorData.error || 'Failed to create child note');
            }

            // Replace temp item with real note
            const newNote = await response.json();
            const realItem = createBinderItemFromNote(newNote);
            // Note: The update function will be called again, but we need to handle replacement
            // For now, we'll let the server sync handle it
            return response;
          },
          'Failed to create child note'
        );

        // Replace temp with real after successful creation
        // We need to reload to get the real note ID, or we could use the response
        // For simplicity, we'll reload the structure
        onStructureChange();
      } else {
        // Fallback to old behavior
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
      }

      onClose();
    } catch (err) {
      console.error('Error creating child note:', err);
      // Error is already handled by onStructureUpdate
    }
  };

  const handleMoveToRoot = async () => {
    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      if (onStructureUpdate) {
        // Optimistically move note to root
        await onStructureUpdate(
          (current) => {
            // Calculate position at root level
            const rootItemCount = current.filter(item => !item.parent_id).length;
            // Move item to root (null parent, position at end)
            return moveItemInTree(current, noteId, null, null, rootItemCount);
          },
          async () => {
            // First, get current structure to count root items for position
            const structureResponse = await fetch('/api/binder', { headers });
            if (!structureResponse.ok) {
              throw new Error('Failed to get binder structure');
            }
            const structureData = await structureResponse.json();
            const rootItemCount = structureData.items?.filter((item: BinderItem) => !item.parent_id).length || 0;

            // Move note to root
            const response = await fetch(`/api/notes/${noteId}/move`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                folder_id: null,
                parent_note_id: null,
                position: rootItemCount,
              }),
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to move note to root');
            }

            return response;
          },
          'Failed to move note to root'
        );
      } else {
        // Fallback to old behavior
        const structureResponse = await fetch('/api/binder', { headers });
        if (!structureResponse.ok) {
          alert('Failed to get binder structure');
          return;
        }
        const structureData = await structureResponse.json();
        const rootItemCount = structureData.items?.filter((item: BinderItem) => !item.parent_id).length || 0;

        const response = await fetch(`/api/notes/${noteId}/move`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            folder_id: null,
            parent_note_id: null,
            position: rootItemCount,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          alert(errorData.error || 'Failed to move note to root');
          return;
        }

        onStructureChange();
      }

      onClose();
    } catch (err) {
      console.error('Error moving note to root:', err);
      // Error is already handled by onStructureUpdate
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

      if (onStructureUpdate) {
        // Optimistically remove note from tree
        await onStructureUpdate(
          (current) => removeItemFromTree(current, noteId),
          () =>
            fetch(`/api/notes/${noteId}`, {
              method: 'DELETE',
              headers,
            }),
          'Failed to delete note'
        );
      } else {
        // Fallback to old behavior
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
      }

      onClose();
    } catch (err) {
      console.error('Error deleting note:', err);
      // Error is already handled by onStructureUpdate
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
      {!isAtRoot && (
        <>
          <div className="border-t border-gray-200 my-1" />
          <button
            onClick={handleMoveToRoot}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            Move to Root Level
          </button>
        </>
      )}
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
