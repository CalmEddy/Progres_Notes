'use client';

import { useState, useEffect } from 'react';
import { FilterCondition } from '@/lib/filters/types';
import TagSelector from './TagSelector';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { Tag } from '@/lib/tags/types';

interface FilterConditionEditorProps {
  condition: FilterCondition;
  onChange: (condition: FilterCondition) => void;
}

export default function FilterConditionEditor({
  condition,
  onChange,
}: FilterConditionEditorProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);

  useEffect(() => {
    loadTags();
  }, []);

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
        setAllTags(tags);
      }
    } catch (error) {
      console.error('Error loading tags:', error);
    }
  };

  const handleTypeChange = (type: FilterCondition['type']) => {
    // Reset to default condition based on type
    switch (type) {
      case 'keyword':
        onChange({
          type: 'keyword',
          operator: 'contains',
          value: '',
        });
        break;
      case 'embedding':
        onChange({
          type: 'embedding',
          query: '',
          threshold: 0.15,  // Lower default threshold for semantic search
        });
        break;
      case 'date_created':
      case 'date_modified':
        onChange({
          type,
          operator: 'equals',
          value: '',
        });
        break;
      case 'tag':
        onChange({
          type: 'tag',
          operator: 'in',
          tagIds: [],
        });
        break;
      case 'text_pattern':
        onChange({
          type: 'text_pattern',
          pattern: '',
        });
        break;
    }
  };

  const renderConditionInputs = () => {
    switch (condition.type) {
      case 'keyword':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Operator
              </label>
              <select
                value={condition.operator}
                onChange={(e) =>
                  onChange({
                    ...condition,
                    operator: e.target.value as 'contains' | 'not_contains',
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="contains">Contains</option>
                <option value="not_contains">Does not contain</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Keyword
              </label>
              <input
                type="text"
                value={condition.value}
                onChange={(e) =>
                  onChange({ ...condition, value: e.target.value })
                }
                placeholder="Enter keyword"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        );

      case 'embedding':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Query (semantic search)
              </label>
              <textarea
                value={condition.query}
                onChange={(e) =>
                  onChange({ ...condition, query: e.target.value })
                }
                placeholder="Enter search query"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Similarity Threshold: {condition.threshold || 0.15}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={condition.threshold || 0.15}
                onChange={(e) =>
                  onChange({
                    ...condition,
                    threshold: parseFloat(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>
          </div>
        );

      case 'date_created':
      case 'date_modified':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Operator
              </label>
              <select
                value={condition.operator}
                onChange={(e) => {
                  const newOp = e.target.value as 'equals' | 'range' | 'relative';
                  onChange({
                    ...condition,
                    operator: newOp,
                    value: newOp === 'equals' ? condition.value : undefined,
                    startDate: newOp === 'range' ? condition.startDate : undefined,
                    endDate: newOp === 'range' ? condition.endDate : undefined,
                    relativeValue: newOp === 'relative' ? condition.relativeValue : undefined,
                  });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="equals">Equals</option>
                <option value="range">Date Range</option>
                <option value="relative">Relative (e.g., "last Monday")</option>
              </select>
            </div>
            {condition.operator === 'equals' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={condition.value || ''}
                  onChange={(e) =>
                    onChange({ ...condition, value: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            {condition.operator === 'range' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={condition.startDate || ''}
                    onChange={(e) =>
                      onChange({ ...condition, startDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={condition.endDate || ''}
                    onChange={(e) =>
                      onChange({ ...condition, endDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
            {condition.operator === 'relative' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Relative Date
                </label>
                <input
                  type="text"
                  value={condition.relativeValue || ''}
                  onChange={(e) =>
                    onChange({ ...condition, relativeValue: e.target.value })
                  }
                  placeholder='e.g., "last Monday", "this week", "last month"'
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Examples: "today", "yesterday", "this week", "last week", "last Monday", "this month", "last month", "last 7 days"
                </p>
              </div>
            )}
          </div>
        );

      case 'tag':
        const selectedTagIds = condition.tagIds || [];
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Operator
              </label>
              <select
                value={condition.operator}
                onChange={(e) =>
                  onChange({
                    ...condition,
                    operator: e.target.value as 'equals' | 'in',
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="equals">Equals (single tag)</option>
                <option value="in">In (any of these tags)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags
              </label>
              <TagSelector
                selectedTagIds={selectedTagIds}
                onSelectionChange={(tagIds) =>
                  onChange({ ...condition, tagIds })
                }
                placeholder="Select tags..."
              />
            </div>
          </div>
        );

      case 'text_pattern':
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pattern
            </label>
            <input
              type="text"
              value={condition.pattern}
              onChange={(e) =>
                onChange({ ...condition, pattern: e.target.value })
              }
              placeholder='e.g., "**", "TODO:", "@mention"'
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Notes containing this exact text pattern will match.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Condition Type
        </label>
        <select
          value={condition.type}
          onChange={(e) =>
            handleTypeChange(e.target.value as FilterCondition['type'])
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="keyword">Keyword</option>
          <option value="embedding">Semantic Search (Embedding)</option>
          <option value="date_created">Date Created</option>
          <option value="date_modified">Date Modified</option>
          <option value="tag">Tag</option>
          <option value="text_pattern">Text Pattern</option>
        </select>
      </div>
      {renderConditionInputs()}
    </div>
  );
}

