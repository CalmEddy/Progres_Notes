'use client';

import { useState, useEffect, useRef } from 'react';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { Tag } from '@/lib/tags/types';
import { SearchCriteria } from '@/lib/collections/types';

export type SearchType = 'keyword' | 'semantic' | 'theme' | 'combined' | 'auto';

interface BinderSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchTypeChange?: (type: SearchType) => void;
  onFiltersChange?: (filters: {
    dateCreated?: { start?: string; end?: string };
    dateModified?: { start?: string; end?: string };
    tagIds?: string[];
    themeId?: string;
  }) => void;
  onThresholdChange?: (threshold: number) => void;
  resultCount?: number;
  threshold?: number;
  onSaveAsCollection?: (searchCriteria: SearchCriteria) => void;
}

export default function BinderSearch({
  searchQuery,
  onSearchChange,
  onSearchTypeChange,
  onFiltersChange,
  onThresholdChange,
  resultCount,
  threshold = 0.7,
  onSaveAsCollection,
}: BinderSearchProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchType, setSearchType] = useState<SearchType>('auto');
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [dateCreatedStart, setDateCreatedStart] = useState('');
  const [dateCreatedEnd, setDateCreatedEnd] = useState('');
  const [dateModifiedStart, setDateModifiedStart] = useState('');
  const [dateModifiedEnd, setDateModifiedEnd] = useState('');
  const [localThreshold, setLocalThreshold] = useState(threshold);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync local threshold with prop
  useEffect(() => {
    setLocalThreshold(threshold);
  }, [threshold]);

  // Load available tags
  useEffect(() => {
    const loadTags = async () => {
      try {
        const supabase = createSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (session.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const response = await fetch('/api/tags', { headers });
        if (response.ok) {
          const tags = await response.json();
          setAvailableTags(tags || []);
        }
      } catch (err) {
        console.error('Error loading tags:', err);
      }
    };

    loadTags();
  }, []);

  // Keyboard shortcut (Cmd/Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchTypeChange = (type: SearchType) => {
    setSearchType(type);
    onSearchTypeChange?.(type);
  };

  const handleTagToggle = (tagId: string) => {
    const newTagIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter(id => id !== tagId)
      : [...selectedTagIds, tagId];
    setSelectedTagIds(newTagIds);
    onFiltersChange?.({
      dateCreated: dateCreatedStart || dateCreatedEnd ? { start: dateCreatedStart, end: dateCreatedEnd } : undefined,
      dateModified: dateModifiedStart || dateModifiedEnd ? { start: dateModifiedStart, end: dateModifiedEnd } : undefined,
      tagIds: newTagIds.length > 0 ? newTagIds : undefined,
    });
  };

  const handleDateChange = () => {
    onFiltersChange?.({
      dateCreated: dateCreatedStart || dateCreatedEnd ? { start: dateCreatedStart, end: dateCreatedEnd } : undefined,
      dateModified: dateModifiedStart || dateModifiedEnd ? { start: dateModifiedStart, end: dateModifiedEnd } : undefined,
      tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    });
  };

  const clearFilters = () => {
    setSelectedTagIds([]);
    setDateCreatedStart('');
    setDateCreatedEnd('');
    setDateModifiedStart('');
    setDateModifiedEnd('');
    onFiltersChange?.({});
  };

  const hasActiveFilters = selectedTagIds.length > 0 || dateCreatedStart || dateCreatedEnd || dateModifiedStart || dateModifiedEnd;

  const handleSaveAsCollection = () => {
    if (!onSaveAsCollection || !searchQuery.trim()) return;
    
    // Map search types to valid SearchCriteria types
    let mappedSearchType: SearchCriteria['search_type'] = 'combined';
    if (searchType === 'keyword') {
      mappedSearchType = 'keyword';
    } else if (searchType === 'semantic') {
      mappedSearchType = 'semantic';
    } else if (searchType === 'theme') {
      mappedSearchType = 'theme';
    } else if (searchType === 'combined') {
      mappedSearchType = 'combined';
    } else {
      // 'auto' defaults to 'combined'
      mappedSearchType = 'combined';
    }
    
    const searchCriteria: SearchCriteria = {
      search_type: mappedSearchType,
      query: searchQuery,
      match_threshold: threshold,
      filters: {
        dateCreated: dateCreatedStart || dateCreatedEnd ? { start: dateCreatedStart, end: dateCreatedEnd } : undefined,
        dateModified: dateModifiedStart || dateModifiedEnd ? { start: dateModifiedStart, end: dateModifiedEnd } : undefined,
        tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      },
    };
    
    onSaveAsCollection(searchCriteria);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search binder... (Cmd/Ctrl+K)"
          className="w-full px-3 py-2 pl-9 pr-20 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <svg
          className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {resultCount !== undefined && searchQuery && (
            <span className="text-xs text-gray-500 px-2">{resultCount} results</span>
          )}
          {onSaveAsCollection && resultCount !== undefined && resultCount > 0 && searchQuery && (
            <button
              onClick={handleSaveAsCollection}
              className="text-gray-400 hover:text-blue-600"
              title="Save search as collection"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          )}
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="text-gray-400 hover:text-gray-600"
              title="Clear search"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`text-gray-400 hover:text-gray-600 ${showAdvanced ? 'text-blue-600' : ''}`}
            title="Advanced search"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
        </div>
      </div>

      {showAdvanced && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3 text-sm">
          {/* Search Type Selector */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Search Type</label>
            <select
              value={searchType}
              onChange={(e) => handleSearchTypeChange(e.target.value as SearchType)}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="auto">Auto (Smart Detection)</option>
              <option value="keyword">Keyword</option>
              <option value="semantic">Semantic</option>
              <option value="theme">Theme</option>
              <option value="combined">Combined</option>
            </select>
          </div>

          {/* Threshold Slider - Only show for semantic or combined search */}
          {(searchType === 'semantic' || searchType === 'combined') && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-700">
                  Similarity Threshold
                </label>
                <span className="text-xs text-gray-600 font-mono">
                  {localThreshold.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.3"
                max="0.95"
                step="0.05"
                value={localThreshold}
                onChange={(e) => {
                  const newThreshold = parseFloat(e.target.value);
                  setLocalThreshold(newThreshold);
                  onThresholdChange?.(newThreshold);
                }}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                style={{
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((localThreshold - 0.3) / 0.65) * 100}%, #e5e7eb ${((localThreshold - 0.3) / 0.65) * 100}%, #e5e7eb 100%)`
                }}
              />
              <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                <span>More Results (0.3)</span>
                <span>More Precise (0.95)</span>
              </div>
            </div>
          )}

          {/* Date Filters */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Created After</label>
              <input
                type="date"
                value={dateCreatedStart}
                onChange={(e) => {
                  setDateCreatedStart(e.target.value);
                  handleDateChange();
                }}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Created Before</label>
              <input
                type="date"
                value={dateCreatedEnd}
                onChange={(e) => {
                  setDateCreatedEnd(e.target.value);
                  handleDateChange();
                }}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Modified After</label>
              <input
                type="date"
                value={dateModifiedStart}
                onChange={(e) => {
                  setDateModifiedStart(e.target.value);
                  handleDateChange();
                }}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Modified Before</label>
              <input
                type="date"
                value={dateModifiedEnd}
                onChange={(e) => {
                  setDateModifiedEnd(e.target.value);
                  handleDateChange();
                }}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Tag Filters */}
          {availableTags.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Filter by Tags</label>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {availableTags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => handleTagToggle(tag.id)}
                    className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                      selectedTagIds.includes(tag.id)
                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    style={tag.color ? { borderColor: tag.color, color: tag.color } : {}}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="w-full px-2 py-1 text-xs text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-100"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

