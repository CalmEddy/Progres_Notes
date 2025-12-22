import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTagsForNote, assignTagsToNote } from '@/lib/tags/tags';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Helper to get session from Authorization header or cookies
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

// GET /api/notes/[id]/tags - Get all tags for a note
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tags = await getTagsForNote(
      params.id,
      session.user.id,
      session.accessToken
    );

    return NextResponse.json(tags);
  } catch (error) {
    console.error('Error getting tags for note:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get tags for note' },
      { status: 500 }
    );
  }
}

// PUT /api/notes/[id]/tags - Assign tags to a note (replaces existing tags)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { tagIds } = body;

    if (!Array.isArray(tagIds)) {
      return NextResponse.json(
        { error: 'tagIds must be an array' },
        { status: 400 }
      );
    }

    await assignTagsToNote(
      params.id,
      session.user.id,
      tagIds,
      session.accessToken
    );

    // Return updated tags
    const tags = await getTagsForNote(
      params.id,
      session.user.id,
      session.accessToken
    );

    return NextResponse.json(tags);
  } catch (error) {
    console.error('Error assigning tags to note:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to assign tags to note' },
      { status: 500 }
    );
  }
}

