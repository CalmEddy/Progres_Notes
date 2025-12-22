'use client';

import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { BinderItem as BinderItemType } from '@/lib/binder/types';
import { Note } from '@/lib/notes';
import { Tag } from '@/lib/tags/types';
import FolderContextMenu from './FolderContextMenu';
import NoteContextMenu from './NoteContextMenu';
import FilterFolderContextMenu from './FilterFolderContextMenu';

interface BinderItemProps {
  item: BinderItemType;
  selectedNoteId: string | null;
  expanded: boolean;
  searchQuery: string;
  level: number;
  tags?: Tag[];
  onNoteSelect: (note: Note) => void;
  onFilterFolderClick?: (filterFolderId: string) => void;
  onFilterFolderEdit?: (filterFolderId: string) => void;
  onToggleFolder: (folderId: string) => void;
  onStructureChange: () => void;
  onStructureUpdate?: (
    updateFn: (current: BinderItemType[]) => BinderItemType[],
    syncFn: () => Promise<Response>,
    errorMessage?: string
  ) => Promise<void>;
}

export default function BinderItem({
  item,
  selectedNoteId,
  expanded,
  searchQuery,
  level,
  tags = [],
  onNoteSelect,
  onFilterFolderClick,
  onFilterFolderEdit,
  onToggleFolder,
  onStructureChange,
  onStructureUpdate,
}: BinderItemProps) {
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  const isSelected = item.type === 'note' && item.note?.id === selectedNoteId;
  const isFolder = item.type === 'folder';
  const isNote = item.type === 'note';
  const isFilterFolder = item.type === 'filter_folder';
  const hasChildren = item.children && item.children.length > 0;

  // Check if item matches search query
  const matchesSearch = searchQuery === '' || 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.type === 'note' && item.note?.body.toLowerCase().includes(searchQuery.toLowerCase()));

  if (!matchesSearch && !hasChildren) {
    return null;
  }

  const handleClick = () => {
    if (isFolder) {
      onToggleFolder(item.id);
    } else if (isFilterFolder && item.filterFolder && onFilterFolderClick) {
      // Open filtered notes view
      onFilterFolderClick(item.filterFolder.id);
    } else if (isNote && item.note) {
      // Always select the note when clicking it
      onNoteSelect(item.note);
      // If note has children, also toggle expansion in the tree
      if (hasChildren) {
        onToggleFolder(item.id);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuOpen(true);
  };

  const handleCloseContextMenu = () => {
    setContextMenuOpen(false);
  };

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: item.id,
    disabled: isFilterFolder, // Disable dragging for filter folders
    data: {
      type: item.type,
      item,
    },
  });

  const {
    setNodeRef: setDropRef,
    isOver,
  } = useDroppable({
    id: item.id,
    disabled: isFilterFolder, // Filter folders cannot be drop targets
    data: {
      type: item.type,
      folderId: isFolder ? item.id : undefined,
      noteId: isNote ? item.id : undefined,
    },
  });

  // Combine refs (both draggable and droppable)
  const setNodeRef = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <>
      <div
        ref={setNodeRef}
        style={{ ...style, paddingLeft: `${8 + level * 16}px` }}
        className={`
          flex items-center gap-2 px-2 py-1.5 rounded
          transition-all duration-150
          ${isFilterFolder ? 'cursor-pointer' : isDragging ? 'opacity-40 cursor-grabbing' : 'cursor-grab'}
          ${isFilterFolder 
            ? 'bg-purple-50 border-l-2 border-purple-400 hover:bg-purple-100' 
            : isSelected 
              ? 'bg-blue-50 border-l-2 border-blue-600 hover:bg-blue-100' 
              : 'hover:bg-gray-100'
          }
          ${isFilterFolder && isSelected ? 'bg-purple-100 border-l-2 border-purple-500' : ''}
          ${!isFilterFolder && isDragging ? 'cursor-grabbing' : ''}
          ${isOver 
            ? 'bg-blue-100 border-2 border-blue-500 border-solid shadow-md scale-[1.02]' 
            : isFilterFolder && !isSelected
              ? 'border-2 border-purple-200'
              : 'border-2 border-transparent'
          }
        `}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        {...(isFilterFolder ? {} : { ...listeners, ...attributes })}
      >
        {/* Expand/Collapse Icon for Folders, Filter Folders, and Notes with Children */}
        {(isFolder || isFilterFolder || (isNote && hasChildren)) && (
          <div className="w-4 flex-shrink-0">
            {hasChildren ? (
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            ) : (
              <div className="w-4" />
            )}
          </div>
        )}

        {/* Icon */}
        <div className="w-4 flex-shrink-0">
          {isFolder ? (
            <svg
              className="w-4 h-4 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          ) : isFilterFolder ? (
            <svg
              className="w-4 h-4 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          ) : (
            <svg
              className="w-4 h-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
        </div>

        {/* Name */}
        <span className={`flex-1 text-sm truncate ${
          isFilterFolder 
            ? 'font-medium text-purple-900' 
            : isSelected 
              ? 'font-semibold text-blue-900' 
              : 'text-gray-700'
        }`}>
          {item.name}
        </span>

        {/* Tag indicators - show first 2 tags as small colored dots */}
        {isNote && tags && tags.length > 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {tags.slice(0, 2).map((tag) => (
              <div
                key={tag.id}
                className="w-2 h-2 rounded-full border border-white"
                style={{ backgroundColor: tag.color || '#6B7280' }}
                title={tag.name}
              />
            ))}
            {tags.length > 2 && (
              <span className="text-xs text-gray-400" title={tags.slice(2).map(t => t.name).join(', ')}>
                +{tags.length - 2}
              </span>
            )}
          </div>
        )}
        
        {/* Drop indicator icon - appears when item is a valid drop target */}
        {isOver && !isDragging && (
          <div className="flex-shrink-0">
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenuOpen && (
        <>
          {isFolder ? (
            <FolderContextMenu
              folderId={item.id}
              folderName={item.name}
              position={contextMenuPosition}
              onClose={handleCloseContextMenu}
              onStructureChange={onStructureChange}
              onStructureUpdate={onStructureUpdate}
              isAtRoot={!item.parent_id}
            />
          ) : isFilterFolder ? (
            <FilterFolderContextMenu
              filterFolderId={item.id}
              filterFolderName={item.name}
              position={contextMenuPosition}
              onClose={handleCloseContextMenu}
              onEdit={onFilterFolderEdit || (() => {})}
              onStructureChange={onStructureChange}
              onStructureUpdate={onStructureUpdate}
            />
          ) : (
            <NoteContextMenu
              noteId={item.id}
              noteName={item.name}
              position={contextMenuPosition}
              onClose={handleCloseContextMenu}
              onStructureChange={onStructureChange}
              onStructureUpdate={onStructureUpdate}
              onNoteSelect={item.note ? () => onNoteSelect(item.note!) : undefined}
              isAtRoot={!item.parent_id}
            />
          )}
        </>
      )}
    </>
  );
}

