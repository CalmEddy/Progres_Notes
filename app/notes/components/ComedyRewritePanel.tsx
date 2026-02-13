'use client';

import { useState, useEffect } from 'react';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { StyleContract } from '@/lib/comedy/styleContracts';
import StyleContractSelector from './StyleContractSelector';

interface ComedyRewritePanelProps {
  noteId: string;
  onRewriteComplete?: (newNoteId: string) => void;
  onError?: (error: string) => void;
}

export default function ComedyRewritePanel({
  noteId,
  onRewriteComplete,
  onError,
}: ComedyRewritePanelProps) {
  const [loading, setLoading] = useState(false);
  const [usedStyleIds, setUsedStyleIds] = useState<string[]>([]);
  const [loadingUsedStyles, setLoadingUsedStyles] = useState(true);

  // Load which style contracts have already been used for this base premise note
  useEffect(() => {
    loadUsedStyleIds();
  }, [noteId]);

  const loadUsedStyleIds = async () => {
    try {
      setLoadingUsedStyles(true);
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Query notes that have this note as their source_base_premise_note_id
      // Use Supabase directly to filter by source_base_premise_note_id
      const { data: rewrittenNotes, error: queryError } = await supabase
        .from('notes')
        .select('style_contract_id')
        .eq('source_base_premise_note_id', noteId)
        .not('style_contract_id', 'is', null);

      if (queryError) {
        throw new Error('Failed to load rewritten notes');
      }

      const usedIds = (rewrittenNotes || [])
        .map((n) => n.style_contract_id)
        .filter((id): id is string => id !== null && id !== undefined);

      setUsedStyleIds(usedIds);
    } catch (error) {
      console.error('Error loading used style IDs:', error);
    } finally {
      setLoadingUsedStyles(false);
    }
  };

  const handleRewrite = async (styleContract: StyleContract) => {
    try {
      setLoading(true);
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (session.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/comedy/rewrite', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          noteId,
          styleContractId: styleContract.styleId,
          jokeCount: 10, // Default, could be made configurable
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to rewrite');
      }

      const result = await response.json();
      
      // Reload used style IDs to include the new one
      await loadUsedStyleIds();

      if (onRewriteComplete) {
        onRewriteComplete(result.noteId);
      }
    } catch (error) {
      console.error('Error rewriting:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to rewrite';
      if (onError) {
        onError(errorMessage);
      } else {
        alert(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-t border-gray-200 pt-6 mt-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          Rewrite with Different Style
        </h3>
        <p className="text-sm text-gray-600">
          Generate new jokes from these base premises using a different voice/style contract.
        </p>
      </div>

      {loadingUsedStyles ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : (
        <StyleContractSelector
          onSelect={handleRewrite}
          usedStyleIds={usedStyleIds}
          disabled={loading}
        />
      )}

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
          <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          <span>Rewriting with selected style...</span>
        </div>
      )}
    </div>
  );
}

