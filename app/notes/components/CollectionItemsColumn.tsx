'use client';

import { useState, useEffect, useCallback } from 'react';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { CollectionBinderItemWithChunk } from '@/lib/collections/types';
import { BinderItem } from '@/lib/binder/types';

interface CollectionItemsColumnProps {
  collectionId: string;
  parentFolderId?: string | null;
  selectedItemId?: string | null;
  onItemSelect: (item: CollectionBinderItemWithChunk) => void;
  onRemove?: (itemId: string) => void;
  onNavigateUp?: () => void;
}

export default function CollectionItemsColumn({
  collectionId,
  parentFolderId = null,
  selectedItemId,
  onItemSelect,
  onRemove,
  onNavigateUp,
}: CollectionItemsColumnProps) {
  const [items, setItems] = useState<CollectionBinderItemWithChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load collection items');
      }

      const data = await response.json();
      const allItems = data.items || [];
      
      // Filter items by parent_id
      const filteredItems = allItems.filter((item: CollectionBinderItemWithChunk) => 
        (parentFolderId === null && item.parent_id === null) ||
        (parentFolderId !== null && item.parent_id === parentFolderId)
      );

      setItems(filteredItems);
    } catch (err) {
      console.error('Error loading collection items:', err);
      setError(err instanceof Error ? err.message : 'Failed to load collection items');
    } finally {
      setLoading(false);
    }
  }, [collectionId, parentFolderId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleRemove = useCallback(async (itemId: string) => {
    if (!onRemove) return;
    
    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/collection-binder-items/${itemId}`, {
        method: 'DELETE',
        headers,
      });

      if (response.ok) {
        onRemove(itemId);
        // Reload items
        loadItems();
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to remove item');
      }
    } catch (err) {
      console.error('Error removing item:', err);
      alert('Failed to remove item');
    }
  }, [onRemove, loadItems]);

  const getChunkPreview = (chunkText: string): string => {
    const preview = chunkText.trim().substring(0, 100);
    return preview.length < chunkText.trim().length ? preview + '...' : preview;
  };

  if (loading) {
    return (
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Collection Items</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
            <p className="text-sm text-gray-500">Loading items...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Collection Items</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-sm text-red-600 mb-2">{error}</p>
            <button
              onClick={loadItems}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Items ({items.length})
          </h2>
          {parentFolderId && onNavigateUp && (
            <button
              onClick={onNavigateUp}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              title="Go back"
            >
              ← Back
            </button>
          )}
        </div>
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">
            <p>No items in this {parentFolderId ? 'folder' : 'collection'}.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => {
              const isSelected = item.id === selectedItemId;
              const isFolder = item.item_type === 'folder';
              
              return (
                <div
                  key={item.id}
                  className={`flex items-start gap-2 hover:bg-gray-50 transition-colors ${
                    isSelected
                      ? 'bg-blue-50 border-l-4 border-blue-500'
                      : 'border-l-4 border-transparent'
                  }`}
                >
                  <button
                    onClick={() => onItemSelect(item)}
                    className="flex-1 text-left px-4 py-3"
                  >
                    {isFolder ? (
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">
                          {item.title || 'Untitled Folder'}
                        </span>
                      </div>
                    ) : item.chunk ? (
                      <>
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-500">
                              Chunk {item.chunk.chunk_index + 1}
                            </span>
                            {item.chunk.note_title && (
                              <span className="text-xs text-gray-400">
                                from {item.chunk.note_title}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 line-clamp-3">
                          {item.title || getChunkPreview(item.chunk.chunk_text)}
                        </p>
                      </>
                    ) : (
                      <div className="text-sm text-gray-500 italic">
                        Chunk not found (may have been deleted)
                      </div>
                    )}
                  </button>
                  {!isFolder && onRemove && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Remove this item from the collection?')) {
                          handleRemove(item.id);
                        }
                      }}
                      className="px-3 py-3 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Remove from collection"
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

