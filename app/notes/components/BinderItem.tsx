'use client';

import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { BinderItem as BinderItemType } from '@/lib/binder/types';
import { Note } from '@/lib/notes';
import FolderContextMenu from './FolderContextMenu';
import NoteContextMenu from './NoteContextMenu';

interface BinderItemProps {
  item: BinderItemType;
  selectedNoteId: string | null;
  expanded: boolean;
  searchQuery: string;
  level: number;
  onNoteSelect: (note: Note) => void;
  onToggleFolder: (folderId: string) => void;
  onStructureChange: () => void;
}

export default function BinderItem({
  item,
  selectedNoteId,
  expanded,
  searchQuery,
  level,
  onNoteSelect,
  onToggleFolder,
  onStructureChange,
}: BinderItemProps) {
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  const isSelected = item.type === 'note' && item.note?.id === selectedNoteId;
  const isFolder = item.type === 'folder';
  const isNote = item.type === 'note';
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
    disabled: false, // Both folders and notes can be drop targets
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
          flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded
          hover:bg-gray-100 transition-colors
          ${isSelected ? 'bg-blue-50 border-l-2 border-blue-600' : ''}
          ${isDragging ? 'opacity-50' : ''}
          ${isOver ? 'bg-blue-100 border-2 border-blue-400 border-dashed' : ''}
        `}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        {...listeners}
        {...attributes}
      >
        {/* Expand/Collapse Icon for Folders and Notes with Children */}
        {(isFolder || (isNote && hasChildren)) && (
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
        <span className={`flex-1 text-sm truncate ${isSelected ? 'font-semibold text-blue-900' : 'text-gray-700'}`}>
          {item.name}
        </span>
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
            />
          ) : (
            <NoteContextMenu
              noteId={item.id}
              noteName={item.name}
              position={contextMenuPosition}
              onClose={handleCloseContextMenu}
              onStructureChange={onStructureChange}
              onNoteSelect={item.note ? () => onNoteSelect(item.note!) : undefined}
            />
          )}
        </>
      )}
    </>
  );
}

