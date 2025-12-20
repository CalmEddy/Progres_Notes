import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { searchNotesByKeywords } from '@/lib/phrases/searchService';

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

// POST /api/notes/search/keywords - Keyword search
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { keywords, query } = body;

    // Support both 'keywords' array and 'query' string (split by spaces)
    let keywordArray: string[] = [];
    
    if (keywords && Array.isArray(keywords)) {
      keywordArray = keywords;
    } else if (query && typeof query === 'string') {
      keywordArray = query.split(/\s+/).filter(k => k.trim().length > 0);
    } else {
      return NextResponse.json(
        { error: 'Keywords array or query string is required' },
        { status: 400 }
      );
    }

    if (keywordArray.length === 0) {
      return NextResponse.json(
        { error: 'At least one keyword is required' },
        { status: 400 }
      );
    }

    const notes = await searchNotesByKeywords(
      session.user.id,
      keywordArray,
      session.accessToken
    );

    return NextResponse.json(notes);
  } catch (error) {
    console.error('Error searching notes by keywords:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to search notes',
      },
      { status: 500 }
    );
  }
}

