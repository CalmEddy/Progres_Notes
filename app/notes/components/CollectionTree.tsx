'use client';

import { BinderItem } from '@/lib/binder/types';
import CollectionItem from './CollectionItem';

interface CollectionTreeProps {
  items: BinderItem[];
  selectedChunkId: string | null;
  expandedFolders: Set<string>;
  onChunkSelect?: (chunk: BinderItem) => void;
  onToggleFolder: (folderId: string) => void;
  onStructureChange: () => void;
  onStructureUpdate?: (
    updateFn: (current: BinderItem[]) => BinderItem[],
    syncFn: () => Promise<Response>,
    errorMessage?: string
  ) => Promise<void>;
  level?: number;
}

export default function CollectionTree({
  items,
  selectedChunkId,
  expandedFolders,
  onChunkSelect,
  onToggleFolder,
  onStructureChange,
  onStructureUpdate,
  level = 0,
}: CollectionTreeProps) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-gray-500">
        No items in collection
      </div>
    );
  }

  return (
    <div>
      {items.map((item) => {
        const isExpanded = expandedFolders.has(item.id);
        const hasChildren = item.children && item.children.length > 0;

        return (
          <div key={item.id}>
            <CollectionItem
              item={item}
              selectedChunkId={selectedChunkId}
              expanded={isExpanded}
              level={level}
              onChunkSelect={onChunkSelect}
              onToggleFolder={onToggleFolder}
              onStructureChange={onStructureChange}
              onStructureUpdate={onStructureUpdate}
            />
            {isExpanded && hasChildren && item.children && (
              <CollectionTree
                items={item.children}
                selectedChunkId={selectedChunkId}
                expandedFolders={expandedFolders}
                onChunkSelect={onChunkSelect}
                onToggleFolder={onToggleFolder}
                onStructureChange={onStructureChange}
                onStructureUpdate={onStructureUpdate}
                level={level + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

