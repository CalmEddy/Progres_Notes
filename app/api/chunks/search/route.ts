import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  searchChunksInNote,
  searchChunksWithTheme,
  searchChunksWithTags,
} from '@/lib/chunks/chunkSearch';

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

// POST /api/chunks/search - Search chunks
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      query,
      noteId,
      tagIds,
      matchThreshold = 0.7,
      limit = 10,
      searchType = 'note', // 'note', 'theme', or 'tags'
    } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }

    let results;

    if (searchType === 'note' && noteId) {
      // Search chunks within a specific note
      results = await searchChunksInNote(
        noteId,
        query,
        matchThreshold,
        limit,
        session.accessToken
      );
    } else if (searchType === 'theme') {
      // Theme-aware search
      results = await searchChunksWithTheme(
        query,
        matchThreshold,
        20, // themeLimit
        limit,
        session.accessToken
      );
    } else if (searchType === 'tags' && tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      // Search chunks with tags
      results = await searchChunksWithTags(
        query,
        tagIds,
        matchThreshold,
        limit,
        session.accessToken
      );
    } else {
      return NextResponse.json(
        { error: 'Invalid search type or missing required parameters' },
        { status: 400 }
      );
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error searching chunks:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to search chunks',
      },
      { status: 500 }
    );
  }
}

