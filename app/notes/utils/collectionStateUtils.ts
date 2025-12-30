import { CollectionBinderItemWithChunk } from '@/lib/collections/types';
import { BinderItem } from '@/lib/binder/types';

/**
 * Build a hierarchical tree from flat collection binder items
 */
export function buildCollectionTree(
  items: CollectionBinderItemWithChunk[]
): BinderItem[] {
  const itemMap = new Map<string, BinderItem>();
  const rootItems: BinderItem[] = [];

  // Create BinderItems from CollectionBinderItems
  items.forEach(item => {
    const binderItem: BinderItem = {
      id: item.id,
      type: item.item_type === 'folder' ? 'folder' : 'chunk_ref',
      name: item.title || (item.item_type === 'chunk_ref' ? 'Chunk' : 'Folder'),
      parent_id: item.parent_id,
      parent_type: item.parent_id ? 'folder' as const : null,
      position: item.position,
      children: [],
      expanded: false,
    };

    if (item.item_type === 'chunk_ref' && item.chunk) {
      binderItem.chunk = {
        id: item.chunk.id,
        chunk_text: item.chunk.chunk_text,
        chunk_index: item.chunk.chunk_index,
        note_id: item.chunk.note_id,
      };
    }

    itemMap.set(item.id, binderItem);
  });

  // Build tree structure
  itemMap.forEach((item, id) => {
    if (item.parent_id) {
      const parent = itemMap.get(item.parent_id);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(item);
      } else {
        // Parent not found, treat as root
        rootItems.push(item);
      }
    } else {
      rootItems.push(item);
    }
  });

  // Sort children by position
  const sortChildren = (items: BinderItem[]) => {
    items.sort((a, b) => a.position - b.position);
    items.forEach(item => {
      if (item.children) {
        sortChildren(item.children);
      }
    });
  };

  sortChildren(rootItems);

  return rootItems;
}

/**
 * Move an item in the collection tree
 */
export function moveItemInCollectionTree(
  items: BinderItem[],
  itemId: string,
  newParentId: string | null,
  newPosition: number
): BinderItem[] {
  // Deep clone the tree
  const cloneTree = (nodes: BinderItem[]): BinderItem[] => {
    return nodes.map(node => ({
      ...node,
      children: node.children ? cloneTree(node.children) : [],
    }));
  };

  const newTree = cloneTree(items);

  // Find the item to move
  let itemToMove: BinderItem | null = null;
  let oldParent: BinderItem | null = null;

  const findAndRemove = (nodes: BinderItem[], parent: BinderItem | null = null): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === itemId) {
        itemToMove = nodes[i];
        oldParent = parent;
        nodes.splice(i, 1);
        return true;
      }
      if (nodes[i].children) {
        if (findAndRemove(nodes[i].children, nodes[i])) {
          return true;
        }
      }
    }
    return false;
  };

  if (!findAndRemove(newTree)) {
    return items; // Item not found
  }

  if (!itemToMove) {
    return items;
  }

  // Update item's parent
  itemToMove.parent_id = newParentId;
  itemToMove.parent_type = newParentId ? 'folder' : null;

  // Find new parent and insert
  if (newParentId === null) {
    // Moving to root
    newTree.splice(newPosition, 0, itemToMove);
  } else {
    const findAndInsert = (nodes: BinderItem[]): boolean => {
      for (const node of nodes) {
        if (node.id === newParentId) {
          if (!node.children) {
            node.children = [];
          }
          node.children.splice(newPosition, 0, itemToMove!);
          return true;
        }
        if (node.children) {
          if (findAndInsert(node.children)) {
            return true;
          }
        }
      }
      return false;
    };

    if (!findAndInsert(newTree)) {
      // Parent not found, append to root as fallback
      newTree.push(itemToMove);
    }
  }

  return newTree;
}

/**
 * Add an item to the collection tree
 */
export function addItemToCollectionTree(
  items: BinderItem[],
  newItem: BinderItem,
  parentId: string | null = null,
  position?: number
): BinderItem[] {
  const newTree = [...items];

  if (parentId === null) {
    // Add to root
    if (position !== undefined) {
      newTree.splice(position, 0, newItem);
    } else {
      newTree.push(newItem);
    }
  } else {
    // Find parent and add as child
    const findAndAdd = (nodes: BinderItem[]): boolean => {
      for (const node of nodes) {
        if (node.id === parentId) {
          if (!node.children) {
            node.children = [];
          }
          if (position !== undefined) {
            node.children.splice(position, 0, newItem);
          } else {
            node.children.push(newItem);
          }
          return true;
        }
        if (node.children) {
          if (findAndAdd(node.children)) {
            return true;
          }
        }
      }
      return false;
    };

    if (!findAndAdd(newTree)) {
      // Parent not found, add to root as fallback
      newTree.push(newItem);
    }
  }

  return newTree;
}

/**
 * Remove an item from the collection tree
 */
export function removeItemFromCollectionTree(
  items: BinderItem[],
  itemId: string
): BinderItem[] {
  const newTree = [...items];

  const findAndRemove = (nodes: BinderItem[]): boolean => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === itemId) {
        nodes.splice(i, 1);
        return true;
      }
      if (nodes[i].children) {
        if (findAndRemove(nodes[i].children)) {
          return true;
        }
      }
    }
    return false;
  };

  findAndRemove(newTree);
  return newTree;
}

