'use client';

import { BinderItem as BinderItemType } from '@/lib/binder/types';
import { Note } from '@/lib/notes';
import { Tag } from '@/lib/tags/types';
import BinderItem from './BinderItem';

interface BinderTreeProps {
  items: BinderItemType[];
  selectedNoteId: string | null;
  expandedFolders: Set<string>;
  searchQuery: string;
  noteTags?: Record<string, Tag[]>;
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
  level?: number;
}

export default function BinderTree({
  items,
  selectedNoteId,
  expandedFolders,
  searchQuery,
  noteTags = {},
  onNoteSelect,
  onFilterFolderClick,
  onFilterFolderEdit,
  onToggleFolder,
  onStructureChange,
  onStructureUpdate,
  level = 0,
}: BinderTreeProps) {
  // Filter items based on search query
  const filterItems = (items: BinderItemType[]): BinderItemType[] => {
    if (searchQuery === '') {
      return items;
    }

    const query = searchQuery.toLowerCase();
    const filtered: BinderItemType[] = [];

    items.forEach(item => {
      const matchesName = item.name.toLowerCase().includes(query);
      const matchesContent = item.type === 'note' && 
        item.note?.body.toLowerCase().includes(query);

      // Check if any children match
      let hasMatchingChildren = false;
      if (item.children && item.children.length > 0) {
        const filteredChildren = filterItems(item.children);
        hasMatchingChildren = filteredChildren.length > 0;
      }

      if (matchesName || matchesContent || hasMatchingChildren) {
        const filteredItem = { ...item };
        if (item.children && item.children.length > 0) {
          filteredItem.children = filterItems(item.children);
        }
        filtered.push(filteredItem);
      }
    });

    return filtered;
  };

  const filteredItems = filterItems(items);

  if (filteredItems.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-gray-500">
        {searchQuery ? 'No items match your search' : 'No items'}
      </div>
    );
  }

  return (
    <div>
      {filteredItems.map((item) => {
        // Both folders and notes with children can be expanded
        const hasChildren = item.children && item.children.length > 0;
        const isExpanded = hasChildren && expandedFolders.has(item.id);
        
        return (
          <div key={item.id}>
            <BinderItem
              item={item}
              selectedNoteId={selectedNoteId}
              expanded={isExpanded}
              searchQuery={searchQuery}
              level={level}
              tags={item.type === 'note' && item.note ? (noteTags[item.note.id] || []) : undefined}
              onNoteSelect={onNoteSelect}
              onFilterFolderClick={onFilterFolderClick}
              onFilterFolderEdit={onFilterFolderEdit}
              onToggleFolder={onToggleFolder}
              onStructureChange={onStructureChange}
              onStructureUpdate={onStructureUpdate}
            />
            {isExpanded && item.children && item.children.length > 0 && (
              <BinderTree
                items={item.children}
                selectedNoteId={selectedNoteId}
                expandedFolders={expandedFolders}
                searchQuery={searchQuery}
                noteTags={noteTags}
                onNoteSelect={onNoteSelect}
                onFilterFolderClick={onFilterFolderClick}
                onFilterFolderEdit={onFilterFolderEdit}
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

