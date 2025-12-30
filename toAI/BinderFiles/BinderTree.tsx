'use client';

import { BinderItem as BinderItemType } from '@/lib/binder/types';
import { Note } from '@/lib/notes';
import { Tag } from '@/lib/tags/types';
import { BinderSearchResult } from '@/lib/binder/binderSearch';
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
  searchResults?: BinderSearchResult[] | null;
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
  searchResults,
}: BinderTreeProps) {
  // If search results are provided, display those instead of filtering
  if (searchResults !== null && searchResults !== undefined) {
    if (searchResults.length === 0) {
      return (
        <div className="px-4 py-8 text-center text-sm text-gray-500">
          {searchQuery ? 'No results found' : 'No items'}
        </div>
      );
    }

    // Display search results
    return (
      <div>
        {searchResults.map((result) => {
          const item: BinderItemType = {
            id: result.id,
            type: 'note',
            name: result.title || 'Untitled Note',
            parent_id: result.folder_id || result.parent_note_id || null,
            parent_type: result.folder_id ? 'folder' : result.parent_note_id ? 'note' : null,
            position: result.position,
            note: result,
            children: [],
          };

          return (
            <div key={item.id} className="mb-1">
              <BinderItem
                item={item}
                selectedNoteId={selectedNoteId}
                expanded={false}
                searchQuery={searchQuery}
                level={level}
                tags={noteTags[item.id] || []}
                isSearchResult={true}
                onNoteSelect={onNoteSelect}
                onFilterFolderClick={onFilterFolderClick}
                onFilterFolderEdit={onFilterFolderEdit}
                onToggleFolder={onToggleFolder}
                onStructureChange={onStructureChange}
                onStructureUpdate={onStructureUpdate}
              />
              {/* Show search metadata */}
              {(result.relevance !== undefined || result.similarity !== undefined || result.theme_similarity !== undefined) && (
                <div className="ml-8 text-xs text-gray-400 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {result.search_type && (
                      <span className="px-1.5 py-0.5 bg-gray-100 rounded">
                        {result.search_type}
                      </span>
                    )}
                    {result.relevance !== undefined && (
                      <span>Relevance: {(result.relevance * 100).toFixed(0)}%</span>
                    )}
                    {result.similarity !== undefined && (
                      <span>Similarity: {(result.similarity * 100).toFixed(0)}%</span>
                    )}
                    {result.theme_similarity !== undefined && (
                      <span>Theme: {(result.theme_similarity * 100).toFixed(0)}%</span>
                    )}
                  </div>
                  {/* Show matching chunk text for semantic searches */}
                  {result.matching_chunk_text && (result.search_type === 'semantic' || result.search_type === 'combined') && (
                    <div className="mt-1 px-2 py-1 bg-blue-50 border-l-2 border-blue-300 rounded text-gray-600 italic">
                      "{result.matching_chunk_text.length > 150 
                        ? result.matching_chunk_text.substring(0, 150) + '...' 
                        : result.matching_chunk_text}"
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback to client-side filtering for backward compatibility
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

