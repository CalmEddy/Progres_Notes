'use client';

import { useEffect, useRef } from 'react';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { BinderItem } from '@/lib/binder/types';
import { updateFolderInTree, removeItemFromTree, createBinderItemFromFolder, addItemToTree, moveItemInTree } from '../utils/binderStateUtils';
import { BinderItem } from '@/lib/binder/types';

interface FolderContextMenuProps {
  folderId: string;
  folderName: string;
  position: { x: number; y: number };
  onClose: () => void;
  onStructureChange: () => void;
  onStructureUpdate?: (
    updateFn: (current: BinderItem[]) => BinderItem[],
    syncFn: () => Promise<Response>,
    errorMessage?: string
  ) => Promise<void>;
  isAtRoot?: boolean;
}

export default function FolderContextMenu({
  folderId,
  folderName,
  position,
  onClose,
  onStructureChange,
  onStructureUpdate,
  isAtRoot = false,
}: FolderContextMenuProps) {
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

  const handleRename = async () => {
    const newName = prompt('Enter new folder name:', folderName);
    if (!newName || newName.trim() === folderName) {
      onClose();
      return;
    }

    const trimmedName = newName.trim();

    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      if (onStructureUpdate) {
        // Optimistically update folder name
        await onStructureUpdate(
          (current) => updateFolderInTree(current, folderId, { name: trimmedName }),
          () =>
            fetch(`/api/folders/${folderId}`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({ name: trimmedName }),
            }),
          'Failed to rename folder'
        );
      } else {
        // Fallback to old behavior
        const response = await fetch(`/api/folders/${folderId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ name: trimmedName }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          alert(errorData.error || 'Failed to rename folder');
          return;
        }

        onStructureChange();
      }

      onClose();
    } catch (err) {
      console.error('Error renaming folder:', err);
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
        // Optimistically move folder to root
        await onStructureUpdate(
          (current) => {
            // Calculate position at root level
            const rootItemCount = current.filter(item => !item.parent_id).length;
            // Move folder to root (null parent, position at end)
            return moveItemInTree(current, folderId, null, null, rootItemCount);
          },
          async () => {
            // First, get current structure to count root items for position
            const structureResponse = await fetch('/api/binder', { headers });
            if (!structureResponse.ok) {
              throw new Error('Failed to get binder structure');
            }
            const structureData = await structureResponse.json();
            const rootItemCount = structureData.items?.filter((item: BinderItem) => !item.parent_id).length || 0;

            // Move folder to root
            const response = await fetch(`/api/folders/${folderId}/move`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                parent_id: null,
                position: rootItemCount,
              }),
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to move folder to root');
            }

            return response;
          },
          'Failed to move folder to root'
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

        const response = await fetch(`/api/folders/${folderId}/move`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            parent_id: null,
            position: rootItemCount,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          alert(errorData.error || 'Failed to move folder to root');
          return;
        }

        onStructureChange();
      }

      onClose();
    } catch (err) {
      console.error('Error moving folder to root:', err);
      // Error is already handled by onStructureUpdate
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${folderName}"?`)) {
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
        // Optimistically remove folder from tree
        // Note: This is simplified - in reality, folder deletion moves children to parent
        // For now, we'll just remove it optimistically and let the server handle children
        await onStructureUpdate(
          (current) => removeItemFromTree(current, folderId),
          () =>
            fetch(`/api/folders/${folderId}?moveChildrenToParent=true`, {
              method: 'DELETE',
              headers,
            }),
          'Failed to delete folder'
        );
        // After deletion, we should reload to get the correct structure with moved children
        onStructureChange();
      } else {
        // Fallback to old behavior
        const response = await fetch(`/api/folders/${folderId}?moveChildrenToParent=true`, {
          method: 'DELETE',
          headers,
        });

        if (!response.ok) {
          const errorData = await response.json();
          alert(errorData.error || 'Failed to delete folder');
          return;
        }

        onStructureChange();
      }

      onClose();
    } catch (err) {
      console.error('Error deleting folder:', err);
      // Error is already handled by onStructureUpdate
    }
  };

  const handleCreateSubfolder = async () => {
    const name = prompt('Enter subfolder name:');
    if (!name || !name.trim()) {
      onClose();
      return;
    }

    const folderName = name.trim();

    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Create temporary folder for optimistic update
      const tempId = `temp-${Date.now()}`;
      const tempFolder = {
        id: tempId,
        user_id: session.user.id,
        name: folderName,
        parent_id: folderId,
        position: 0, // Will be set by server
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (onStructureUpdate) {
        const tempItem = createBinderItemFromFolder(tempFolder);
        await onStructureUpdate(
          (current) => addItemToTree(current, tempItem, folderId, 'folder', 0),
          async () => {
            const response = await fetch('/api/folders', {
              method: 'POST',
              headers,
              body: JSON.stringify({ name: folderName, parent_id: folderId }),
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Failed to create subfolder');
            }

            return response;
          },
          'Failed to create subfolder'
        );
        // Reload to get the real folder ID and position
        onStructureChange();
      } else {
        // Fallback to old behavior
        const response = await fetch('/api/folders', {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: folderName, parent_id: folderId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          alert(errorData.error || 'Failed to create subfolder');
          return;
        }

        onStructureChange();
      }

      onClose();
    } catch (err) {
      console.error('Error creating subfolder:', err);
      // Error is already handled by onStructureUpdate
    }
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      <button
        onClick={handleRename}
        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors"
      >
        Rename
      </button>
      <button
        onClick={handleCreateSubfolder}
        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors"
      >
        Create Subfolder
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

