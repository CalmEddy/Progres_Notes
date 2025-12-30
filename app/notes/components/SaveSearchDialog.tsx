'use client';

import { useState } from 'react';
import { SearchCriteria } from '@/lib/collections/types';

interface SaveSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, searchCriteria: SearchCriteria) => Promise<void>;
  searchCriteria: SearchCriteria | null;
}

export default function SaveSearchDialog({
  isOpen,
  onClose,
  onSave,
  searchCriteria,
}: SaveSearchDialogProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !searchCriteria) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Collection name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave(name.trim(), searchCriteria);
      setName('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save search');
    } finally {
      setSaving(false);
    }
  };

  const getSearchTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      keyword: 'Keyword',
      semantic: 'Semantic',
      chunk_semantic: 'Chunk Semantic',
      theme: 'Theme',
      date_created: 'Date Created',
      date_modified: 'Date Modified',
      combined: 'Combined',
    };
    return labels[type] || type;
  };

  const formatSearchPreview = (criteria: SearchCriteria): string => {
    const parts: string[] = [];
    
    if (criteria.query) {
      parts.push(`Query: "${criteria.query}"`);
    }
    
    if (criteria.chunk_id) {
      parts.push('Search by chunk');
    }
    
    if (criteria.search_type) {
      parts.push(`Type: ${getSearchTypeLabel(criteria.search_type)}`);
    }
    
    if (criteria.match_threshold) {
      parts.push(`Threshold: ${(criteria.match_threshold * 100).toFixed(0)}%`);
    }
    
    if (criteria.filters) {
      if (criteria.filters.dateCreated) {
        const { start, end } = criteria.filters.dateCreated;
        if (start || end) {
          parts.push(`Created: ${start || 'any'} to ${end || 'any'}`);
        }
      }
      if (criteria.filters.dateModified) {
        const { start, end } = criteria.filters.dateModified;
        if (start || end) {
          parts.push(`Modified: ${start || 'any'} to ${end || 'any'}`);
        }
      }
      if (criteria.filters.tagIds && criteria.filters.tagIds.length > 0) {
        parts.push(`Tags: ${criteria.filters.tagIds.length} selected`);
      }
    }
    
    return parts.join(' • ') || 'No criteria specified';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Save Search as Collection</h2>
        </div>
        
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Collection Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="Enter collection name..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                } else if (e.key === 'Escape') {
                  onClose();
                }
              }}
            />
            {error && (
              <p className="mt-1 text-sm text-red-600">{error}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search Criteria Preview
            </label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
              {formatSearchPreview(searchCriteria)}
            </div>
          </div>
        </div>
        
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Create Collection'}
          </button>
        </div>
      </div>
    </div>
  );
}

