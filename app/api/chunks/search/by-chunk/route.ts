import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { searchChunksByChunk } from '@/lib/chunks/chunkSearch';

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

// POST /api/chunks/search/by-chunk - Search chunks using another chunk's embedding
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      chunkId,
      scope = 'all', // 'all' or 'note'
      matchThreshold = 0.35,
      limit = 10,
    } = body;

    if (!chunkId || typeof chunkId !== 'string') {
      return NextResponse.json(
        { error: 'chunkId is required and must be a string' },
        { status: 400 }
      );
    }

    if (scope !== 'all' && scope !== 'note') {
      return NextResponse.json(
        { error: 'scope must be either "all" or "note"' },
        { status: 400 }
      );
    }

    const results = await searchChunksByChunk(
      chunkId,
      scope,
      matchThreshold,
      limit,
      session.accessToken
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error searching chunks by chunk:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to search chunks by chunk',
      },
      { status: 500 }
    );
  }
}

