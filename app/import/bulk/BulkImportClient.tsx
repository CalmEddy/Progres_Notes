'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabaseClient';

interface BulkImportResult {
  success: boolean;
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    title: string;
    success: boolean;
    noteId?: string;
    error?: string;
  }>;
}

export default function BulkImportClient({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);

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
      setResult(null);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile) {
      setError('Please select a JSON file to import');
      return;
    }

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const headers = await getAuthHeaders();
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/import/bulk', {
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

      const importResult: BulkImportResult = await response.json();
      setResult(importResult);
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
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              Bulk Import Notes
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
              href="/import"
              className="btn-primary text-sm"
            >
              Single Import
            </a>
            <a
              href="/notes"
              className="btn-secondary text-sm"
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
            <div className="p-2 bg-green-100 rounded-lg mr-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Import JSON File</h2>
              <p className="text-sm text-gray-600 mt-1">
                Upload a JSON file containing multiple blog entries
              </p>
            </div>
          </div>
          <p className="text-gray-700 mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            The file should contain an array of objects with "title" and "body" fields, or be wrapped in an object with an "entries" property.
          </p>
          
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

          <form onSubmit={handleImport} className="space-y-5">
            <div>
              <label htmlFor="file-input" className="block text-sm font-semibold text-gray-700 mb-2">
                Select JSON File
              </label>
              <div className="relative">
                <input
                  id="file-input"
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="input-field file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 cursor-pointer"
                  disabled={importing}
                />
              </div>
              {selectedFile && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-green-900">{selectedFile.name}</p>
                      <p className="text-xs text-green-600">{(selectedFile.size / 1024).toFixed(2)} KB</p>
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Import File
                </span>
              )}
            </button>
          </form>
        </div>

        {/* Results */}
        {result && (
          <div className="card mb-8">
            <div className="flex items-center mb-6">
              <div className="p-2 bg-indigo-100 rounded-lg mr-3">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Import Results</h2>
            </div>
            
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-blue-50 border border-blue-200 p-5 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-3xl font-bold text-blue-600">{result.total}</div>
                  <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="text-sm font-semibold text-gray-700">Total Entries</div>
              </div>
              <div className="bg-green-50 border border-green-200 p-5 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-3xl font-bold text-green-600">{result.successful}</div>
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-sm font-semibold text-gray-700">Successful</div>
              </div>
              <div className="bg-red-50 border border-red-200 p-5 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-3xl font-bold text-red-600">{result.failed}</div>
                  <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-sm font-semibold text-gray-700">Failed</div>
              </div>
            </div>

            {result.failed > 0 && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="font-semibold mb-3 text-red-900 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  Failed Entries ({result.failed})
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {result.results
                    .filter((r) => !r.success)
                    .map((r, idx) => (
                      <div key={idx} className="bg-white border border-red-200 rounded-lg p-3 text-sm">
                        <div className="font-semibold text-red-900 mb-1">{r.title}</div>
                        <div className="text-red-700">{r.error}</div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {result.successful > 0 && (
              <div className="mt-6">
                <a
                  href="/notes"
                  className="inline-flex items-center btn-success"
                >
                  View Imported Notes
                  <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="card">
          <div className="flex items-center mb-6">
            <div className="p-2 bg-purple-100 rounded-lg mr-3">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">JSON File Format</h2>
          </div>
          <p className="text-gray-700 mb-6">
            Your JSON file should follow one of these formats:
          </p>
          
          <div className="space-y-4">
            <div className="bg-gray-900 p-5 rounded-lg border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-green-400 text-sm">Option 1: Array of entries</p>
                <span className="px-2 py-1 bg-green-900 text-green-300 rounded text-xs font-mono">Array</span>
              </div>
              <pre className="text-xs text-gray-300 overflow-x-auto font-mono">
{`[
  {
    "title": "Blog Title",
    "body": "Blog content text..."
  },
  {
    "title": "Another Blog",
    "body": "More content..."
  }
]`}
              </pre>
            </div>

            <div className="bg-gray-900 p-5 rounded-lg border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-blue-400 text-sm">Option 2: Object with entries property</p>
                <span className="px-2 py-1 bg-blue-900 text-blue-300 rounded text-xs font-mono">Object</span>
              </div>
              <pre className="text-xs text-gray-300 overflow-x-auto font-mono">
{`{
  "entries": [
    {
      "title": "Blog Title",
      "body": "Blog content text..."
    }
  ]
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


