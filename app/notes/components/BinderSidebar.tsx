'use client';

import { useState, useCallback } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { BinderItem } from '@/lib/binder/types';
import { Note } from '@/lib/notes';
import BinderTree from './BinderTree';
import BinderSearch from './BinderSearch';

interface BinderSidebarProps {
  binderStructure: BinderItem[];
  selectedNoteId: string | null;
  onNoteSelect: (note: Note) => void;
  onStructureChange: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  loading: boolean;
  error: string | null;
}

export default function BinderSidebar({
  binderStructure,
  selectedNoteId,
  onNoteSelect,
  onStructureChange,
  collapsed,
  onToggleCollapse,
  loading,
  error,
}: BinderSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<BinderItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleCreateFolder = useCallback(async () => {
    const name = prompt('Enter folder name:');
    if (!name || !name.trim()) return;

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
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to create folder');
        return;
      }

      onStructureChange();
    } catch (err) {
      console.error('Error creating folder:', err);
      alert('Failed to create folder');
    }
  }, [onStructureChange]);

  const handleToggleFolder = useCallback((folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    const getAllFolderIds = (items: BinderItem[]): string[] => {
      const ids: string[] = [];
      items.forEach(item => {
        if (item.type === 'folder') {
          ids.push(item.id);
          if (item.children) {
            ids.push(...getAllFolderIds(item.children));
          }
        }
      });
      return ids;
    };
    setExpandedFolders(new Set(getAllFolderIds(binderStructure)));
  }, [binderStructure]);

  const handleCollapseAll = useCallback(() => {
    setExpandedFolders(new Set());
  }, []);

  const findItemById = useCallback((items: BinderItem[], id: string): BinderItem | null => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = findItemById(item.children, id);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    const item = findItemById(binderStructure, event.active.id as string);
    setDraggedItem(item);
  }, [binderStructure, findItemById]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveId(null);
    setDraggedItem(null);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const draggedItem = findItemById(binderStructure, active.id as string);
    if (!draggedItem) return;

    // Find target (could be a folder, note, or the root)
    let targetFolderId: string | null = null;
    let targetNoteId: string | null = null;
    
    if (over.id !== 'root') {
      const targetItem = findItemById(binderStructure, over.id as string);
      if (targetItem) {
        if (targetItem.type === 'folder') {
          targetFolderId = targetItem.id;
        } else if (targetItem.type === 'note') {
          targetNoteId = targetItem.id;
        }
      }
    }

    // Prevent moving item into itself or its descendants
    if (draggedItem.type === 'folder' && targetFolderId === draggedItem.id) {
      return;
    }
    if (draggedItem.type === 'note' && targetNoteId === draggedItem.id) {
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

      // Calculate new position (append to end for now)
      let newPosition = 0;
      if (targetFolderId) {
        const targetItems = binderStructure.filter(item => 
          item.parent_id === targetFolderId && item.parent_type === 'folder'
        );
        newPosition = targetItems.length;
      } else if (targetNoteId) {
        const targetItems = binderStructure.filter(item => 
          item.parent_id === targetNoteId && item.parent_type === 'note'
        );
        newPosition = targetItems.length;
      } else {
        // Root level
        const rootItems = binderStructure.filter(item => !item.parent_id);
        newPosition = rootItems.length;
      }

      if (draggedItem.type === 'folder') {
        await fetch(`/api/folders/${draggedItem.id}/move`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ parent_id: targetFolderId, position: newPosition }),
        });
      } else {
        // Note: can be moved to folder or note
        await fetch(`/api/notes/${draggedItem.id}/move`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ 
            folder_id: targetFolderId !== null ? targetFolderId : undefined,
            parent_note_id: targetNoteId !== null ? targetNoteId : undefined,
            position: newPosition 
          }),
        });
      }

      onStructureChange();
    } catch (err) {
      console.error('Error moving item:', err);
      alert('Failed to move item');
    }
  }, [binderStructure, findItemById, onStructureChange]);

  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="w-8 bg-white border-r border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
        title="Expand sidebar"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    );
  }

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900">Binder</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExpandAll}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Expand all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            onClick={handleCollapseAll}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Collapse all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Collapse sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <BinderSearch
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </div>

      {/* Actions */}
      <div className="px-4 py-2 border-b border-gray-200 flex-shrink-0">
        <button
          onClick={handleCreateFolder}
          className="w-full px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Folder
        </button>
      </div>

      {/* Tree */}
      <DroppableRoot>
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                <p className="text-sm text-gray-500">Loading...</p>
              </div>
            </div>
          ) : error ? (
            <div className="px-4 py-8">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          ) : (
            <BinderTree
              items={binderStructure}
              selectedNoteId={selectedNoteId}
              expandedFolders={expandedFolders}
              searchQuery={searchQuery}
              onNoteSelect={onNoteSelect}
              onToggleFolder={handleToggleFolder}
              onStructureChange={onStructureChange}
            />
          )}
          <DragOverlay>
            {draggedItem && (
              <div className="px-2 py-1.5 bg-white border border-gray-200 rounded shadow-lg flex items-center gap-2">
                <div className="w-4 flex-shrink-0">
                  {draggedItem.type === 'folder' ? (
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-700">{draggedItem.name}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </DroppableRoot>
    </div>
  );
}

// Component to make root area droppable
function DroppableRoot({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'root',
    data: {
      type: 'root',
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto min-h-0 ${isOver ? 'bg-blue-50' : ''}`}
    >
      {children}
    </div>
  );
}

