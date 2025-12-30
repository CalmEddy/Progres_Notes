import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabaseServerClient';
import { Collection, CollectionBinderItem, CollectionBinderItemWithChunk, SearchCriteria } from './types';
import { executeSearchFromCriteria } from './searchExecutor';

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
 * List all collections for a user
 */
export async function listCollections(
  userId: string,
  accessToken?: string
): Promise<Collection[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing collections:', error);
    throw new Error(`Failed to list collections: ${error.message}`);
  }

  return (data || []) as Collection[];
}

/**
 * Create a new collection
 */
export async function createCollection(
  userId: string,
  name: string,
  accessToken?: string
): Promise<Collection> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Get the next position (highest position + 1)
  const { data: existingCollections } = await supabase
    .from('collections')
    .select('position')
    .eq('user_id', userId)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = existingCollections && existingCollections.length > 0
    ? (existingCollections[0].position || 0) + 1
    : 0;

  const { data, error } = await supabase
    .from('collections')
    .insert({
      user_id: userId,
      name: name.trim(),
      position: nextPosition,
      is_search_collection: false,
      search_criteria: null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating collection:', error);
    throw new Error(`Failed to create collection: ${error.message}`);
  }

  if (!data) {
    throw new Error('Collection created but no data returned');
  }

  return data as Collection;
}

/**
 * Create a new search collection from search criteria
 */
export async function createSearchCollection(
  userId: string,
  name: string,
  searchCriteria: SearchCriteria,
  accessToken?: string
): Promise<Collection> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Get the next position (highest position + 1)
  const { data: existingCollections } = await supabase
    .from('collections')
    .select('position')
    .eq('user_id', userId)
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = existingCollections && existingCollections.length > 0
    ? (existingCollections[0].position || 0) + 1
    : 0;

  const { data, error } = await supabase
    .from('collections')
    .insert({
      user_id: userId,
      name: name.trim(),
      position: nextPosition,
      is_search_collection: true,
      search_criteria: searchCriteria,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating search collection:', error);
    throw new Error(`Failed to create search collection: ${error.message}`);
  }

  if (!data) {
    throw new Error('Search collection created but no data returned');
  }

  return data as Collection;
}

/**
 * Update a collection
 */
export async function updateCollection(
  collectionId: string,
  userId: string,
  updates: Partial<Pick<Collection, 'name' | 'position'>>,
  accessToken?: string
): Promise<Collection> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('collections')
    .update(updates)
    .eq('id', collectionId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating collection:', error);
    throw new Error(`Failed to update collection: ${error.message}`);
  }

  if (!data) {
    throw new Error('Collection not found or unauthorized');
  }

  return data as Collection;
}

/**
 * Delete a collection (cascades to binder items)
 */
export async function deleteCollection(
  collectionId: string,
  userId: string,
  accessToken?: string
): Promise<void> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { error } = await supabase
    .from('collections')
    .delete()
    .eq('id', collectionId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting collection:', error);
    throw new Error(`Failed to delete collection: ${error.message}`);
  }
}

/**
 * Execute search for a search collection and return results
 */
export async function executeSearchFromCollection(
  collectionId: string,
  accessToken?: string
): Promise<ReturnType<typeof executeSearchFromCriteria>> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Get the collection
  const { data: collection, error: collectionError } = await supabase
    .from('collections')
    .select('*')
    .eq('id', collectionId)
    .single();

  if (collectionError || !collection) {
    throw new Error(`Collection not found: ${collectionError?.message || 'Unknown error'}`);
  }

  if (!collection.is_search_collection || !collection.search_criteria) {
    throw new Error('Collection is not a search collection or missing search criteria');
  }

  // Execute the search
  return executeSearchFromCriteria(
    collection.user_id,
    collection.search_criteria as SearchCriteria,
    accessToken
  );
}

/**
 * Get all binder items for a collection (single query with chunk data)
 * For search collections, this will execute the search dynamically
 */
export async function getCollectionBinderItems(
  collectionId: string,
  accessToken?: string
): Promise<CollectionBinderItemWithChunk[]> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // First check if this is a search collection
  const { data: collection, error: collectionError } = await supabase
    .from('collections')
    .select('is_search_collection, search_criteria')
    .eq('id', collectionId)
    .single();

  if (collectionError) {
    console.error('Error checking collection type:', collectionError);
    throw new Error(`Failed to get collection: ${collectionError.message}`);
  }

  // If it's a search collection, return empty array
  // Search collections don't have static binder items - they execute searches dynamically
  // The API endpoint should call executeSearchFromCollection for search collections
  if (collection?.is_search_collection) {
    return [];
  }

  // Get binder items for static collections
  const { data: items, error: itemsError } = await supabase
    .from('collection_binder_items')
    .select('*')
    .eq('collection_id', collectionId)
    .is('trashed_at', null) // Only get non-trashed items
    .order('position', { ascending: true });

  if (itemsError) {
    console.error('Error getting collection binder items:', itemsError);
    throw new Error(`Failed to get collection binder items: ${itemsError.message}`);
  }

  if (!items || items.length === 0) {
    return [];
  }

  // Get all chunk_ids that are referenced
  const chunkIds = items
    .filter(item => item.item_type === 'chunk_ref' && item.chunk_id)
    .map(item => item.chunk_id!);

  // Fetch chunks and notes separately (more reliable than join)
  let chunksMap = new Map<string, any>();
  if (chunkIds.length > 0) {
    const { data: chunks, error: chunksError } = await supabase
      .from('note_chunks')
      .select('id, chunk_text, chunk_index, note_id')
      .in('id', chunkIds)
      .is('deleted_at', null); // Only get non-deleted chunks

    if (chunksError) {
      console.error('Error getting chunks:', chunksError);
      // Don't throw - continue with null chunks
    } else if (chunks) {
      // Get unique note IDs
      const noteIds = [...new Set(chunks.map((c: any) => c.note_id))];
      
      // Fetch notes
      const { data: notes } = await supabase
        .from('notes')
        .select('id, title')
        .in('id', noteIds);

      const notesMap = new Map((notes || []).map((note: any) => [note.id, note.title]));

      // Combine chunks with note titles
      chunks.forEach((chunk: any) => {
        chunksMap.set(chunk.id, {
          id: chunk.id,
          chunk_text: chunk.chunk_text,
          chunk_index: chunk.chunk_index,
          note_id: chunk.note_id,
          note_title: notesMap.get(chunk.note_id) || null,
        });
      });
    }
  }

  // Combine items with chunk data
  return items.map((item: any) => ({
    ...item,
    chunk: item.chunk_id ? (chunksMap.get(item.chunk_id) || null) : null,
  })) as CollectionBinderItemWithChunk[];
}

