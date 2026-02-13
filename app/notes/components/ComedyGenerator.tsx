'use client';

import { useState } from 'react';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { STYLE_CONTRACTS, getDefaultStyleContract } from '@/lib/comedy/styleContracts';

interface ComedyGeneratorProps {
  onGenerateComplete?: (noteId: string) => void;
  onError?: (error: string) => void;
}

export default function ComedyGenerator({
  onGenerateComplete,
  onError,
}: ComedyGeneratorProps) {
  const [topic, setTopic] = useState('');
  const [selectedStyleContractId, setSelectedStyleContractId] = useState<string>(getDefaultStyleContract().styleId);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!topic.trim()) {
      if (onError) {
        onError('Topic is required');
      }
      return;
    }

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

      const response = await fetch('/api/comedy/generate-base', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          topic: topic.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate base premises');
      }

      const result = await response.json();

      // Reset form
      setTopic('');

      if (onGenerateComplete) {
        // If Stage 2 was run, use that note ID, otherwise use the base premise note ID
        onGenerateComplete(result.stage2Note?.id || result.noteId);
      } else {
        // Navigate to the note
        router.push(`/notes`);
        // Note: Navigation to specific note would require note selection logic
      }
    } catch (error) {
      console.error('Error generating base premises:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate base premises';
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
    <div className="border border-gray-200 rounded-lg p-6 bg-white">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Generate Comedy Base Premises</h2>
      
      <form onSubmit={handleGenerate} className="space-y-4">
        <div>
          <label htmlFor="topic" className="block text-sm font-medium text-gray-700 mb-1">
            Topic
          </label>
          <input
            id="topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., coffee shops, social media, air travel"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
            required
          />
        </div>

        <div>
          <label htmlFor="styleContract" className="block text-sm font-medium text-gray-700 mb-1">
            Voice Contract
          </label>
          <select
            id="styleContract"
            value={selectedStyleContractId}
            onChange={(e) => setSelectedStyleContractId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            disabled={loading}
          >
            {Object.values(STYLE_CONTRACTS).map((contract) => (
              <option key={contract.styleId} value={contract.styleId}>
                {contract.styleId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} - {contract.voiceDescription}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Select the voice/style contract for rewriting (used when generating rewrites from base premises)
          </p>
        </div>

        <button
          type="submit"
          disabled={loading || !topic.trim()}
          className={`
            w-full px-4 py-2 rounded-lg font-medium transition-colors
            ${loading || !topic.trim()
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
            }
          `}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Generating...
            </span>
          ) : (
            'Generate Base Premises'
          )}
        </button>
      </form>
    </div>
  );
}

