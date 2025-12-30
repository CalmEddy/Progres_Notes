'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { ConversationWithMessages } from '@/lib/conversations/types';
import { NoteChunk } from '@/lib/chunks/chunking';

interface ConversationReviewProps {
  conversationId: string;
  onClose?: () => void;
}

interface NoteTheme {
  theme_label: string | null;
}

export default function ConversationReview({
  conversationId,
  onClose,
}: ConversationReviewProps) {
  const router = useRouter();
  const [conversation, setConversation] = useState<ConversationWithMessages | null>(null);
  const [chunks, setChunks] = useState<NoteChunk[]>([]);
  const [theme, setTheme] = useState<NoteTheme | null>(null);
  const [selectedChunk, setSelectedChunk] = useState<NoteChunk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadConversation();
    loadChunks();
    loadTheme();
  }, [conversationId]);

  const getAuthHeaders = async () => {
    const supabase = createSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  };

  const loadConversation = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/conversations/${conversationId}`, { headers });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/auth/login');
          return;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load conversation');
      }

      const data = await response.json();
      setConversation(data);
    } catch (err) {
      console.error('Error loading conversation:', err);
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  };

  const loadChunks = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/notes/${conversationId}/chunks`, { headers });

      if (!response.ok) {
        // Chunks might not exist yet, which is fine
        if (response.status !== 404) {
          console.error('Error loading chunks:', response.statusText);
        }
        return;
      }

      const data = await response.json();
      setChunks(data || []);
    } catch (err) {
      console.error('Error loading chunks:', err);
    }
  };

  const loadTheme = async () => {
    try {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: themeData, error: themeError } = await supabase
        .from('note_themes')
        .select('theme_label')
        .eq('note_id', conversationId)
        .maybeSingle();

      if (themeError) {
        if (themeError.code !== 'PGRST116') {
          console.error('Error loading theme:', themeError);
        }
        setTheme(null);
        return;
      }

      setTheme(themeData ? { theme_label: themeData.theme_label } : null);
    } catch (err) {
      console.error('Error loading theme:', err);
      setTheme(null);
    }
  };

  const handleProcess = async () => {
    try {
      setProcessing(true);
      setError(null);

      const headers = await getAuthHeaders();
      const response = await fetch(`/api/conversations/${conversationId}/process`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process conversation');
      }

      // Reload chunks and theme after processing
      await loadChunks();
      await loadTheme();
    } catch (err) {
      console.error('Error processing conversation:', err);
      setError(err instanceof Error ? err.message : 'Failed to process conversation');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading conversation...</p>
        </div>
      </div>
    );
  }

  if (error && !conversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="alert-error mb-4">{error}</div>
          {onClose && (
            <button onClick={onClose} className="btn-secondary">
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-500">
          <p>Conversation not found</p>
          {onClose && (
            <button onClick={onClose} className="btn-secondary mt-4">
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {conversation.note.title || 'Conversation Review'}
          </h2>
          {theme?.theme_label && (
            <p className="text-sm text-gray-500 mt-1">Theme: {theme.theme_label}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {chunks.length === 0 && (
            <button
              onClick={handleProcess}
              disabled={processing}
              className="btn-primary text-sm"
            >
              {processing ? 'Processing...' : 'Process Conversation'}
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="btn-secondary text-sm">
              Close
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-6 py-3">
          <div className="alert-error">{error}</div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chunks Sidebar */}
        {chunks.length > 0 && (
          <div className="w-80 border-r border-gray-200 overflow-y-auto">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Conversation Pieces ({chunks.length})
              </h3>
              <div className="space-y-2">
                {chunks.map((chunk) => (
                  <button
                    key={chunk.id}
                    onClick={() => setSelectedChunk(chunk)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedChunk?.id === chunk.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <p className="text-sm text-gray-700 line-clamp-3">
                      {chunk.chunk_text}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Chunk {chunk.chunk_index + 1}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          {chunks.length > 0 && selectedChunk ? (
            <div className="p-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Chunk {selectedChunk.chunk_index + 1}
                </h3>
                <p className="text-sm text-gray-500">
                  {new Date(selectedChunk.created_at).toLocaleString()}
                </p>
              </div>
              <div className="prose max-w-none">
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {selectedChunk.chunk_text}
                </p>
              </div>
            </div>
          ) : chunks.length > 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p>Select a chunk to view its content</p>
              </div>
            </div>
          ) : (
            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Full Conversation</h3>
                <div className="space-y-4">
                  {conversation.messages.map((message, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg ${
                        message.role === 'user'
                          ? 'bg-blue-50 border-l-4 border-blue-500'
                          : message.role === 'assistant'
                          ? 'bg-gray-50 border-l-4 border-gray-400'
                          : 'bg-yellow-50 border-l-4 border-yellow-400'
                      }`}
                    >
                      <div className="text-xs font-semibold text-gray-600 mb-2 uppercase">
                        {message.role === 'user' ? 'User' : message.role === 'assistant' ? 'Assistant' : 'System'}
                      </div>
                      <div className="text-gray-700 whitespace-pre-wrap">
                        {message.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Tip:</strong> Click "Process Conversation" to break this conversation into chunks
                  organized by themes. This makes it easier to navigate long conversations.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

