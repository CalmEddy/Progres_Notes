import { createSupabaseServerClient } from './supabaseServerClient';
import { createClient } from '@supabase/supabase-js';
import { listFoldersForUser } from './folders';
import { listNotesForUser, updateNotePosition, Note } from './notes';
import { listFilterFoldersForUser } from './filters/filterFolders';
import { Folder, BinderItem, BinderStructure } from './binder/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Helper to create an authenticated Supabase client with user session
function createAuthenticatedClient(accessToken?: string) {
  if (accessToken) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }
  return null;
}

/**
 * Build complete binder structure (folders + notes in hierarchical tree)
 */
export async function getBinderStructureForUser(
  userId: string,
  accessToken?: string
): Promise<BinderStructure> {
  try {
    const folders = await listFoldersForUser(userId, accessToken);
    const notes = await listNotesForUser(userId, undefined, undefined, accessToken);
    
    // Try to load filter folders, but don't fail if table doesn't exist yet
    let filterFolders = [];
    try {
      filterFolders = await listFilterFoldersForUser(userId, accessToken);
    } catch (error) {
      // If table doesn't exist, just log and continue with empty array
      if (error instanceof Error && error.message.includes('filter_folders')) {
        console.warn('Filter folders table not found. Please run the schema migration.');
      } else {
        throw error; // Re-throw if it's a different error
      }
    }

  // Create maps for quick lookup
  const folderMap = new Map<string, Folder>();
  folders.forEach(folder => folderMap.set(folder.id, folder));

  // Create BinderItem for each folder, note, and filter folder
  const folderItems = folders.map(folder => ({
    id: folder.id,
    type: 'folder' as const,
    name: folder.name,
    parent_id: folder.parent_id,
    parent_type: folder.parent_id ? 'folder' as const : null,
    position: folder.position,
    folder: folder,
    children: [] as BinderItem[],
  }));

  const filterFolderItems = filterFolders.map(filterFolder => ({
    id: filterFolder.id,
    type: 'filter_folder' as const,
    name: filterFolder.name,
    parent_id: null, // Filter folders always at root
    parent_type: null,
    position: filterFolder.position,
    filterFolder: filterFolder,
    children: [] as BinderItem[],
  }));

  const noteItems = notes.map(note => {
    // Determine parent: note can be in folder OR under another note, not both
    let parentId: string | null = null;
    let parentType: 'folder' | 'note' | null = null;
    
    // Safety check: ensure parent_note_id exists in the note object
    const parentNoteId = (note as any).parent_note_id ?? note.parent_note_id ?? null;
    
    if (note.folder_id) {
      parentId = note.folder_id;
      parentType = 'folder';
    } else if (parentNoteId) {
      parentId = parentNoteId;
      parentType = 'note';
    }

    return {
      id: note.id,
      type: 'note' as const,
      name: note.title || 'Untitled Note',
      parent_id: parentId,
      parent_type: parentType,
      position: note.position ?? 0,
      note: note,
      children: [] as BinderItem[],
    };
  });

  // Combine all items
  const allItems = [...folderItems, ...filterFolderItems, ...noteItems];

  // Build tree structure
  const itemMap = new Map<string, BinderItem>();
  const rootItems: BinderItem[] = [];

  // First pass: add all items to map
  allItems.forEach(item => {
    itemMap.set(item.id, item);
  });

  // Second pass: build tree
  allItems.forEach(item => {
    if (item.parent_id) {
      const parent = itemMap.get(item.parent_id);
      if (parent) {
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(item);
      } else {
        // Parent not found, treat as root
        rootItems.push(item);
      }
    } else {
      rootItems.push(item);
    }
  });

  // Sort items: filter folders first, then folders, then notes
  const sortItems = (items: BinderItem[]) => {
    items.sort((a, b) => {
      // Filter folders always come first
      if (a.type === 'filter_folder' && b.type !== 'filter_folder') return -1;
      if (b.type === 'filter_folder' && a.type !== 'filter_folder') return 1;
      // If both are filter folders, sort by position
      if (a.type === 'filter_folder' && b.type === 'filter_folder') {
        return a.position - b.position;
      }
      // Folders come before notes
      if (a.type === 'folder' && b.type === 'note') return -1;
      if (b.type === 'folder' && a.type === 'note') return 1;
      // Within same type, sort by position
      return a.position - b.position;
    });
    items.forEach(item => {
      if (item.children) {
        sortItems(item.children);
      }
    });
  };

  sortItems(rootItems);

  return { items: rootItems };
  } catch (error) {
    console.error('Error in getBinderStructureForUser:', error);
    
    // Log full error details
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    } else {
      console.error('Non-Error object:', error);
    }
    
    // Check if it's a schema issue
    if (error instanceof Error && error.message.includes('column') && error.message.includes('does not exist')) {
      throw new Error('Database schema not updated. Please run the migration in supabase/schema.sql to add folder_id, parent_note_id, and position columns to the notes table.');
    }
    
    // Re-throw with more context
    if (error instanceof Error) {
      throw new Error(`Failed to get binder structure: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Validate that a note can be moved to a parent note (prevent circular references)
 */
export async function validateNoteParent(
  noteId: string,
  parentNoteId: string | null,
  userId: string,
  accessToken?: string
): Promise<void> {
  if (!parentNoteId) {
    return; // Moving to root is always valid
  }

  if (noteId === parentNoteId) {
    throw new Error('Note cannot be nested under itself');
  }

  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Recursively check if parentNoteId is a descendant of noteId
  const checkDescendant = async (currentParentId: string): Promise<boolean> => {
    if (currentParentId === noteId) {
      return true; // Found circular reference
    }

    const { data: parentNote } = await supabase
      .from('notes')
      .select('parent_note_id')
      .eq('id', currentParentId)
      .eq('user_id', userId)
      .single();

    if (!parentNote || !parentNote.parent_note_id) {
      return false; // Reached root, no circular reference
    }

    return checkDescendant(parentNote.parent_note_id);
  };

  const isCircular = await checkDescendant(parentNoteId);
  if (isCircular) {
    throw new Error('Cannot nest note under its own descendant');
  }
}

/**
 * Move a note to a different folder or reorder within same folder
 */
export async function moveNoteToFolder(
  noteId: string,
  userId: string,
  targetFolderId: string | null,
  targetPosition: number,
  accessToken?: string
): Promise<void> {
  // Update the note's folder and position (clear parent_note_id when moving to folder)
  await updateNotePosition(noteId, userId, targetFolderId, null, targetPosition, accessToken);

  // Reorder other notes in the target folder to make room
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  
  // Get all notes in the target folder (excluding the moved note)
  const { data: notesInFolder } = await supabase
    .from('notes')
    .select('id, position')
    .eq('user_id', userId)
    .eq('folder_id', targetFolderId)
    .neq('id', noteId)
    .order('position', { ascending: true });

  if (notesInFolder) {
    // Shift positions for notes at or after target position
    for (let i = 0; i < notesInFolder.length; i++) {
      const note = notesInFolder[i];
      if (note.position >= targetPosition) {
        await supabase
          .from('notes')
          .update({ position: note.position + 1 })
          .eq('id', note.id)
          .eq('user_id', userId);
      }
    }
  }
}

/**
 * Move a note to be a child of another note
 */
export async function moveNoteToNote(
  noteId: string,
  userId: string,
  targetNoteId: string | null,
  targetPosition: number,
  accessToken?: string
): Promise<void> {
  // Validate circular references
  if (targetNoteId) {
    await validateNoteParent(noteId, targetNoteId, userId, accessToken);
  }

  // Update the note's parent_note_id and position (clear folder_id when moving to note)
  await updateNotePosition(noteId, userId, null, targetNoteId, targetPosition, accessToken);

  // Reorder other notes under the target note to make room
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();
  
  // Get all notes under the target note (excluding the moved note)
  const { data: notesUnderParent } = await supabase
    .from('notes')
    .select('id, position')
    .eq('user_id', userId)
    .eq('parent_note_id', targetNoteId)
    .neq('id', noteId)
    .order('position', { ascending: true });

  if (notesUnderParent) {
    // Shift positions for notes at or after target position
    for (let i = 0; i < notesUnderParent.length; i++) {
      const note = notesUnderParent[i];
      if (note.position >= targetPosition) {
        await supabase
          .from('notes')
          .update({ position: note.position + 1 })
          .eq('id', note.id)
          .eq('user_id', userId);
      }
    }
  }
}

/**
 * Move a folder to a different parent or reorder within same parent
 */
export async function moveFolderToParent(
  folderId: string,
  userId: string,
  targetParentId: string | null,
  targetPosition: number,
  accessToken?: string
): Promise<void> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Prevent moving folder into itself or its descendants
  if (targetParentId === folderId) {
    throw new Error('Cannot move folder into itself');
  }

  // Check if target parent is a descendant
  const checkDescendant = async (parentId: string | null): Promise<boolean> => {
    if (!parentId) return false;
    if (parentId === folderId) return true;
    
    const { data: parent } = await supabase
      .from('folders')
      .select('parent_id')
      .eq('id', parentId)
      .eq('user_id', userId)
      .single();
    
    if (!parent) return false;
    return checkDescendant(parent.parent_id);
  };

  if (targetParentId && await checkDescendant(targetParentId)) {
    throw new Error('Cannot move folder into its own descendant');
  }

  // Update folder's parent and position
  await supabase
    .from('folders')
    .update({
      parent_id: targetParentId,
      position: targetPosition,
    })
    .eq('id', folderId)
    .eq('user_id', userId);

  // Reorder other folders in the target parent to make room
  const { data: foldersInParent } = await supabase
    .from('folders')
    .select('id, position')
    .eq('user_id', userId)
    .eq('parent_id', targetParentId)
    .neq('id', folderId)
    .order('position', { ascending: true });

  if (foldersInParent) {
    // Shift positions for folders at or after target position
    for (let i = 0; i < foldersInParent.length; i++) {
      const folder = foldersInParent[i];
      if (folder.position >= targetPosition) {
        await supabase
          .from('folders')
          .update({ position: folder.position + 1 })
          .eq('id', folder.id)
          .eq('user_id', userId);
      }
    }
  }
}

/**
 * Reorder items in the same parent (for drag and drop reordering)
 */
export async function reorderItems(
  userId: string,
  items: Array<{ id: string; type: 'folder' | 'note'; position: number }>,
  accessToken?: string
): Promise<void> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Update positions for all items
  for (const item of items) {
    if (item.type === 'folder') {
      await supabase
        .from('folders')
        .update({ position: item.position })
        .eq('id', item.id)
        .eq('user_id', userId);
    } else {
      await supabase
        .from('notes')
        .update({ position: item.position })
        .eq('id', item.id)
        .eq('user_id', userId);
    }
  }
}

/**
 * Get full path to an item (for breadcrumbs)
 */
export async function getBinderPath(
  itemId: string,
  itemType: 'folder' | 'note',
  userId: string,
  accessToken?: string
): Promise<Array<{ id: string; name: string; type: 'folder' | 'note' }>> {
  const path: Array<{ id: string; name: string; type: 'folder' | 'note' }> = [];
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  let currentId: string | null = itemId;
  let currentType: 'folder' | 'note' = itemType;

  while (currentId) {
    if (currentType === 'folder') {
      const { data: folder } = await supabase
        .from('folders')
        .select('id, name, parent_id')
        .eq('id', currentId)
        .eq('user_id', userId)
        .single();

      if (!folder) break;

      path.unshift({ id: folder.id, name: folder.name, type: 'folder' });
      currentId = folder.parent_id;
      currentType = 'folder';
    } else {
      const { data: note } = await supabase
        .from('notes')
        .select('id, title, folder_id')
        .eq('id', currentId)
        .eq('user_id', userId)
        .single();

      if (!note) break;

      path.unshift({ 
        id: note.id, 
        name: note.title || 'Untitled Note', 
        type: 'note' 
      });
      currentId = note.folder_id;
      currentType = 'folder';
    }
  }

  return path;
}

