'use client';

import { useState, useCallback, useEffect } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { Collection } from '@/lib/collections/types';
import { CollectionBinderItemWithChunk } from '@/lib/collections/types';
import { BinderItem } from '@/lib/binder/types';
import CollectionTree from './CollectionTree';
import { buildCollectionTree, moveItemInCollectionTree } from '../utils/collectionStateUtils';
import SearchCollectionBadge from './SearchCollectionBadge';

interface CollectionSidebarProps {
  selectedCollectionId: string | null;
  selectedChunkId: string | null;
  onCollectionSelect: (collectionId: string | null) => void;
  onChunkSelect?: (chunk: BinderItem) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function CollectionSidebar({
  selectedCollectionId,
  selectedChunkId,
  onCollectionSelect,
  onChunkSelect,
  collapsed,
  onToggleCollapse,
}: CollectionSidebarProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [binderItems, setBinderItems] = useState<CollectionBinderItemWithChunk[]>([]);
  const [binderTree, setBinderTree] = useState<BinderItem[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const loadCollections = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/collections', { headers });
      if (!response.ok) {
        throw new Error('Failed to load collections');
      }

      const data = await response.json();
      setCollections(data || []);
    } catch (err) {
      console.error('Error loading collections:', err);
      setError(err instanceof Error ? err.message : 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBinderItems = useCallback(async (collectionId: string) => {
    try {
      setLoading(true);
      setError(null);

      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/collections/${collectionId}/binder`, { headers });
      if (!response.ok) {
        throw new Error('Failed to load binder items');
      }

      const data = await response.json();
      const items = data.items || [];
      setBinderItems(items);
      setBinderTree(buildCollectionTree(items));
    } catch (err) {
      console.error('Error loading binder items:', err);
      setError(err instanceof Error ? err.message : 'Failed to load binder items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    if (selectedCollectionId) {
      loadBinderItems(selectedCollectionId);
    } else {
      setBinderItems([]);
      setBinderTree([]);
    }
  }, [selectedCollectionId, loadBinderItems]);

  const handleToggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveId(null);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // TODO: Implement move logic with API call
    console.log('Drag end:', { active: active.id, over: over.id });
  }, []);

  const handleCreateCollection = useCallback(async () => {
    const name = prompt('Collection name:');
    if (!name) return;

    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/collections', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name }),
      });

      if (response.ok) {
        await loadCollections();
      }
    } catch (err) {
      console.error('Error creating collection:', err);
    }
  }, [loadCollections]);

  if (collapsed) {
    return (
      <div className="w-12 border-r border-gray-200 bg-gray-50 flex flex-col items-center py-2">
        <button
          onClick={onToggleCollapse}
          className="p-2 hover:bg-gray-200 rounded"
        >
          ▶
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">Collections</h2>
            <button
              onClick={onToggleCollapse}
              className="p-1 hover:bg-gray-200 rounded text-gray-500"
            >
              ◀
            </button>
          </div>
          <button
            onClick={handleCreateCollection}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            + New Collection
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-gray-500">Loading...</div>
          ) : error ? (
            <div className="p-4 text-center text-sm text-red-500">{error}</div>
          ) : collections.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">No collections</div>
          ) : (
            <div>
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  onClick={() => onCollectionSelect(collection.id)}
                  className={`w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center justify-between gap-2 ${
                    selectedCollectionId === collection.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <span className="flex-1 truncate">{collection.name}</span>
                  {collection.is_search_collection && (
                    <SearchCollectionBadge />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedCollectionId && (
          <div className="border-t border-gray-200 flex-1 overflow-y-auto">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <h3 className="text-xs font-semibold text-gray-700">Binder</h3>
            </div>
            <CollectionTree
              items={binderTree}
              selectedChunkId={selectedChunkId}
              expandedFolders={expandedFolders}
              onChunkSelect={onChunkSelect}
              onToggleFolder={handleToggleFolder}
              onStructureChange={() => loadBinderItems(selectedCollectionId)}
            />
          </div>
        )}
      </DndContext>
    </div>
  );
}

