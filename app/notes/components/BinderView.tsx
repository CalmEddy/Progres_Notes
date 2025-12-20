'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { BinderItem } from '@/lib/binder/types';
import { Note } from '@/lib/notes';
import { Phrase } from '@/lib/phrases/types';
import BinderSidebar from './BinderSidebar';
import NoteEditor from './NoteEditor';

interface BinderViewProps {
  userEmail: string;
}

export default function BinderView({ userEmail }: BinderViewProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [binderStructure, setBinderStructure] = useState<BinderItem[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [childNotes, setChildNotes] = useState<Note[]>([]);
  const [notePhrases, setNotePhrases] = useState<Record<string, Phrase[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Track which notes have phrases loaded
  const loadedPhrasesRef = useRef<Set<string>>(new Set());
  const loadingPhrasesRef = useRef<Set<string>>(new Set());
  const activeRequestsRef = useRef<number>(0);
  const MAX_CONCURRENT_REQUESTS = 3;

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

  // Load binder structure after session is verified
  useEffect(() => {
    if (mounted) {
      loadBinderStructure();
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

  const loadBinderStructure = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/binder', { headers });
      if (!response.ok) {
        if (response.status === 401) {
          router.push('/auth/login');
          return;
        }
        const errorData = await response.json();
        const errorMessage = errorData.error || 'Failed to load binder structure';
        const errorDetails = errorData.details ? `\n\nDetails: ${JSON.stringify(errorData.details, null, 2)}` : '';
        throw new Error(errorMessage + errorDetails);
      }
      const data = await response.json();
      setBinderStructure(data.items || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load binder structure';
      console.error('Error loading binder structure:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const loadPhrasesForNote = useCallback(async (noteId: string) => {
    if (
      loadingPhrasesRef.current.has(noteId) || 
      loadedPhrasesRef.current.has(noteId)
    ) {
      return;
    }
    
    if (activeRequestsRef.current >= MAX_CONCURRENT_REQUESTS) {
      setTimeout(() => loadPhrasesForNote(noteId), 200);
      return;
    }
    
    loadingPhrasesRef.current.add(noteId);
    activeRequestsRef.current++;
    
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/notes/${noteId}/phrases`, { 
        headers,
        signal: AbortSignal.timeout(10000),
      });
      
      if (response.ok) {
        const phrases = await response.json();
        setNotePhrases(prev => {
          if (prev[noteId]) {
            return prev;
          }
          return { ...prev, [noteId]: phrases };
        });
        loadedPhrasesRef.current.add(noteId);
      }
    } catch (err) {
      console.error(`Error loading phrases for note ${noteId}:`, err);
    } finally {
      loadingPhrasesRef.current.delete(noteId);
      activeRequestsRef.current = Math.max(0, activeRequestsRef.current - 1);
    }
  }, []);

  const handleNoteSelect = useCallback(async (note: Note) => {
    setSelectedNote(note);
    // Clear child notes immediately to avoid showing stale data
    setChildNotes([]);
    
    if (!loadedPhrasesRef.current.has(note.id)) {
      loadPhrasesForNote(note.id);
    }
    
    // Load child notes if this note has children
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/notes/${note.id}/children`, { headers });
      if (response.ok) {
        const children = await response.json();
        setChildNotes(children || []);
      } else {
        setChildNotes([]);
      }
    } catch (err) {
      console.error('Error loading child notes:', err);
      setChildNotes([]);
    }
  }, [loadPhrasesForNote]);

  const handleEditNote = async (noteId: string, title: string | null, body: string) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/notes/${noteId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ title, body }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/auth/login');
          return;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update note');
      }

      const updatedNote = await response.json();
      
      // Clear loaded phrases for this note so they can be reloaded
      loadedPhrasesRef.current.delete(noteId);
      loadingPhrasesRef.current.delete(noteId);
      setNotePhrases(prev => {
        const updated = { ...prev };
        delete updated[noteId];
        return updated;
      });
      
      // Update selected note
      setSelectedNote(updatedNote);
      
      // Reload binder structure
      await loadBinderStructure();
      // Reload phrases for this note
      await loadPhrasesForNote(noteId);
    } catch (err) {
      throw err;
    }
  };

  const handlePhraseClick = async (phrase: Phrase) => {
    // This will be handled by the search functionality
    // For now, we'll just log it
    console.log('Phrase clicked:', phrase);
  };

  const handleCreateNote = async () => {
    const title = prompt('Enter note title (optional):');
    const body = prompt('Enter note body:');
    
    if (!body || !body.trim()) {
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: title?.trim() || null,
          body: body.trim(),
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/auth/login');
          return;
        }
        const errorData = await response.json();
        alert(errorData.error || 'Failed to create note');
        return;
      }

      const newNote = await response.json();
      await loadBinderStructure();
      handleNoteSelect(newNote);
    } catch (err) {
      console.error('Error creating note:', err);
      alert('Failed to create note');
    }
  };

  const handleCreateChildNote = async () => {
    if (!selectedNote) return;
    
    const title = prompt('Enter child note title (optional):');
    const body = prompt('Enter child note body:');
    
    if (!body || !body.trim()) {
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: title?.trim() || null,
          body: body.trim(),
          parent_note_id: selectedNote.id,
          position: childNotes.length,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/auth/login');
          return;
        }
        const errorData = await response.json();
        alert(errorData.error || 'Failed to create child note');
        return;
      }

      const newNote = await response.json();
      await loadBinderStructure();
      // Reload child notes
      if (selectedNote) {
        await handleNoteSelect(selectedNote);
      }
    } catch (err) {
      console.error('Error creating child note:', err);
      alert('Failed to create child note');
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
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            My Notes
          </h1>
          <p className="text-sm text-gray-600 flex items-center mt-1">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {userEmail}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleCreateNote}
            className="btn-primary text-sm"
          >
            New Note
          </button>
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

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Sidebar */}
        <BinderSidebar
          binderStructure={binderStructure}
          selectedNoteId={selectedNote?.id || null}
          onNoteSelect={handleNoteSelect}
          onStructureChange={loadBinderStructure}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          loading={loading}
          error={error}
        />

        {/* Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <NoteEditor
            note={selectedNote}
            childNotes={childNotes}
            phrases={selectedNote ? notePhrases[selectedNote.id] || [] : []}
            onEdit={handleEditNote}
            onPhraseClick={handlePhraseClick}
            onNoteSelect={handleNoteSelect}
            onCreateChildNote={handleCreateChildNote}
          />
        </div>
      </div>
    </div>
  );
}

