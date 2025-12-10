'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { Note, NoteWithSimilarity } from '@/lib/notes';

export default function NotesClient({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Check session on client side
  useEffect(() => {
    const checkSession = async () => {
      const supabase = createSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.log('No client session, redirecting to login');
        router.push('/auth/login');
        return;
      }
      
      setMounted(true);
    };
    
    checkSession();
  }, [router]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchResults, setSearchResults] = useState<NoteWithSimilarity[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Load notes after session is verified
  useEffect(() => {
    if (mounted) {
      loadNotes();
    }
  }, [mounted]);

  const getAuthHeaders = async () => {
    const supabase = createSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  };

  const loadNotes = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/notes', { headers });
      if (!response.ok) {
        if (response.status === 401) {
          router.push('/auth/login');
          return;
        }
        throw new Error('Failed to load notes');
      }
      const data = await response.json();
      setNotes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) {
      setError('Note body cannot be empty');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: title.trim() || null, body: body.trim() }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/auth/login');
          return;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create note');
      }

      // Clear form and reload notes
      setTitle('');
      setBody('');
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchError('Search query cannot be empty');
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/notes/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: searchQuery.trim() }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/auth/login');
          return;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to search notes');
      }

      const data = await response.json();
      setSearchResults(data);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Failed to search notes');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleLogout = async () => {
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  // Show loading while checking session
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600 text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto p-6 sm:p-8">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              My Notes
            </h1>
            <p className="text-gray-600 flex items-center">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Logged in as {userEmail}
            </p>
          </div>
          <div className="flex gap-3">
            <a
              href="/import"
              className="btn-secondary text-sm"
            >
              Import
            </a>
            <button
              onClick={handleLogout}
              className="btn-secondary text-sm"
            >
              Log Out
            </button>
          </div>
        </div>

        {/* Create Note Form */}
        <div className="card mb-8">
          <div className="flex items-center mb-6">
            <div className="p-2 bg-blue-100 rounded-lg mr-3">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Create Note</h2>
          </div>
          {error && (
            <div className="mb-4 alert-error">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            </div>
          )}
          <form onSubmit={handleCreateNote} className="space-y-5">
            <div>
              <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
                Title <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input-field"
                placeholder="Note title..."
              />
            </div>
            <div>
              <label htmlFor="body" className="block text-sm font-semibold text-gray-700 mb-2">
                Body <span className="text-red-500">*</span>
              </label>
              <textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                rows={6}
                className="input-field resize-y"
                placeholder="Write your note here..."
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating note...
                </span>
              ) : 'Save Note'}
            </button>
          </form>
        </div>

        {/* Search Form */}
        <div className="card mb-8">
          <div className="flex items-center mb-6">
            <div className="p-2 bg-green-100 rounded-lg mr-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Search Notes</h2>
          </div>
          {searchError && (
            <div className="mb-4 alert-error">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{searchError}</span>
              </div>
            </div>
          )}
          <form onSubmit={handleSearch} className="space-y-5">
            <div>
              <label htmlFor="search" className="block text-sm font-semibold text-gray-700 mb-2">
                Search Query
              </label>
              <input
                id="search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field"
                placeholder="e.g., 'cat shedding', 'prayer and suffering'..."
              />
              <p className="mt-2 text-xs text-gray-500 flex items-center">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Use natural language to find semantically similar notes
              </p>
            </div>
            <button
              type="submit"
              disabled={searchLoading}
              className="w-full btn-success"
            >
              {searchLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Searching...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Search
                </span>
              )}
            </button>
          </form>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="card mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <div className="p-2 bg-indigo-100 rounded-lg mr-3">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Search Results
                </h2>
              </div>
              <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-semibold">
                {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'}
              </span>
            </div>
            <div className="space-y-4">
              {searchResults.map((note) => {
                const similarityPercent = (note.similarity * 100).toFixed(1);
                const similarityColor = note.similarity > 0.85 ? 'bg-green-100 text-green-700' : 
                                       note.similarity > 0.75 ? 'bg-blue-100 text-blue-700' : 
                                       'bg-yellow-100 text-yellow-700';
                return (
                  <div
                    key={note.id}
                    className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all duration-200 bg-white"
                  >
                    {note.title && (
                      <h3 className="font-bold text-lg mb-3 text-gray-900">{note.title}</h3>
                    )}
                    <p className="text-gray-700 mb-4 whitespace-pre-wrap leading-relaxed">
                      {note.body.length > 200
                        ? `${note.body.substring(0, 200)}...`
                        : note.body}
                    </p>
                    <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                      <span className="text-sm text-gray-500 flex items-center">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {new Date(note.created_at).toLocaleDateString()}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${similarityColor}`}>
                        {similarityPercent}% match
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes List */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg mr-3">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">All Notes</h2>
            </div>
            <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-semibold">
              {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </span>
          </div>
          {loading && notes.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-500">Loading notes...</p>
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-block p-4 bg-gray-100 rounded-full mb-4">
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-500 text-lg mb-2">No notes yet</p>
              <p className="text-gray-400 text-sm">Create your first note above!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all duration-200 bg-white"
                >
                  {note.title && (
                    <h3 className="font-bold text-lg mb-3 text-gray-900">{note.title}</h3>
                  )}
                  <p className="text-gray-700 mb-4 whitespace-pre-wrap leading-relaxed">
                    {note.body.length > 300
                      ? `${note.body.substring(0, 300)}...`
                      : note.body}
                  </p>
                  <div className="text-sm text-gray-500 flex items-center pt-3 border-t border-gray-100">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {new Date(note.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

