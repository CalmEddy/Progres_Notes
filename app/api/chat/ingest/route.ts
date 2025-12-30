import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createNoteForUser } from '@/lib/notes';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Helper to get session from Authorization header or cookies
async function getSessionFromRequest(request: NextRequest) {
  // Try to get token from Authorization header first
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { user, accessToken: token };
    }
  }

  // Fallback to cookies
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

// POST /api/chat/ingest - Ingest text directly as a note (AI off mode)
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { text, title } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Text content is required' },
        { status: 400 }
      );
    }

    // Use existing createNoteForUser function to save the text as a note
    const note = await createNoteForUser(
      session.user.id,
      title || null,
      text.trim(),
      undefined, // folderId
      undefined, // parentNoteId
      undefined, // position
      session.accessToken
    );

    return NextResponse.json(
      {
        success: true,
        note: {
          id: note.id,
          title: note.title,
          body: note.body,
          created_at: note.created_at,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error ingesting text:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to ingest text',
      },
      { status: 500 }
    );
  }
}

