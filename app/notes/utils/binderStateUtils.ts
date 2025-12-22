import { BinderItem } from '@/lib/binder/types';
import { Note } from '@/lib/notes';
import { Folder } from '@/lib/binder/types';

/**
 * Find an item in the tree by ID
 */
export function findItemInTree(items: BinderItem[], id: string): BinderItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findItemInTree(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find parent of an item in the tree
 */
export function findParentInTree(
  items: BinderItem[],
  id: string,
  parent: BinderItem | null = null
): BinderItem | null {
  for (const item of items) {
    if (item.id === id) return parent;
    if (item.children) {
      const found = findParentInTree(item.children, id, item);
      if (found !== null) return found;
    }
  }
  return null;
}

/**
 * Deep clone an item and its children
 */
function cloneItem(item: BinderItem): BinderItem {
  return {
    ...item,
    children: item.children ? item.children.map(cloneItem) : undefined,
  };
}

/**
 * Deep clone a tree
 */
function cloneTree(items: BinderItem[]): BinderItem[] {
  return items.map(cloneItem);
}

/**
 * Remove an item from the tree (immutably)
 */
export function removeItemFromTree(items: BinderItem[], id: string): BinderItem[] {
  return items
    .filter(item => item.id !== id)
    .map(item => {
      if (item.children) {
        return {
          ...item,
          children: removeItemFromTree(item.children, id),
        };
      }
      return item;
    });
}

/**
 * Update an item's properties in the tree (immutably)
 */
export function updateItemInTree(
  items: BinderItem[],
  id: string,
  updates: Partial<BinderItem>
): BinderItem[] {
  return items.map(item => {
    if (item.id === id) {
      return { ...item, ...updates };
    }
    if (item.children) {
      return {
        ...item,
        children: updateItemInTree(item.children, id, updates),
      };
    }
    return item;
  });
}

/**
 * Update a note's data within an item in the tree
 */
export function updateNoteInTree(
  items: BinderItem[],
  noteId: string,
  noteUpdates: Partial<Note>
): BinderItem[] {
  return items.map(item => {
    if (item.type === 'note' && item.id === noteId && item.note) {
      return {
        ...item,
        name: noteUpdates.title || item.name,
        note: { ...item.note, ...noteUpdates },
      };
    }
    if (item.children) {
      return {
        ...item,
        children: updateNoteInTree(item.children, noteId, noteUpdates),
      };
    }
    return item;
  });
}

/**
 * Update a folder's data within an item in the tree
 */
export function updateFolderInTree(
  items: BinderItem[],
  folderId: string,
  folderUpdates: Partial<Folder>
): BinderItem[] {
  return items.map(item => {
    if (item.type === 'folder' && item.id === folderId && item.folder) {
      return {
        ...item,
        name: folderUpdates.name || item.name,
        folder: { ...item.folder, ...folderUpdates },
      };
    }
    if (item.children) {
      return {
        ...item,
        children: updateFolderInTree(item.children, folderId, folderUpdates),
      };
    }
    return item;
  });
}

/**
 * Get all items at a specific parent location
 */
function getSiblings(
  items: BinderItem[],
  parentId: string | null,
  parentType: 'folder' | 'note' | null
): BinderItem[] {
  if (parentId === null) {
    // Root level items
    return items.filter(item => !item.parent_id);
  }

  // Find parent and return its children
  const parent = findItemInTree(items, parentId);
  return parent?.children || [];
}

/**
 * Calculate the next position for an item in a parent
 */
function calculateNextPosition(
  items: BinderItem[],
  parentId: string | null,
  parentType: 'folder' | 'note' | null
): number {
  const siblings = getSiblings(items, parentId, parentType);
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map(item => item.position)) + 1;
}

/**
 * Add a new item to the tree at a specific location (immutably)
 */
export function addItemToTree(
  items: BinderItem[],
  newItem: BinderItem,
  parentId: string | null = null,
  parentType: 'folder' | 'note' | null = null,
  position?: number
): BinderItem[] {
  const itemToAdd: BinderItem = {
    ...newItem,
    parent_id: parentId,
    parent_type: parentType,
    position: position !== undefined ? position : calculateNextPosition(items, parentId, parentType),
  };

  if (parentId === null) {
    // Add to root
    const newItems = [...items, itemToAdd];
    // Sort by position
    return newItems.sort((a, b) => a.position - b.position);
  }

  // Add to parent's children
  return items.map(item => {
    if (item.id === parentId) {
      const children = item.children || [];
      const newChildren = [...children, itemToAdd];
      // Sort by position
      newChildren.sort((a, b) => a.position - b.position);
      return {
        ...item,
        children: newChildren,
      };
    }
    if (item.children) {
      return {
        ...item,
        children: addItemToTree(item.children, newItem, parentId, parentType, position),
      };
    }
    return item;
  });
}

/**
 * Move an item within the tree (immutably)
 * This removes the item from its current location and adds it to the new location
 */
export function moveItemInTree(
  items: BinderItem[],
  itemId: string,
  newParentId: string | null,
  newParentType: 'folder' | 'note' | null,
  newPosition: number
): BinderItem[] {
  // First, find and remove the item from its current location
  const itemToMove = findItemInTree(items, itemId);
  if (!itemToMove) return items;

  // Clone the tree and remove the item
  let newTree = removeItemFromTree(items, itemId);

  // Update the item's parent and position
  const movedItem: BinderItem = {
    ...itemToMove,
    parent_id: newParentId,
    parent_type: newParentType,
    position: newPosition,
  };

  // Add the item to its new location
  newTree = addItemToTree(newTree, movedItem, newParentId, newParentType, newPosition);

  // Recalculate positions for siblings in both old and new locations
  // We need to shift positions of items that come after the new position
  if (newParentId === null) {
    // Moving to root
    newTree = newTree.map((item, index) => {
      if (item.id === itemId) return item;
      if (item.position >= newPosition && index !== newTree.findIndex(i => i.id === itemId)) {
        return { ...item, position: item.position + 1 };
      }
      return item;
    });
  } else {
    // Moving to a parent's children
    const adjustSiblingPositions = (items: BinderItem[]): BinderItem[] => {
      return items.map(item => {
        if (item.id === newParentId && item.children) {
          const adjustedChildren = item.children
            .map((child, index) => {
              if (child.id === itemId) return child;
              const currentIndex = item.children!.findIndex(c => c.id === child.id);
              const targetIndex = item.children!.findIndex(c => c.id === itemId);
              if (currentIndex > targetIndex && child.position >= newPosition) {
                return { ...child, position: child.position + 1 };
              }
              return child;
            })
            .sort((a, b) => a.position - b.position);
          return { ...item, children: adjustedChildren };
        }
        if (item.children) {
          return { ...item, children: adjustSiblingPositions(item.children) };
        }
        return item;
      });
    };
    newTree = adjustSiblingPositions(newTree);
  }

  return newTree;
}

/**
 * Create a BinderItem from a Note
 */
export function createBinderItemFromNote(note: Note): BinderItem {
  const parentId = note.folder_id || note.parent_note_id || null;
  const parentType: 'folder' | 'note' | null = note.folder_id
    ? 'folder'
    : note.parent_note_id
    ? 'note'
    : null;

  return {
    id: note.id,
    type: 'note',
    name: note.title || 'Untitled Note',
    parent_id: parentId,
    parent_type: parentType,
    position: note.position,
    note: note,
    children: [],
  };
}

/**
 * Create a BinderItem from a Folder
 */
export function createBinderItemFromFolder(folder: Folder): BinderItem {
  return {
    id: folder.id,
    type: 'folder',
    name: folder.name,
    parent_id: folder.parent_id,
    parent_type: folder.parent_id ? 'folder' : null,
    position: folder.position,
    folder: folder,
    children: [],
  };
}

