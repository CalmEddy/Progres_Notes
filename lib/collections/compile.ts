import { getCollectionBinderItems } from './collections';
import { CollectionBinderItemWithChunk } from './types';

export interface CompileOptions {
  includeFolderTitles?: boolean;
  skipMuted?: boolean;
  skipTrashed?: boolean;
}

/**
 * Compile a collection by walking the binder tree and stitching chunk text in order
 * Performs depth-first traversal: folder -> children -> next sibling
 */
export async function compileCollection(
  collectionId: string,
  options: CompileOptions = {},
  accessToken?: string
): Promise<{ text: string; warnings: string[] }> {
  const {
    includeFolderTitles = false,
    skipMuted = true,
    skipTrashed = true,
  } = options;

  // Get all binder items
  const items = await getCollectionBinderItems(collectionId, accessToken);

  // Build tree structure
  const itemMap = new Map<string, CollectionBinderItemWithChunk & { children?: CollectionBinderItemWithChunk[] }>();
  const rootItems: (CollectionBinderItemWithChunk & { children?: CollectionBinderItemWithChunk[] })[] = [];

  items.forEach(item => {
    itemMap.set(item.id, { ...item, children: [] });
  });

  items.forEach(item => {
    const itemWithChildren = itemMap.get(item.id)!;
    if (item.parent_id) {
      const parent = itemMap.get(item.parent_id);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(itemWithChildren);
      }
    } else {
      rootItems.push(itemWithChildren);
    }
  });

  // Sort children by position
  const sortChildren = (items: (CollectionBinderItemWithChunk & { children?: CollectionBinderItemWithChunk[] })[]) => {
    items.sort((a, b) => a.position - b.position);
    items.forEach(item => {
      if (item.children) {
        sortChildren(item.children);
      }
    });
  };

  sortChildren(rootItems);

  const warnings: string[] = [];
  const parts: string[] = [];

  // Depth-first traversal
  const traverse = (item: CollectionBinderItemWithChunk & { children?: CollectionBinderItemWithChunk[] }) => {
    // Skip trashed items if option is set
    if (skipTrashed && item.trashed_at) {
      return;
    }

    // Skip muted items if option is set
    if (skipMuted && item.is_muted) {
      return;
    }

    if (item.item_type === 'folder') {
      // Add folder title if option is set
      if (includeFolderTitles && item.title) {
        parts.push(`\n${item.title}\n${'='.repeat(item.title.length)}\n`);
      }

      // Traverse children
      if (item.children) {
        item.children.forEach(traverse);
      }
    } else if (item.item_type === 'chunk_ref') {
      if (!item.chunk) {
        warnings.push(`Chunk reference ${item.id} points to missing or deleted chunk`);
        if (item.title) {
          parts.push(`\n[${item.title} - Chunk not found]\n`);
        } else {
          parts.push('\n[Chunk not found]\n');
        }
      } else {
        // Add chunk text
        if (item.title) {
          parts.push(`\n${item.title}\n`);
        }
        parts.push(item.chunk.chunk_text);
        parts.push('\n');
      }
    }
  };

  // Traverse all root items
  rootItems.forEach(traverse);

  // Combine all parts
  const text = parts.join('').trim();

  return { text, warnings };
}

