'use client';

import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { BinderItem } from '@/lib/binder/types';

interface CollectionItemProps {
  item: BinderItem;
  selectedChunkId: string | null;
  expanded: boolean;
  level: number;
  onChunkSelect?: (chunk: BinderItem) => void;
  onToggleFolder: (folderId: string) => void;
  onStructureChange: () => void;
  onStructureUpdate?: (
    updateFn: (current: BinderItem[]) => BinderItem[],
    syncFn: () => Promise<Response>,
    errorMessage?: string
  ) => Promise<void>;
}

export default function CollectionItem({
  item,
  selectedChunkId,
  expanded,
  level,
  onChunkSelect,
  onToggleFolder,
  onStructureChange,
  onStructureUpdate,
}: CollectionItemProps) {
  const isFolder = item.type === 'folder';
  const isChunkRef = item.type === 'chunk_ref';
  const hasChildren = item.children && item.children.length > 0;
  const isSelected = isChunkRef && item.chunk?.id === selectedChunkId;

  const handleClick = () => {
    if (isFolder) {
      onToggleFolder(item.id);
    } else if (isChunkRef && onChunkSelect) {
      onChunkSelect(item);
    }
  };

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: item.id,
    data: { item },
  });

  const {
    setNodeRef: setDropRef,
    isOver,
  } = useDroppable({
    id: item.id,
    data: { item },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const indent = level * 20;

  if (isDragging) {
    return (
      <div
        ref={setDragRef}
        style={style}
        className="opacity-50"
      >
        {/* Render item structure for drag preview */}
      </div>
    );
  }

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
      }}
      style={style}
      className={`group relative ${isOver ? 'bg-blue-50' : ''} ${isSelected ? 'bg-blue-100' : ''}`}
    >
      <div
        className={`flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer ${
          isSelected ? 'bg-blue-100' : ''
        }`}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={handleClick}
        {...attributes}
        {...listeners}
      >
        {isFolder && (
          <span className="mr-2 text-gray-400">
            {expanded ? '▼' : '▶'}
          </span>
        )}
        {isChunkRef && (
          <span className="mr-2 text-gray-400">📄</span>
        )}
        <span className="text-sm text-gray-700 flex-1 truncate">
          {item.name}
        </span>
        {isChunkRef && !item.chunk && (
          <span className="text-xs text-red-500 ml-2">[Missing]</span>
        )}
      </div>
    </div>
  );
}

