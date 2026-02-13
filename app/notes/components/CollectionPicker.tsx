'use client';

import { useState, useEffect, useCallback } from 'react';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { Collection } from '@/lib/collections/types';

interface CollectionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (collectionId: string) => void;
  onCreateAndSelect: (name: string) => Promise<void>;
}

export default function CollectionPicker({
  isOpen,
  onClose,
  onSelect,
  onCreateAndSelect,
}: CollectionPickerProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const loadCollections = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/collections', { headers });
      if (response.ok) {
        const data = await response.json();
        setCollections(data || []);
      }
    } catch (err) {
      console.error('Error loading collections:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadCollections();
      setSearchQuery('');
    }
  }, [isOpen, loadCollections]);

  const filteredCollections = collections.filter((collection) =>
    collection.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (collectionId: string) => {
    onSelect(collectionId);
    onClose();
  };

  const handleCreateAndSelect = async () => {
    if (searchQuery.trim()) {
      await onCreateAndSelect(searchQuery.trim());
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Add to Collection</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search Input */}
        <div className="px-4 py-3 border-b border-gray-200">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search collections or type to create new..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim() && filteredCollections.length === 0) {
                handleCreateAndSelect();
              }
            }}
          />
        </div>

        {/* Collections List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-gray-500">Loading...</div>
          ) : filteredCollections.length === 0 && searchQuery.trim() ? (
            <div className="p-4">
              <button
                onClick={handleCreateAndSelect}
                className="w-full px-4 py-3 text-left border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <div>
                    <div className="font-medium text-gray-900">Create new collection</div>
                    <div className="text-sm text-gray-500">"{searchQuery.trim()}"</div>
                  </div>
                </div>
              </button>
            </div>
          ) : filteredCollections.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">No collections found</div>
          ) : (
            <div className="py-2">
              {filteredCollections.map((collection) => (
                <button
                  key={collection.id}
                  onClick={() => handleSelect(collection.id)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                >
                  <div className="font-medium text-gray-900">{collection.name}</div>
                </button>
              ))}
              {searchQuery.trim() && !filteredCollections.some(c => c.name.toLowerCase() === searchQuery.toLowerCase().trim()) && (
                <button
                  onClick={handleCreateAndSelect}
                  className="w-full px-4 py-3 text-left border-t-2 border-dashed border-gray-300 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <div>
                      <div className="font-medium text-gray-900">Create new collection</div>
                      <div className="text-sm text-gray-500">"{searchQuery.trim()}"</div>
                    </div>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}





