import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabaseServerClient';
import Link from 'next/link';

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect('/notes');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <div className="inline-block mb-4 p-3 bg-blue-100 rounded-2xl">
            <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            RAG Notes
          </h1>
          <p className="text-gray-600 text-lg mb-8">
            A note-taking app with semantic search powered by AI
          </p>
        </div>
        <div className="card space-y-4">
          <Link
            href="/auth/login"
            className="block w-full text-center btn-primary"
          >
            Log In
          </Link>
          <Link
            href="/auth/signup"
            className="block w-full text-center btn-secondary"
          >
            Sign Up
          </Link>
        </div>
        <div className="text-center text-sm text-gray-500">
          <p>Store your notes and find them instantly with AI-powered search</p>
        </div>
      </div>
    </div>
  );
}

