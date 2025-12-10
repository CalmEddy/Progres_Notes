'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabaseClient';

interface ImportResult {
  success: boolean;
  noteId?: string;
  error?: string;
  filename: string;
  title?: string | null;
}

interface NotionImportResult {
  success: boolean;
  importedCount: number;
  failedCount: number;
  errors?: Array<{ pageTitle: string; error: string }>;
}

export default function ImportClient({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<ImportResult | null>(null);
  
  // Notion import state
  const [notionDatabaseId, setNotionDatabaseId] = useState('');
  const [notionDatabases, setNotionDatabases] = useState<Array<{ id: string; title: string; url?: string }>>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [loadingPageCount, setLoadingPageCount] = useState(false);
  const [startPage, setStartPage] = useState('');
  const [endPage, setEndPage] = useState('');
  const [useRange, setUseRange] = useState(false);
  const [importingNotion, setImportingNotion] = useState(false);
  const [notionError, setNotionError] = useState<string | null>(null);
  const [notionSuccess, setNotionSuccess] = useState<NotionImportResult | null>(null);

  // Check session on client side and load Notion databases
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
      
      // Load Notion databases
      loadNotionDatabases();
    };
    
    checkSession();
  }, [router]);

  const loadNotionDatabases = async () => {
    setLoadingDatabases(true);
    setNotionError(null);
    
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/import/notion/databases', {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/auth/login');
          return;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load Notion databases');
      }

      const data = await response.json();
      setNotionDatabases(data.databases || []);
    } catch (err) {
      console.error('Error loading Notion databases:', err);
      setNotionError(err instanceof Error ? err.message : 'Failed to load Notion databases');
    } finally {
      setLoadingDatabases(false);
    }
  };

  const loadPageCount = async (databaseId: string) => {
    if (!databaseId) {
      setPageCount(null);
      return;
    }

    setLoadingPageCount(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/import/notion/count?databaseId=${encodeURIComponent(databaseId)}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/auth/login');
          return;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load page count');
      }

      const data = await response.json();
      setPageCount(data.totalPages || 0);
    } catch (err) {
      console.error('Error loading page count:', err);
      setPageCount(null);
      // Don't show error to user for page count, just leave it blank
    } finally {
      setLoadingPageCount(false);
    }
  };

  const getAuthHeaders = async () => {
    const supabase = createSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = {};
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      setSuccess(null);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile) {
      setError('Please select a file to import');
      return;
    }

    setImporting(true);
    setError(null);
    setSuccess(null);

    try {
      const headers = await getAuthHeaders();
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/import', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/auth/login');
          return;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to import file');
      }

      const result: ImportResult = await response.json();
      setSuccess(result);
      setSelectedFile(null);
      
      // Reset file input
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import file');
    } finally {
      setImporting(false);
    }
  };

  const handleNotionImport = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!notionDatabaseId.trim()) {
      setNotionError('Please select a Notion data source');
      return;
    }

    // Validate range if specified
    if (useRange) {
      const start = parseInt(startPage, 10);
      const end = parseInt(endPage, 10);
      
      if (isNaN(start) || start < 1) {
        setNotionError('Start page must be a number >= 1');
        return;
      }
      
      if (isNaN(end) || end < 1) {
        setNotionError('End page must be a number >= 1');
        return;
      }
      
      if (start > end) {
        setNotionError('Start page must be <= end page');
        return;
      }
      
      if (pageCount !== null && end > pageCount) {
        setNotionError(`End page (${end}) cannot exceed total pages (${pageCount})`);
        return;
      }
    }

    setImportingNotion(true);
    setNotionError(null);
    setNotionSuccess(null);

    // Set a timeout to detect if import is stuck
    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutWarning = setTimeout(() => {
      console.warn('Import is taking longer than expected (5+ minutes)...');
      // Don't reset state, just log - the import might still be working
    }, 5 * 60 * 1000); // 5 minutes
    timeoutId = timeoutWarning;

    try {
      const headers = await getAuthHeaders();
      headers['Content-Type'] = 'application/json';

      const requestBody: any = {
        databaseId: notionDatabaseId.trim(),
      };

      if (useRange) {
        requestBody.startIndex = parseInt(startPage, 10);
        requestBody.endIndex = parseInt(endPage, 10);
      }

      const response = await fetch('/api/import/notion', {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/auth/login');
          return;
        }
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to import from Notion');
      }

      const result: NotionImportResult = await response.json();
      setNotionSuccess(result);
      
      // Reset form but keep database selected
      setStartPage('');
      setEndPage('');
      setUseRange(false);
    } catch (err) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      setNotionError(err instanceof Error ? err.message : 'Failed to import from Notion');
    } finally {
      // Always reset importing state, even if there was an early return
      setImportingNotion(false);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
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
              Import Notes
            </h1>
            <p className="text-gray-600 flex items-center">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Logged in as {userEmail}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="/import/bulk"
              className="btn-success text-sm"
            >
              Bulk Import
            </a>
            <a
              href="/notes"
              className="btn-primary text-sm"
            >
              Back to Notes
            </a>
            <button
              onClick={handleLogout}
              className="btn-secondary text-sm"
            >
              Log Out
            </button>
          </div>
        </div>

        {/* Import Form */}
        <div className="card mb-8">
          <div className="flex items-center mb-6">
            <div className="p-2 bg-blue-100 rounded-lg mr-3">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Import File</h2>
              <p className="text-sm text-gray-600 mt-1">
                Supported formats: .txt, .pdf, .md, .markdown
              </p>
            </div>
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
          
          {success && (
            <div className="mb-4 alert-success">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <p className="font-semibold">File imported successfully!</p>
                  <p className="text-sm mt-1">
                    Created note: <span className="font-medium">{success.title || 'Untitled'}</span> (from {success.filename})
                  </p>
                  <a
                    href="/notes"
                    className="text-sm font-semibold text-green-700 hover:text-green-800 mt-2 inline-flex items-center transition-colors"
                  >
                    View all notes
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleImport} className="space-y-5">
            <div>
              <label htmlFor="file-input" className="block text-sm font-semibold text-gray-700 mb-2">
                Select File
              </label>
              <div className="relative">
                <input
                  id="file-input"
                  type="file"
                  accept=".txt,.pdf,.md,.markdown"
                  onChange={handleFileSelect}
                  className="input-field file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  disabled={importing}
                />
              </div>
              {selectedFile && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-blue-900">{selectedFile.name}</p>
                      <p className="text-xs text-blue-600">{(selectedFile.size / 1024).toFixed(2)} KB</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={importing || !selectedFile}
              className="w-full btn-primary"
            >
              {importing ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Importing...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Import File
                </span>
              )}
            </button>
          </form>
        </div>

        {/* Notion Import Form */}
        <div className="card mb-8">
          <div className="flex items-center mb-6">
            <div className="p-2 bg-purple-100 rounded-lg mr-3">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Import from Notion</h2>
              <p className="text-sm text-gray-600 mt-1">
                Import pages from a Notion database as notes
              </p>
            </div>
          </div>
          
          {notionError && (
            <div className="mb-4 alert-error">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{notionError}</span>
              </div>
            </div>
          )}
          
          {notionSuccess && (
            <div className="mb-4 alert-success">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <p className="font-semibold">Import completed!</p>
                  <p className="text-sm mt-1">
                    Successfully imported <span className="font-medium">{notionSuccess.importedCount}</span> page{notionSuccess.importedCount !== 1 ? 's' : ''}
                    {notionSuccess.failedCount > 0 && (
                      <span className="text-yellow-700"> ({notionSuccess.failedCount} failed)</span>
                    )}
                  </p>
                  {notionSuccess.errors && notionSuccess.errors.length > 0 && (
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-yellow-700 hover:text-yellow-800 font-medium">
                        View errors ({notionSuccess.errors.length})
                      </summary>
                      <ul className="mt-2 space-y-1 text-yellow-700">
                        {notionSuccess.errors.map((err, idx) => (
                          <li key={idx} className="text-xs">
                            <span className="font-medium">{err.pageTitle}:</span> {err.error}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <a
                    href="/notes"
                    className="text-sm font-semibold text-green-700 hover:text-green-800 mt-2 inline-flex items-center transition-colors"
                  >
                    View all notes
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleNotionImport} className="space-y-5">
            <div>
              <label htmlFor="notion-database-select" className="block text-sm font-semibold text-gray-700 mb-2">
                Select Notion Database
              </label>
              {loadingDatabases ? (
                <div className="input-field flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading databases...
                </div>
              ) : notionDatabases.length === 0 ? (
                <div className="input-field text-gray-500">
                  No databases found. Make sure your Notion integration has access to databases.
                </div>
              ) : (
                <select
                  id="notion-database-select"
                  value={notionDatabaseId}
                  onChange={async (e) => {
                    const newDatabaseId = e.target.value;
                    setNotionDatabaseId(newDatabaseId);
                    setNotionError(null);
                    setNotionSuccess(null);
                    setStartPage('');
                    setEndPage('');
                    setUseRange(false);
                    
                    // Load page count when database is selected
                    if (newDatabaseId) {
                      await loadPageCount(newDatabaseId);
                    } else {
                      setPageCount(null);
                    }
                  }}
                  className="input-field"
                  disabled={importingNotion}
                >
                  <option value="">-- Select a data source --</option>
                  {notionDatabases.map((db) => (
                    <option key={db.id} value={db.id}>
                      {db.title}
                    </option>
                  ))}
                </select>
              )}
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadNotionDatabases}
                  disabled={loadingDatabases || importingNotion}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  Refresh list
                </button>
                <span className="text-xs text-gray-500">•</span>
                <p className="text-xs text-gray-500">
                  {notionDatabases.length} data source{notionDatabases.length !== 1 ? 's' : ''} found
                </p>
              </div>
              
              {/* Page Count Display */}
              {notionDatabaseId && (
                <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  {loadingPageCount ? (
                    <div className="flex items-center text-sm text-purple-700">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Counting pages...
                    </div>
                  ) : pageCount !== null ? (
                    <div className="flex items-center text-sm text-purple-900">
                      <svg className="w-4 h-4 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="font-semibold">This data source contains {pageCount.toLocaleString()} page{pageCount !== 1 ? 's' : ''}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            
            {/* Range Selection */}
            {notionDatabaseId && pageCount !== null && pageCount > 0 && (
              <div>
                <div className="flex items-center mb-3">
                  <input
                    type="checkbox"
                    id="use-range"
                    checked={useRange}
                    onChange={(e) => {
                      setUseRange(e.target.checked);
                      if (!e.target.checked) {
                        setStartPage('');
                        setEndPage('');
                      }
                    }}
                    className="mr-2 h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    disabled={importingNotion}
                  />
                  <label htmlFor="use-range" className="text-sm font-semibold text-gray-700 cursor-pointer">
                    Import specific page range
                  </label>
                </div>
                
                {useRange && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <div>
                      <label htmlFor="start-page" className="block text-sm font-medium text-gray-700 mb-1">
                        From page
                      </label>
                      <input
                        id="start-page"
                        type="number"
                        min="1"
                        max={pageCount}
                        value={startPage}
                        onChange={(e) => {
                          setStartPage(e.target.value);
                          setNotionError(null);
                        }}
                        placeholder="1"
                        className="input-field"
                        disabled={importingNotion}
                      />
                    </div>
                    <div>
                      <label htmlFor="end-page" className="block text-sm font-medium text-gray-700 mb-1">
                        To page
                      </label>
                      <input
                        id="end-page"
                        type="number"
                        min="1"
                        max={pageCount}
                        value={endPage}
                        onChange={(e) => {
                          setEndPage(e.target.value);
                          setNotionError(null);
                        }}
                        placeholder={pageCount.toString()}
                        className="input-field"
                        disabled={importingNotion}
                      />
                    </div>
                    <div className="col-span-2 text-xs text-gray-600">
                      {startPage && endPage ? (
                        <span>
                          Will import pages {startPage} to {endPage} ({parseInt(endPage, 10) - parseInt(startPage, 10) + 1} pages)
                        </span>
                      ) : (
                        <span>Enter page numbers to import a specific range</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <button
              type="submit"
              disabled={importingNotion || !notionDatabaseId.trim() || loadingDatabases}
              className="w-full btn-primary"
            >
              {importingNotion ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Importing from Notion...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                  Import from Notion
                </span>
              )}
            </button>
          </form>
        </div>

        {/* Instructions */}
        <div className="card">
          <div className="flex items-center mb-6">
            <div className="p-2 bg-indigo-100 rounded-lg mr-3">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">How It Works</h2>
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                  <span className="text-blue-600 font-bold text-sm">1</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Text files (.txt)</h3>
                  <p className="text-sm text-gray-600">The first line will be used as the title (if reasonable length), otherwise the filename will be used.</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                  <span className="text-blue-600 font-bold text-sm">2</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">PDF files (.pdf)</h3>
                  <p className="text-sm text-gray-600">Text will be extracted from the PDF. The first line or filename will be used as the title.</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                  <span className="text-blue-600 font-bold text-sm">3</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Markdown files (.md, .markdown)</h3>
                  <p className="text-sm text-gray-600">The first H1 heading will be used as the title, or the first line if no H1 is found.</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className="font-semibold text-yellow-900 mb-1">File size limit</h3>
                  <p className="text-sm text-yellow-700">Maximum 10MB per file.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

