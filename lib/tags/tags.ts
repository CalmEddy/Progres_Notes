import { createSupabaseServerClient } from '../supabaseServerClient';
import { createClient } from '@supabase/supabase-js';
import { Tag, NoteTag } from './types';

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
 * Create a new tag for a user
 */
export async function createTag(
  userId: string,
  name: string,
  color: string | null = null,
  accessToken?: string
): Promise<Tag> {
  if (!name || name.trim().length === 0) {
    throw new Error('Tag name cannot be empty');
  }

  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('tags')
    .insert({
      user_id: userId,
      name: name.trim(),
      color: color || null,
    })
    .select()
    .single();

  if (error) {
    // Check if it's a unique constraint violation
    if (error.code === '23505') {
      throw new Error(`Tag "${name.trim()}" already exists`);
    }
    console.error('Error creating tag:', error);
    throw new Error(`Failed to create tag: ${error.message}`);
  }

  if (!data) {
    throw new Error('Tag created but no data returned');
  }

  return data as Tag;
}

/**
 * Update an existing tag
 */
export async function updateTag(
  tagId: string,
  userId: string,
  updates: {
    name?: string;
    color?: string | null;
  },
  accessToken?: string
): Promise<Tag> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const updateData: Partial<Tag> = {};
  if (updates.name !== undefined) {
    if (!updates.name || updates.name.trim().length === 0) {
      throw new Error('Tag name cannot be empty');
    }
    updateData.name = updates.name.trim();
  }
  if (updates.color !== undefined) {
    updateData.color = updates.color;
  }

  const { data, error } = await supabase
    .from('tags')
    .update(updateData)
    .eq('id', tagId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Tag "${updates.name?.trim()}" already exists`);
    }
    console.error('Error updating tag:', error);
    throw new Error(`Failed to update tag: ${error.message}`);
  }

  if (!data) {
    throw new Error('Tag updated but no data returned');
  }

  return data as Tag;
}

/**
 * Delete a tag (and remove all note-tag associations)
 */
export async function deleteTag(
  tagId: string,
  userId: string,
  accessToken?: string
): Promise<void> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Delete the tag (cascade will handle note_tags deletions)
  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('id', tagId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting tag:', error);
    throw new Error(`Failed to delete tag: ${error.message}`);
  }
}

/**
 * List all tags for a user
 */
export async function listTagsForUser(
  userId: string,
  accessToken?: string
): Promise<Tag[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error listing tags:', error);
    throw new Error(`Failed to list tags: ${error.message}`);
  }

  return (data || []) as Tag[];
}

/**
 * Get a tag by ID
 */
export async function getTagById(
  tagId: string,
  userId: string,
  accessToken?: string
): Promise<Tag | null> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('id', tagId)
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error getting tag:', error);
    throw new Error(`Failed to get tag: ${error.message}`);
  }

  return data as Tag;
}

/**
 * Get all tags for a specific note
 */
export async function getTagsForNote(
  noteId: string,
  userId: string,
  accessToken?: string
): Promise<Tag[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('note_tags')
    .select(`
      tag:tags!inner (
        id,
        user_id,
        name,
        color,
        created_at,
        updated_at
      )
    `)
    .eq('note_id', noteId)
    .eq('tag.user_id', userId);

  if (error) {
    console.error('Error getting tags for note:', error);
    throw new Error(`Failed to get tags for note: ${error.message}`);
  }

  // Extract tags from the joined result
  return ((data || []) as any[]).map((item: any) => item.tag) as Tag[];
}

/**
 * Assign tags to a note (replaces existing tags)
 */
export async function assignTagsToNote(
  noteId: string,
  userId: string,
  tagIds: string[],
  accessToken?: string
): Promise<void> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // First, verify the note belongs to the user
  const { data: note } = await supabase
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .eq('user_id', userId)
    .single();

  if (!note) {
    throw new Error('Note not found or access denied');
  }

  // Verify all tags belong to the user
  if (tagIds.length > 0) {
    const { data: tags } = await supabase
      .from('tags')
      .select('id')
      .eq('user_id', userId)
      .in('id', tagIds);

    if (!tags || tags.length !== tagIds.length) {
      throw new Error('One or more tags not found or access denied');
    }
  }

  // Remove existing tag associations
  await supabase
    .from('note_tags')
    .delete()
    .eq('note_id', noteId);

  // Add new tag associations
  if (tagIds.length > 0) {
    const { error } = await supabase
      .from('note_tags')
      .insert(
        tagIds.map(tagId => ({
          note_id: noteId,
          tag_id: tagId,
        }))
      );

    if (error) {
      console.error('Error assigning tags to note:', error);
      throw new Error(`Failed to assign tags: ${error.message}`);
    }
  }
}

/**
 * Add a single tag to a note (doesn't remove existing tags)
 */
export async function addTagToNote(
  noteId: string,
  tagId: string,
  userId: string,
  accessToken?: string
): Promise<void> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Verify note and tag belong to user
  const [noteResult, tagResult] = await Promise.all([
    supabase
      .from('notes')
      .select('id')
      .eq('id', noteId)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('tags')
      .select('id')
      .eq('id', tagId)
      .eq('user_id', userId)
      .single(),
  ]);

  if (!noteResult.data) {
    throw new Error('Note not found or access denied');
  }
  if (!tagResult.data) {
    throw new Error('Tag not found or access denied');
  }

  // Insert tag association (unique constraint will prevent duplicates)
  const { error } = await supabase
    .from('note_tags')
    .insert({
      note_id: noteId,
      tag_id: tagId,
    });

  if (error) {
    // Ignore duplicate key errors
    if (error.code !== '23505') {
      console.error('Error adding tag to note:', error);
      throw new Error(`Failed to add tag: ${error.message}`);
    }
  }
}

/**
 * Remove a tag from a note
 */
export async function removeTagFromNote(
  noteId: string,
  tagId: string,
  userId: string,
  accessToken?: string
): Promise<void> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Verify note belongs to user first
  const { data: note } = await supabase
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .eq('user_id', userId)
    .single();

  if (!note) {
    throw new Error('Note not found or access denied');
  }

  // Delete the tag association (RLS policies will ensure user owns the tag)
  const { error } = await supabase
    .from('note_tags')
    .delete()
    .eq('note_id', noteId)
    .eq('tag_id', tagId);

  if (error) {
    console.error('Error removing tag from note:', error);
    throw new Error(`Failed to remove tag: ${error.message}`);
  }
}

/**
 * Get all notes with a specific tag
 */
export async function getNotesWithTag(
  tagId: string,
  userId: string,
  accessToken?: string
): Promise<string[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Verify tag belongs to user
  const { data: tag } = await supabase
    .from('tags')
    .select('id')
    .eq('id', tagId)
    .eq('user_id', userId)
    .single();

  if (!tag) {
    throw new Error('Tag not found or access denied');
  }

  // Get note_ids from note_tags where notes belong to user
  // Use a join to ensure we only get notes owned by the user
  const { data, error } = await supabase
    .from('note_tags')
    .select(`
      note_id,
      note:notes!inner(id, user_id)
    `)
    .eq('tag_id', tagId)
    .eq('note.user_id', userId);

  if (error) {
    console.error('Error getting notes with tag:', error);
    throw new Error(`Failed to get notes with tag: ${error.message}`);
  }

  return ((data || []) as any[]).map((item: any) => item.note_id) as string[];
}

