import { createSupabaseServerClient } from '../supabaseServerClient';
import { createClient } from '@supabase/supabase-js';
import { FilterFolder, FilterCondition } from './types';

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
 * Create a new filter folder
 */
export async function createFilterFolder(
  userId: string,
  name: string,
  filterConditions: FilterCondition[],
  parentId: string | null = null,
  position: number = 0,
  accessToken?: string
): Promise<FilterFolder> {
  if (!name || name.trim().length === 0) {
    throw new Error('Filter folder name cannot be empty');
  }

  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('filter_folders')
    .insert({
      user_id: userId,
      name: name.trim(),
      filter_conditions: filterConditions,
      parent_id: parentId,
      position: position,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating filter folder:', error);
    throw new Error(`Failed to create filter folder: ${error.message}`);
  }

  if (!data) {
    throw new Error('Filter folder created but no data returned');
  }

  return {
    ...data,
    filter_conditions: data.filter_conditions as FilterCondition[],
  } as FilterFolder;
}

/**
 * Update a filter folder
 */
export async function updateFilterFolder(
  folderId: string,
  userId: string,
  updates: {
    name?: string;
    filterConditions?: FilterCondition[];
    parentId?: string | null;
    position?: number;
  },
  accessToken?: string
): Promise<FilterFolder> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const updateData: any = {};
  if (updates.name !== undefined) {
    if (!updates.name || updates.name.trim().length === 0) {
      throw new Error('Filter folder name cannot be empty');
    }
    updateData.name = updates.name.trim();
  }
  if (updates.filterConditions !== undefined) {
    updateData.filter_conditions = updates.filterConditions;
  }
  if (updates.parentId !== undefined) {
    updateData.parent_id = updates.parentId;
  }
  if (updates.position !== undefined) {
    updateData.position = updates.position;
  }

  const { data, error } = await supabase
    .from('filter_folders')
    .update(updateData)
    .eq('id', folderId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating filter folder:', error);
    throw new Error(`Failed to update filter folder: ${error.message}`);
  }

  if (!data) {
    throw new Error('Filter folder updated but no data returned');
  }

  return {
    ...data,
    filter_conditions: data.filter_conditions as FilterCondition[],
  } as FilterFolder;
}

/**
 * Delete a filter folder
 */
export async function deleteFilterFolder(
  folderId: string,
  userId: string,
  accessToken?: string
): Promise<void> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { error } = await supabase
    .from('filter_folders')
    .delete()
    .eq('id', folderId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting filter folder:', error);
    throw new Error(`Failed to delete filter folder: ${error.message}`);
  }
}

/**
 * List all filter folders for a user
 */
export async function listFilterFoldersForUser(
  userId: string,
  accessToken?: string
): Promise<FilterFolder[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('filter_folders')
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    // Check if it's a "table doesn't exist" error
    if (error.message.includes('filter_folders') || error.code === '42P01') {
      console.warn('Filter folders table does not exist. Please run the schema migration in supabase/schema.sql');
      return []; // Return empty array instead of throwing
    }
    console.error('Error listing filter folders:', error);
    throw new Error(`Failed to list filter folders: ${error.message}`);
  }

  return (data || []).map((item: any) => ({
    ...item,
    filter_conditions: item.filter_conditions as FilterCondition[],
  })) as FilterFolder[];
}

/**
 * Get a filter folder by ID
 */
export async function getFilterFolderById(
  folderId: string,
  userId: string,
  accessToken?: string
): Promise<FilterFolder | null> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('filter_folders')
    .select('*')
    .eq('id', folderId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error getting filter folder:', error);
    throw new Error(`Failed to get filter folder: ${error.message}`);
  }

  return {
    ...data,
    filter_conditions: data.filter_conditions as FilterCondition[],
  } as FilterFolder;
}

