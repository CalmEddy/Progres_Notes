import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { searchNotesByPhrase } from '@/lib/phrases/searchService';
import { PhraseCategory } from '@/lib/phrases/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Helper to get session from request
async function getSessionFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { user, accessToken: token };
    }
  }

  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Cookie: cookieHeader },
      },
    });
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      return { user: session.user, accessToken: session.access_token };
    }
  }

  return null;
}

// GET /api/phrases/search - Search notes by phrase
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const phraseText = searchParams.get('phrase');
    const category = searchParams.get('category') as PhraseCategory | null;

    if (!phraseText || phraseText.trim().length === 0) {
      return NextResponse.json(
        { error: 'Phrase text is required' },
        { status: 400 }
      );
    }

    const notes = await searchNotesByPhrase(
      session.user.id,
      phraseText.trim(),
      category || undefined,
      session.accessToken
    );

    return NextResponse.json(notes);
  } catch (error) {
    console.error('Error searching notes by phrase:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to search notes',
      },
      { status: 500 }
    );
  }
}

