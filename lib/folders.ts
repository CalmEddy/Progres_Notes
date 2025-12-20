import { createSupabaseServerClient } from './supabaseServerClient';
import { createClient } from '@supabase/supabase-js';
import { Folder } from './binder/types';

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
 * Create a new folder for a user
 */
export async function createFolderForUser(
  userId: string,
  name: string,
  parentId: string | null = null,
  position: number = 0,
  accessToken?: string
): Promise<Folder> {
  if (!name || name.trim().length === 0) {
    throw new Error('Folder name cannot be empty');
  }

  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('folders')
    .insert({
      user_id: userId,
      name: name.trim(),
      parent_id: parentId || null,
      position: position,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating folder:', error);
    throw new Error(`Failed to create folder: ${error.message}`);
  }

  if (!data) {
    throw new Error('Folder created but no data returned');
  }

  return data as Folder;
}

/**
 * Update an existing folder (rename, move to different parent, or change position)
 */
export async function updateFolderForUser(
  folderId: string,
  userId: string,
  updates: {
    name?: string;
    parent_id?: string | null;
    position?: number;
  },
  accessToken?: string
): Promise<Folder> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const updateData: Partial<Folder> = {};
  if (updates.name !== undefined) {
    if (!updates.name || updates.name.trim().length === 0) {
      throw new Error('Folder name cannot be empty');
    }
    updateData.name = updates.name.trim();
  }
  if (updates.parent_id !== undefined) {
    updateData.parent_id = updates.parent_id;
  }
  if (updates.position !== undefined) {
    updateData.position = updates.position;
  }

  const { data, error } = await supabase
    .from('folders')
    .update(updateData)
    .eq('id', folderId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating folder:', error);
    throw new Error(`Failed to update folder: ${error.message}`);
  }

  if (!data) {
    throw new Error('Folder updated but no data returned');
  }

  return data as Folder;
}

/**
 * Delete a folder and optionally move its children to the parent folder or root
 */
export async function deleteFolderForUser(
  folderId: string,
  userId: string,
  moveChildrenToParent: boolean = true,
  accessToken?: string
): Promise<void> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Get the folder to find its parent
  const { data: folder } = await supabase
    .from('folders')
    .select('parent_id')
    .eq('id', folderId)
    .eq('user_id', userId)
    .single();

  if (moveChildrenToParent && folder) {
    // Move child folders to parent (or root if no parent)
    await supabase
      .from('folders')
      .update({ parent_id: folder.parent_id })
      .eq('parent_id', folderId)
      .eq('user_id', userId);

    // Move child notes to parent (or root if no parent)
    await supabase
      .from('notes')
      .update({ folder_id: folder.parent_id })
      .eq('folder_id', folderId)
      .eq('user_id', userId);
  } else {
    // Delete all child folders recursively (cascade will handle this)
    // But we need to handle notes manually
    await supabase
      .from('notes')
      .update({ folder_id: null })
      .eq('folder_id', folderId)
      .eq('user_id', userId);
  }

  // Delete the folder
  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', folderId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting folder:', error);
    throw new Error(`Failed to delete folder: ${error.message}`);
  }
}

/**
 * List all folders for a user
 */
export async function listFoldersForUser(
  userId: string,
  accessToken?: string
): Promise<Folder[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error listing folders:', error);
    // Check if folders table doesn't exist
    if (error.message.includes('relation') && error.message.includes('does not exist')) {
      throw new Error('Folders table does not exist. Please run the database migration in supabase/schema.sql');
    }
    throw new Error(`Failed to list folders: ${error.message}`);
  }

  return (data || []) as Folder[];
}

/**
 * Build hierarchical folder structure
 */
export async function getFolderTreeForUser(
  userId: string,
  accessToken?: string
): Promise<Folder[]> {
  const folders = await listFoldersForUser(userId, accessToken);
  
  // Build a map of folders by id
  const folderMap = new Map<string, Folder & { children?: Folder[] }>();
  const rootFolders: (Folder & { children?: Folder[] })[] = [];

  // First pass: create map entries
  folders.forEach(folder => {
    folderMap.set(folder.id, { ...folder, children: [] });
  });

  // Second pass: build tree structure
  folders.forEach(folder => {
    const folderWithChildren = folderMap.get(folder.id)!;
    if (folder.parent_id) {
      const parent = folderMap.get(folder.parent_id);
      if (parent) {
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(folderWithChildren);
      } else {
        // Parent not found, treat as root
        rootFolders.push(folderWithChildren);
      }
    } else {
      rootFolders.push(folderWithChildren);
    }
  });

  // Sort children by position
  const sortChildren = (folders: (Folder & { children?: Folder[] })[]) => {
    folders.sort((a, b) => a.position - b.position);
    folders.forEach(folder => {
      if (folder.children) {
        sortChildren(folder.children);
      }
    });
  };

  sortChildren(rootFolders);

  return rootFolders as Folder[];
}

