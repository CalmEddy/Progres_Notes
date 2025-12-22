'use client';

import { useState, useCallback } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { BinderItem } from '@/lib/binder/types';
import { Note } from '@/lib/notes';
import { Tag } from '@/lib/tags/types';
import BinderTree from './BinderTree';
import BinderSearch from './BinderSearch';
import { moveItemInTree, createBinderItemFromFolder, addItemToTree } from '../utils/binderStateUtils';

interface BinderSidebarProps {
  binderStructure: BinderItem[];
  selectedNoteId: string | null;
  noteTags?: Record<string, Tag[]>;
  onNoteSelect: (note: Note) => void;
  onCreateFilterFolder?: () => void;
  onFilterFolderClick?: (filterFolderId: string) => void;
  onFilterFolderEdit?: (filterFolderId: string) => void;
  onStructureChange: () => void;
  onStructureUpdate?: (
    updateFn: (current: BinderItem[]) => BinderItem[],
    syncFn: () => Promise<Response>,
    errorMessage?: string
  ) => Promise<void>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  loading: boolean;
  error: string | null;
}

export default function BinderSidebar({
  binderStructure,
  selectedNoteId,
  noteTags = {},
  onNoteSelect,
  onCreateFilterFolder,
  onFilterFolderClick,
  onFilterFolderEdit,
  onStructureChange,
  onStructureUpdate,
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

      const folderName = name.trim();

      // Create temporary folder for optimistic update
      const tempId = `temp-${Date.now()}`;
      const tempFolder = {
        id: tempId,
        user_id: session.user.id,
        name: folderName,
        parent_id: null,
        position: binderStructure.filter(item => !item.parent_id).length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Optimistically add folder to tree
      const tempItem = createBinderItemFromFolder(tempFolder);
      if (onStructureUpdate) {
        await onStructureUpdate(
          (current) => addItemToTree(current, tempItem, null, null),
          () =>
            fetch('/api/folders', {
              method: 'POST',
              headers,
              body: JSON.stringify({ name: folderName }),
            }),
          'Failed to create folder'
        );
      } else {
        // Fallback to old behavior
        const response = await fetch('/api/folders', {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: folderName }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          alert(errorData.error || 'Failed to create folder');
          return;
        }
        onStructureChange();
      }
    } catch (err) {
      console.error('Error creating folder:', err);
      // Error is already handled by onStructureUpdate
    }
  }, [binderStructure, onStructureChange, onStructureUpdate]);

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

  // Re-export findItemById for use in handleDragStart (it needs access to current binderStructure)
  const findItemByIdInCurrentStructure = useCallback((id: string) => {
    return findItemById(binderStructure, id);
  }, [binderStructure, findItemById]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    const item = findItemByIdInCurrentStructure(event.active.id as string);
    setDraggedItem(item);
  }, [findItemByIdInCurrentStructure]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveId(null);
    setDraggedItem(null);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const draggedItem = findItemByIdInCurrentStructure(active.id as string);
    if (!draggedItem) return;

    // Prevent filter folders from being moved (they should always stay at root)
    if (draggedItem.type === 'filter_folder') {
      return;
    }

    // Find target (could be a folder, note, or the root)
    let targetFolderId: string | null = null;
    let targetNoteId: string | null = null;
    let targetParentType: 'folder' | 'note' | null = null;
    
    if (over.id !== 'root') {
      const targetItem = findItemByIdInCurrentStructure(over.id as string);
      if (targetItem) {
        if (targetItem.type === 'folder') {
          targetFolderId = targetItem.id;
          targetParentType = 'folder';
        } else if (targetItem.type === 'note') {
          targetNoteId = targetItem.id;
          targetParentType = 'note';
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

      if (onStructureUpdate) {
        // Use optimistic update
        const itemId = draggedItem.id;
        const newParentId = targetFolderId || targetNoteId || null;

        await onStructureUpdate(
          (current) => moveItemInTree(current, itemId, newParentId, targetParentType, newPosition),
          () => {
            if (draggedItem.type === 'folder') {
              return fetch(`/api/folders/${itemId}/move`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ parent_id: targetFolderId, position: newPosition }),
              });
            } else {
              return fetch(`/api/notes/${itemId}/move`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ 
                  folder_id: targetFolderId !== null ? targetFolderId : undefined,
                  parent_note_id: targetNoteId !== null ? targetNoteId : undefined,
                  position: newPosition 
                }),
              });
            }
          },
          'Failed to move item'
        );
      } else {
        // Fallback to old behavior
        if (draggedItem.type === 'folder') {
          await fetch(`/api/folders/${draggedItem.id}/move`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ parent_id: targetFolderId, position: newPosition }),
          });
        } else {
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
      }
    } catch (err) {
      console.error('Error moving item:', err);
      // Error is already handled by onStructureUpdate
    }
  }, [binderStructure, findItemByIdInCurrentStructure, onStructureChange, onStructureUpdate]);

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
      <div className="px-4 py-2 border-b border-gray-200 flex-shrink-0 space-y-2">
        <button
          onClick={handleCreateFolder}
          className="w-full px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Folder
        </button>
        {onCreateFilterFolder && (
          <button
            onClick={onCreateFilterFolder}
            className="w-full px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            New Filter Folder
          </button>
        )}
      </div>

      {/* Tree */}
      <DroppableRoot activeId={activeId}>
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
              noteTags={noteTags}
              onNoteSelect={onNoteSelect}
              onFilterFolderClick={onFilterFolderClick}
              onFilterFolderEdit={onFilterFolderEdit}
              onToggleFolder={handleToggleFolder}
              onStructureChange={onStructureChange}
              onStructureUpdate={onStructureUpdate}
            />
          )}
          <DragOverlay>
            {draggedItem && (
              <div className="px-3 py-2 bg-white border-2 border-blue-500 rounded-lg shadow-xl flex items-center gap-2 opacity-90">
                <div className="w-4 flex-shrink-0">
                  {draggedItem.type === 'folder' ? (
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-900">{draggedItem.name}</span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  {draggedItem.type === 'folder' ? 'Folder' : 'Note'}
                </span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </DroppableRoot>
    </div>
  );
}

// Component to make root area droppable
function DroppableRoot({ 
  children, 
  activeId 
}: { 
  children: React.ReactNode;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'root',
    data: {
      type: 'root',
    },
  });

  const isDragging = activeId !== null;

  return (
    <div
      ref={setNodeRef}
      className="flex-1 overflow-y-auto min-h-0 relative"
    >
      {/* Visible root drop zone that appears when dragging */}
      {isDragging && (
        <div
          className={`
            sticky top-0 z-10 mx-2 mt-2 mb-2 px-3 py-2 rounded-lg border-2 border-dashed
            transition-all duration-200
            ${isOver 
              ? 'bg-blue-100 border-blue-500 shadow-md' 
              : 'bg-gray-50 border-gray-300 opacity-60'
            }
          `}
        >
          <div className="flex items-center gap-2 text-sm">
            <svg 
              className={`w-4 h-4 ${isOver ? 'text-blue-600' : 'text-gray-400'}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className={isOver ? 'font-medium text-blue-900' : 'text-gray-600'}>
              {isOver ? 'Drop here to move to root level' : 'Move to root level'}
            </span>
          </div>
        </div>
      )}
      <div className={isDragging && !isOver ? 'opacity-40' : ''}>
        {children}
      </div>
    </div>
  );
}

