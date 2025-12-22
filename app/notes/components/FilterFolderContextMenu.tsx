'use client';

import { useEffect, useRef } from 'react';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { BinderItem } from '@/lib/binder/types';
import { removeItemFromTree } from '../utils/binderStateUtils';

interface FilterFolderContextMenuProps {
  filterFolderId: string;
  filterFolderName: string;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit: (filterFolderId: string) => void;
  onStructureChange: () => void;
  onStructureUpdate?: (
    updateFn: (current: BinderItem[]) => BinderItem[],
    syncFn: () => Promise<Response>,
    errorMessage?: string
  ) => Promise<void>;
}

export default function FilterFolderContextMenu({
  filterFolderId,
  filterFolderName,
  position,
  onClose,
  onEdit,
  onStructureChange,
  onStructureUpdate,
}: FilterFolderContextMenuProps) {
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

  const handleEdit = () => {
    onEdit(filterFolderId);
    onClose();
  };

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete filter folder "${filterFolderName}"?`)) {
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
        // Optimistically remove filter folder from tree
        await onStructureUpdate(
          (current) => removeItemFromTree(current, filterFolderId),
          () =>
            fetch(`/api/filter-folders/${filterFolderId}`, {
              method: 'DELETE',
              headers,
            }),
          'Failed to delete filter folder'
        );
      } else {
        // Fallback to old behavior
        const response = await fetch(`/api/filter-folders/${filterFolderId}`, {
          method: 'DELETE',
          headers,
        });

        if (!response.ok) {
          const errorData = await response.json();
          alert(errorData.error || 'Failed to delete filter folder');
          return;
        }

        onStructureChange();
      }

      onClose();
    } catch (err) {
      console.error('Error deleting filter folder:', err);
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
        onClick={handleEdit}
        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Edit Filter
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

