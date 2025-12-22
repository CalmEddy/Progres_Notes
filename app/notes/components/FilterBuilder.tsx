'use client';

import { useState } from 'react';
import { FilterCondition } from '@/lib/filters/types';
import FilterConditionEditor from './FilterConditionEditor';
import { createSupabaseClient } from '@/lib/supabaseClient';

interface FilterBuilderProps {
  onSave?: (name: string, conditions: FilterCondition[]) => void;
  onCancel?: () => void;
  initialName?: string;
  initialConditions?: FilterCondition[];
}

export default function FilterBuilder({
  onSave,
  onCancel,
  initialName = '',
  initialConditions = [],
}: FilterBuilderProps) {
  const [name, setName] = useState(initialName);
  const [conditions, setConditions] = useState<FilterCondition[]>(initialConditions);
  const [saving, setSaving] = useState(false);

  const handleAddCondition = () => {
    // Add a default keyword condition
    setConditions([
      ...conditions,
      {
        type: 'keyword',
        operator: 'contains',
        value: '',
      },
    ]);
  };

  const handleRemoveCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleUpdateCondition = (index: number, condition: FilterCondition) => {
    const updated = [...conditions];
    updated[index] = condition;
    setConditions(updated);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Filter name is required');
      return;
    }

    if (conditions.length === 0) {
      alert('At least one filter condition is required');
      return;
    }

    // Validate all conditions
    for (const condition of conditions) {
      if (condition.type === 'keyword' && !condition.value.trim()) {
        alert('Keyword condition requires a value');
        return;
      }
      if (condition.type === 'embedding' && !condition.query.trim()) {
        alert('Embedding condition requires a query');
        return;
      }
      if (condition.type === 'text_pattern' && !condition.pattern.trim()) {
        alert('Text pattern condition requires a pattern');
        return;
      }
      if ((condition.type === 'date_created' || condition.type === 'date_modified')) {
        if (condition.operator === 'equals' && !condition.value) {
          alert('Date condition requires a value');
          return;
        }
        if (condition.operator === 'range' && (!condition.startDate || !condition.endDate)) {
          alert('Date range condition requires both start and end dates');
          return;
        }
        if (condition.operator === 'relative' && !condition.relativeValue) {
          alert('Relative date condition requires a relative value');
          return;
        }
      }
      if (condition.type === 'tag' && condition.tagIds.length === 0) {
        alert('Tag condition requires at least one tag');
        return;
      }
    }

    setSaving(true);
    try {
      if (onSave) {
        await onSave(name.trim(), conditions);
      }
    } catch (error) {
      console.error('Error saving filter:', error);
      alert('Failed to save filter');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg border border-gray-200 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold text-gray-900 mb-4">
        {initialName ? 'Edit Filter' : 'Create Filter Folder'}
      </h2>

      {/* Filter Name */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Filter Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Notes from last week with 'important'"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Conditions */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-gray-700">
            Filter Conditions (All conditions are combined with AND)
          </label>
          <button
            onClick={handleAddCondition}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Condition
          </button>
        </div>

        {conditions.length === 0 ? (
          <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
            <p>No conditions yet. Click "Add Condition" to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {conditions.map((condition, index) => (
              <div
                key={index}
                className="p-4 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">
                    Condition {index + 1}
                  </span>
                  <button
                    onClick={() => handleRemoveCondition(index)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                </div>
                <FilterConditionEditor
                  condition={condition}
                  onChange={(updated) => handleUpdateCondition(index, updated)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || conditions.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Filter'}
        </button>
      </div>
    </div>
  );
}

