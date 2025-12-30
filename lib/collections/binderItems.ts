import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabaseServerClient';
import { CollectionBinderItem } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Helper to create an authenticated Supabase client with user session
 */
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
 * Create a binder item (folder or chunk_ref)
 */
export async function createBinderItem(
  collectionId: string,
  userId: string,
  itemData: {
    item_type: 'folder' | 'chunk_ref';
    title?: string | null;
    chunk_id?: string | null; // Required for chunk_ref
    parent_id?: string | null;
    position?: number;
  },
  accessToken?: string
): Promise<CollectionBinderItem> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Validate chunk_ref has chunk_id
  if (itemData.item_type === 'chunk_ref' && !itemData.chunk_id) {
    throw new Error('chunk_ref items require chunk_id');
  }

  // Validate folder doesn't have chunk_id
  if (itemData.item_type === 'folder' && itemData.chunk_id) {
    throw new Error('folder items cannot have chunk_id');
  }

  // Determine position if not provided
  let position = itemData.position;
  if (position === undefined) {
    const { data: siblings } = await supabase
      .from('collection_binder_items')
      .select('position')
      .eq('collection_id', collectionId)
      .eq('parent_id', itemData.parent_id || null)
      .is('trashed_at', null)
      .order('position', { ascending: false })
      .limit(1);

    position = siblings && siblings.length > 0
      ? (siblings[0].position || 0) + 1
      : 0;
  } else {
    // Shift other items to make room
    const { data: itemsToShift } = await supabase
      .from('collection_binder_items')
      .select('id, position')
      .eq('collection_id', collectionId)
      .eq('parent_id', itemData.parent_id || null)
      .gte('position', position)
      .is('trashed_at', null);

    if (itemsToShift && itemsToShift.length > 0) {
      for (const item of itemsToShift) {
        await supabase
          .from('collection_binder_items')
          .update({ position: (item.position || 0) + 1 })
          .eq('id', item.id);
      }
    }
  }

  const { data, error } = await supabase
    .from('collection_binder_items')
    .insert({
      user_id: userId,
      collection_id: collectionId,
      parent_id: itemData.parent_id || null,
      position: position,
      item_type: itemData.item_type,
      title: itemData.title || null,
      chunk_id: itemData.chunk_id || null,
      is_muted: false,
      trashed_at: null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating binder item:', error);
    throw new Error(`Failed to create binder item: ${error.message}`);
  }

  if (!data) {
    throw new Error('Binder item created but no data returned');
  }

  return data as CollectionBinderItem;
}

/**
 * Move a binder item to a new parent and position
 */
export async function moveBinderItem(
  itemId: string,
  userId: string,
  newParentId: string | null,
  newPosition: number,
  accessToken?: string
): Promise<void> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Get current item
  const { data: item, error: getError } = await supabase
    .from('collection_binder_items')
    .select('collection_id, parent_id, position')
    .eq('id', itemId)
    .eq('user_id', userId)
    .single();

  if (getError || !item) {
    throw new Error('Binder item not found or unauthorized');
  }

  const collectionId = item.collection_id;
  const oldParentId = item.parent_id;
  const oldPosition = item.position;

  // If moving within the same parent, handle position shifts
  if (oldParentId === newParentId && oldPosition !== newPosition) {
    if (newPosition > oldPosition) {
      // Moving down: shift items between old and new positions up
      const { data: itemsToShift } = await supabase
        .from('collection_binder_items')
        .select('id, position')
        .eq('collection_id', collectionId)
        .eq('parent_id', newParentId || null)
        .gt('position', oldPosition)
        .lte('position', newPosition)
        .neq('id', itemId)
        .is('trashed_at', null);

      if (itemsToShift) {
        for (const shiftItem of itemsToShift) {
          await supabase
            .from('collection_binder_items')
            .update({ position: (shiftItem.position || 0) - 1 })
            .eq('id', shiftItem.id);
        }
      }
    } else {
      // Moving up: shift items between new and old positions down
      const { data: itemsToShift } = await supabase
        .from('collection_binder_items')
        .select('id, position')
        .eq('collection_id', collectionId)
        .eq('parent_id', newParentId || null)
        .gte('position', newPosition)
        .lt('position', oldPosition)
        .neq('id', itemId)
        .is('trashed_at', null);

      if (itemsToShift) {
        for (const shiftItem of itemsToShift) {
          await supabase
            .from('collection_binder_items')
            .update({ position: (shiftItem.position || 0) + 1 })
            .eq('id', shiftItem.id);
        }
      }
    }
  } else {
    // Moving to different parent or root
    // Shift items at target position
    const { data: targetItems } = await supabase
      .from('collection_binder_items')
      .select('id, position')
      .eq('collection_id', collectionId)
      .eq('parent_id', newParentId || null)
      .gte('position', newPosition)
      .neq('id', itemId)
      .is('trashed_at', null);

    if (targetItems) {
      for (const targetItem of targetItems) {
        await supabase
          .from('collection_binder_items')
          .update({ position: (targetItem.position || 0) + 1 })
          .eq('id', targetItem.id);
      }
    }

    // Shift items in old parent
    const { data: oldParentItems } = await supabase
      .from('collection_binder_items')
      .select('id, position')
      .eq('collection_id', collectionId)
      .eq('parent_id', oldParentId || null)
      .gt('position', oldPosition)
      .neq('id', itemId)
      .is('trashed_at', null);

    if (oldParentItems) {
      for (const oldItem of oldParentItems) {
        await supabase
          .from('collection_binder_items')
          .update({ position: (oldItem.position || 0) - 1 })
          .eq('id', oldItem.id);
      }
    }
  }

  // Update the item
  const { error: updateError } = await supabase
    .from('collection_binder_items')
    .update({
      parent_id: newParentId,
      position: newPosition,
    })
    .eq('id', itemId)
    .eq('user_id', userId);

  if (updateError) {
    console.error('Error moving binder item:', updateError);
    throw new Error(`Failed to move binder item: ${updateError.message}`);
  }
}

/**
 * Update a binder item (rename, mute, etc.)
 */
export async function updateBinderItem(
  itemId: string,
  userId: string,
  updates: Partial<Pick<CollectionBinderItem, 'title' | 'is_muted'>>,
  accessToken?: string
): Promise<CollectionBinderItem> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('collection_binder_items')
    .update(updates)
    .eq('id', itemId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating binder item:', error);
    throw new Error(`Failed to update binder item: ${error.message}`);
  }

  if (!data) {
    throw new Error('Binder item not found or unauthorized');
  }

  return data as CollectionBinderItem;
}

/**
 * Soft-delete a binder item (set trashed_at)
 */
export async function deleteBinderItem(
  itemId: string,
  userId: string,
  accessToken?: string
): Promise<void> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { error } = await supabase
    .from('collection_binder_items')
    .update({ trashed_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('user_id', userId)
    .is('trashed_at', null); // Only update if not already trashed

  if (error) {
    console.error('Error deleting binder item:', error);
    throw new Error(`Failed to delete binder item: ${error.message}`);
  }
}

