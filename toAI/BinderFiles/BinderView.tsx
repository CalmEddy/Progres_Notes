'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabaseClient';
import { BinderItem } from '@/lib/binder/types';
import { Note } from '@/lib/notes';
import { Phrase } from '@/lib/phrases/types';
import { Tag } from '@/lib/tags/types';
import { FilterFolder, FilterCondition } from '@/lib/filters/types';
import BinderSidebar from './BinderSidebar';
import NoteEditor from './NoteEditor';
import FilterBuilder from './FilterBuilder';
import FilteredNotesView from './FilteredNotesView';
import ChunksColumn from './ChunksColumn';
import ChunkContentColumn from './ChunkContentColumn';
import { NoteChunk } from '@/lib/chunks/chunking';
import {
  addItemToTree,
  removeItemFromTree,
  updateNoteInTree,
  updateFolderInTree,
  moveItemInTree,
  createBinderItemFromNote,
  createBinderItemFromFolder,
} from '../utils/binderStateUtils';

interface BinderViewProps {
  userEmail: string;
}

export default function BinderView({ userEmail }: BinderViewProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [binderStructure, setBinderStructure] = useState<BinderItem[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [selectedChunk, setSelectedChunk] = useState<NoteChunk | null>(null);
  const [selectedFilterFolder, setSelectedFilterFolder] = useState<FilterFolder | null>(null);
  const [childNotes, setChildNotes] = useState<Note[]>([]);
  const [notePhrases, setNotePhrases] = useState<Record<string, Phrase[]>>({});
  const [noteTags, setNoteTags] = useState<Record<string, Tag[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  const [editingFilterFolder, setEditingFilterFolder] = useState<FilterFolder | null>(null);

  // Track which notes have phrases/tags loaded
  const loadedPhrasesRef = useRef<Set<string>>(new Set());
  const loadingPhrasesRef = useRef<Set<string>>(new Set());
  const loadedTagsRef = useRef<Set<string>>(new Set());
  const activeRequestsRef = useRef<number>(0);
  const MAX_CONCURRENT_REQUESTS = 3;

  // Check session on client side
  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;
    
    const checkSession = async () => {
      try {
        // Use a timeout to prevent hanging - proceed after 2 seconds max
        timeoutId = setTimeout(() => {
          if (isMounted) {
            console.warn('Session check timeout, proceeding anyway');
            setMounted(true);
          }
        }, 2000);
        
        const supabase = createSupabaseClient();
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        if (!isMounted) return;
        
        if (error) {
          console.error('Error getting session:', error);
          // Proceed anyway - API calls will handle auth
          setMounted(true);
          return;
        }
        
        if (!session) {
          console.log('No client session, redirecting to login');
          router.push('/auth/login');
          return;
        }
        
        setMounted(true);
      } catch (err) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        console.error('Error checking session:', err);
        // If session check fails, proceed anyway (might be a network issue)
        // The API calls will handle auth errors
        if (isMounted) {
          setMounted(true);
        }
      }
    };
    
    checkSession();
    
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
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

  /**
   * Optimistically update the binder structure
   * Applies the update immediately, then syncs with server in background
   * On error, rolls back the change
   */
  const updateStructureOptimistically = useCallback(
    async (
      updateFn: (current: BinderItem[]) => BinderItem[],
      syncFn: () => Promise<Response>,
      errorMessage: string = 'Operation failed'
    ) => {
      // Use functional setState to get current state and save for rollback
      let previousState: BinderItem[] = [];
      
      setBinderStructure((current) => {
        previousState = [...current];
        // Apply optimistic update immediately
        return updateFn(current);
      });

      try {
        // Sync with server in background
        const response = await syncFn();

        if (!response.ok) {
          if (response.status === 401) {
            router.push('/auth/login');
            return;
          }
          const errorData = await response.json();
          throw new Error(errorData.error || errorMessage);
        }

        // On success, optionally reload to ensure consistency
        // We skip this for better performance - the optimistic update is usually sufficient
      } catch (err) {
        // Rollback on error
        setBinderStructure(previousState);
        const errorMsg = err instanceof Error ? err.message : errorMessage;
        console.error('Error syncing with server:', err);
        alert(errorMsg);
        throw err;
      }
    },
    [router]
  );

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

  const loadTagsForNote = useCallback(async (noteId: string) => {
    if (loadedTagsRef.current.has(noteId)) {
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/notes/${noteId}/tags`, { headers });
      if (response.ok) {
        const tags = await response.json();
        setNoteTags(prev => ({ ...prev, [noteId]: tags }));
        loadedTagsRef.current.add(noteId);
      }
    } catch (err) {
      console.error(`Error loading tags for note ${noteId}:`, err);
    }
  }, []);

  const handleNoteSelect = useCallback(async (note: Note) => {
    setSelectedNote(note);
    setSelectedChunk(null); // Clear chunk selection when note changes
    setSelectedFilterFolder(null); // Clear filter folder selection
    // Clear child notes immediately to avoid showing stale data
    setChildNotes([]);
    
    if (!loadedPhrasesRef.current.has(note.id)) {
      loadPhrasesForNote(note.id);
    }

    if (!loadedTagsRef.current.has(note.id)) {
      loadTagsForNote(note.id);
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
  }, [loadPhrasesForNote, loadTagsForNote]);

  const handleChunkSelect = useCallback((chunk: NoteChunk) => {
    setSelectedChunk(chunk);
  }, []);

  const handleFilterFolderClick = useCallback(async (filterFolderId: string) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/filter-folders/${filterFolderId}`, { headers });
      if (response.ok) {
        const folder = await response.json();
        setSelectedFilterFolder(folder);
        setSelectedNote(null); // Clear note selection
        setSelectedChunk(null); // Clear chunk selection
        setShowFilterBuilder(false); // Hide builder if open
      } else {
        console.error('Error loading filter folder:', response.statusText);
      }
    } catch (err) {
      console.error('Error loading filter folder:', err);
    }
  }, []);

  const handleFilterFolderEdit = useCallback(async (filterFolderId: string) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/filter-folders/${filterFolderId}`, { headers });
      if (response.ok) {
        const folder = await response.json();
        setEditingFilterFolder(folder);
        setShowFilterBuilder(true);
        setSelectedFilterFolder(null);
        setSelectedNote(null);
        setSelectedChunk(null);
      }
    } catch (err) {
      console.error('Error loading filter folder for edit:', err);
    }
  }, []);

  const handleCreateFilterFolder = useCallback(() => {
    setEditingFilterFolder(null);
    setShowFilterBuilder(true);
  }, []);

  const handleSaveFilterFolder = useCallback(async (name: string, conditions: FilterCondition[]) => {
    try {
      const headers = await getAuthHeaders();
      
      // If editing, update existing; otherwise create new
      if (editingFilterFolder) {
        const response = await fetch(`/api/filter-folders/${editingFilterFolder.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            name,
            filterConditions: conditions,
          }),
        });

        if (response.ok) {
          setShowFilterBuilder(false);
          setEditingFilterFolder(null);
          // Reload binder structure
          const reloadResponse = await fetch('/api/binder', { headers });
          if (reloadResponse.ok) {
            const data = await reloadResponse.json();
            setBinderStructure(data.items || []);
          }
        } else {
          const errorData = await response.json();
          alert(errorData.error || 'Failed to update filter folder');
        }
      } else {
        // Filter folders always at root with position 0 (will be sorted to top)
        const response = await fetch('/api/filter-folders', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name,
            filterConditions: conditions,
            parentId: null,
            position: 0, // Always 0, sorting logic will put filter folders at top
          }),
        });

        if (response.ok) {
          setShowFilterBuilder(false);
          setEditingFilterFolder(null);
          // Reload binder structure to show new filter folder
          const reloadResponse = await fetch('/api/binder', { headers });
          if (reloadResponse.ok) {
            const data = await reloadResponse.json();
            setBinderStructure(data.items || []);
          }
        } else {
          const errorData = await response.json();
          alert(errorData.error || 'Failed to create filter folder');
        }
      }
    } catch (err) {
      console.error('Error saving filter folder:', err);
      alert('Failed to save filter folder');
    }
  }, [editingFilterFolder]);

  const handleEditNote = async (noteId: string, title: string | null, body: string) => {
    try {
      const headers = await getAuthHeaders();

      // Optimistically update the note in the tree
      await updateStructureOptimistically(
        (current) => updateNoteInTree(current, noteId, { title, body }),
        () =>
          fetch(`/api/notes/${noteId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ title, body }),
          }),
        'Failed to update note'
      );

      // Clear loaded phrases and tags for this note so they can be reloaded
      loadedPhrasesRef.current.delete(noteId);
      loadingPhrasesRef.current.delete(noteId);
      loadedTagsRef.current.delete(noteId);
      setNotePhrases(prev => {
        const updated = { ...prev };
        delete updated[noteId];
        return updated;
      });
      setNoteTags(prev => {
        const updated = { ...prev };
        delete updated[noteId];
        return updated;
      });

      // Update selected note optimistically
      if (selectedNote && selectedNote.id === noteId) {
        setSelectedNote({ ...selectedNote, title, body });
      }

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

    const noteTitle = title?.trim() || null;
    const noteBody = body.trim();

    try {
      const headers = await getAuthHeaders();

      // Create a temporary note for optimistic update
      // We'll use a temporary ID that will be replaced by the server response
      const tempId = `temp-${Date.now()}`;
      const tempNote: Note = {
        id: tempId,
        user_id: '', // Will be set by server
        title: noteTitle,
        body: noteBody,
        folder_id: null,
        parent_note_id: null,
        position: binderStructure.filter(item => !item.parent_id).length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Optimistically add note to tree
      const tempItem = createBinderItemFromNote(tempNote);
      setBinderStructure((current) => addItemToTree(current, tempItem, null, null));

      try {
        const response = await fetch('/api/notes', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: noteTitle,
            body: noteBody,
          }),
        });

        if (!response.ok) {
          if (response.status === 401) {
            router.push('/auth/login');
            return;
          }
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create note');
        }

        const newNote = await response.json();

        // Replace temp item with real note
        setBinderStructure((current) => {
          // Remove temp item
          const withoutTemp = removeItemFromTree(current, tempId);
          // Add real note
          const realItem = createBinderItemFromNote(newNote);
          return addItemToTree(withoutTemp, realItem, null, null, newNote.position);
        });

        handleNoteSelect(newNote);
      } catch (err) {
        // Rollback optimistic update
        setBinderStructure((current) => removeItemFromTree(current, tempId));
        const errorMsg = err instanceof Error ? err.message : 'Failed to create note';
        alert(errorMsg);
      }
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

    const noteTitle = title?.trim() || null;
    const noteBody = body.trim();

    try {
      const headers = await getAuthHeaders();

      // Create a temporary note for optimistic update
      const tempId = `temp-${Date.now()}`;
      const tempNote: Note = {
        id: tempId,
        user_id: '',
        title: noteTitle,
        body: noteBody,
        folder_id: null,
        parent_note_id: selectedNote.id,
        position: childNotes.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Optimistically add child note to tree
      const tempItem = createBinderItemFromNote(tempNote);
      setBinderStructure((current) => addItemToTree(current, tempItem, selectedNote.id, 'note', childNotes.length));

      try {
        const response = await fetch('/api/notes', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            title: noteTitle,
            body: noteBody,
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
          throw new Error(errorData.error || 'Failed to create child note');
        }

        const newNote = await response.json();

        // Replace temp item with real note
        setBinderStructure((current) => {
          const withoutTemp = removeItemFromTree(current, tempId);
          const realItem = createBinderItemFromNote(newNote);
          return addItemToTree(withoutTemp, realItem, selectedNote.id, 'note', newNote.position);
        });

        // Reload child notes to update the editor view
        if (selectedNote) {
          await handleNoteSelect(selectedNote);
        }
      } catch (err) {
        // Rollback optimistic update
        setBinderStructure((current) => removeItemFromTree(current, tempId));
        const errorMsg = err instanceof Error ? err.message : 'Failed to create child note';
        alert(errorMsg);
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
            href="/chat"
            className="btn-secondary text-sm"
          >
            Chat
          </a>
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

      {/* Main Content - Miller Columns Layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Column 1: Notes (BinderSidebar) */}
        <BinderSidebar
          binderStructure={binderStructure}
          selectedNoteId={selectedNote?.id || null}
          noteTags={noteTags}
          onNoteSelect={handleNoteSelect}
          onCreateFilterFolder={handleCreateFilterFolder}
          onFilterFolderClick={handleFilterFolderClick}
          onFilterFolderEdit={handleFilterFolderEdit}
          onStructureChange={loadBinderStructure}
          onStructureUpdate={updateStructureOptimistically}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          loading={loading}
          error={error}
        />

        {/* Column 2: Chunks (shown when note is selected and not showing filter/filtered view) */}
        {selectedNote && !showFilterBuilder && !selectedFilterFolder && (
          <ChunksColumn
            noteId={selectedNote.id}
            selectedChunkId={selectedChunk?.id || null}
            onChunkSelect={handleChunkSelect}
          />
        )}

        {/* Column 3: Content (Chunk Content, Note Editor, Filter Builder, or Filtered View) */}
        {showFilterBuilder ? (
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <div className="h-full overflow-y-auto p-6 bg-gray-50">
              <FilterBuilder
                onSave={handleSaveFilterFolder}
                onCancel={() => {
                  setShowFilterBuilder(false);
                  setEditingFilterFolder(null);
                }}
                initialName={editingFilterFolder?.name}
                initialConditions={editingFilterFolder?.filter_conditions}
              />
            </div>
          </div>
        ) : selectedFilterFolder ? (
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <FilteredNotesView
              filterFolder={selectedFilterFolder}
              onNoteSelect={handleNoteSelect}
              onClose={() => setSelectedFilterFolder(null)}
            />
          </div>
        ) : selectedChunk ? (
          <ChunkContentColumn chunk={selectedChunk} />
        ) : selectedNote ? (
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <NoteEditor
              note={selectedNote}
              childNotes={childNotes}
              phrases={selectedNote ? notePhrases[selectedNote.id] || [] : []}
              tags={selectedNote ? noteTags[selectedNote.id] || [] : []}
              onEdit={handleEditNote}
              onTagsChange={async (noteId, tagIds) => {
                try {
                  const headers = await getAuthHeaders();
                  const response = await fetch(`/api/notes/${noteId}/tags`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({ tagIds }),
                  });
                  if (response.ok) {
                    const updatedTags = await response.json();
                    setNoteTags(prev => ({ ...prev, [noteId]: updatedTags }));
                    loadedTagsRef.current.add(noteId);
                  }
                } catch (err) {
                  console.error('Error updating tags:', err);
                  throw err;
                }
              }}
              onPhraseClick={handlePhraseClick}
              onNoteSelect={handleNoteSelect}
              onCreateChildNote={handleCreateChildNote}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-white">
            <div className="text-center text-gray-500">
              <p className="text-lg mb-2">Select a note to begin</p>
              <p className="text-sm">Choose a note from the sidebar to view its chunks and content</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

