'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tag } from '@/lib/tags/types';
import TagChip from './TagChip';
import { createSupabaseClient } from '@/lib/supabaseClient';

interface TagManagerProps {
  onTagSelect?: (tag: Tag) => void;
  onClose?: () => void;
}

export default function TagManager({ onTagSelect, onClose }: TagManagerProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6B7280');

  const defaultColors = [
    '#6B7280', '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
    '#8B5CF6', '#EC4899', '#F97316', '#84CC16', '#06B6D4',
  ];

  const loadTags = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/tags', { headers });
      if (response.ok) {
        const loadedTags = await response.json();
        setTags(loadedTags);
      }
    } catch (error) {
      console.error('Error loading tags:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleDeleteTag = async (tagId: string) => {
    if (!confirm('Are you sure you want to delete this tag? This will remove it from all notes.')) {
      return;
    }

    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/tags/${tagId}`, {
        method: 'DELETE',
        headers,
      });

      if (response.ok) {
        await loadTags();
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to delete tag');
      }
    } catch (error) {
      console.error('Error deleting tag:', error);
      alert('Failed to delete tag');
    }
  };

  const handleStartEdit = (tag: Tag) => {
    setEditingTag(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || '#6B7280');
  };

  const handleSaveEdit = async (tagId: string) => {
    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/tags/${tagId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          name: editName.trim(),
          color: editColor || null,
        }),
      });

      if (response.ok) {
        await loadTags();
        setEditingTag(null);
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to update tag');
      }
    } catch (error) {
      console.error('Error updating tag:', error);
      alert('Failed to update tag');
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      alert('Tag name is required');
      return;
    }

    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/tags', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newTagName.trim(),
          color: newTagColor || null,
        }),
      });

      if (response.ok) {
        await loadTags();
        setNewTagName('');
        setNewTagColor('#6B7280');
        setShowCreateForm(false);
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Failed to create tag');
      }
    } catch (error) {
      console.error('Error creating tag:', error);
      alert('Failed to create tag');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">Loading tags...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Manage Tags</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Create Tag Form */}
        {showCreateForm ? (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Create New Tag</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tag Name
                </label>
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter tag name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <div className="flex gap-2">
                    {defaultColors.map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewTagColor(color)}
                        className={`w-8 h-8 rounded border-2 ${
                          newTagColor === color ? 'border-gray-900' : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateTag}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewTagName('');
                    setNewTagColor('#6B7280');
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreateForm(true)}
            className="mb-6 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New Tag
          </button>
        )}

        {/* Tags List */}
        {tags.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No tags yet. Create your first tag!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {editingTag === tag.id ? (
                  <div className="flex-1 flex items-center gap-3">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <button
                      onClick={() => handleSaveEdit(tag.id)}
                      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingTag(null);
                        setEditName('');
                        setEditColor('');
                      }}
                      className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 flex-1">
                      <TagChip tag={tag} size="md" />
                      <button
                        onClick={() => onTagSelect?.(tag)}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        View notes
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartEdit(tag)}
                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                        title="Edit tag"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteTag(tag.id)}
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete tag"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

