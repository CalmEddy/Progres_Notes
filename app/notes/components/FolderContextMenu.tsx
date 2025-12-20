'use client';

import { useEffect, useRef } from 'react';
import { createSupabaseClient } from '@/lib/supabaseClient';

interface FolderContextMenuProps {
  folderId: string;
  folderName: string;
  position: { x: number; y: number };
  onClose: () => void;
  onStructureChange: () => void;
}

export default function FolderContextMenu({
  folderId,
  folderName,
  position,
  onClose,
  onStructureChange,
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

    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/folders/${folderId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ name: newName.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to rename folder');
        return;
      }

      onStructureChange();
      onClose();
    } catch (err) {
      console.error('Error renaming folder:', err);
      alert('Failed to rename folder');
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
      onClose();
    } catch (err) {
      console.error('Error deleting folder:', err);
      alert('Failed to delete folder');
    }
  };

  const handleCreateSubfolder = async () => {
    const name = prompt('Enter subfolder name:');
    if (!name || !name.trim()) {
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

      const response = await fetch('/api/folders', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: name.trim(), parent_id: folderId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to create subfolder');
        return;
      }

      onStructureChange();
      onClose();
    } catch (err) {
      console.error('Error creating subfolder:', err);
      alert('Failed to create subfolder');
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

