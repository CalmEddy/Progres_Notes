import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getNotesByIds } from '@/lib/notes';

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

// POST /api/notes/batch - Get multiple notes by IDs
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { noteIds } = body;

    if (!Array.isArray(noteIds)) {
      return NextResponse.json(
        { error: 'noteIds must be an array' },
        { status: 400 }
      );
    }

    if (noteIds.length === 0) {
      return NextResponse.json([]);
    }

    const notes = await getNotesByIds(noteIds, session.user.id, session.accessToken);

    return NextResponse.json(notes);
  } catch (error) {
    console.error('Error getting notes:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to get notes',
      },
      { status: 500 }
    );
  }
}

