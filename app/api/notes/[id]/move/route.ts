import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { moveNoteToFolder, moveNoteToNote } from '@/lib/binder';

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

// POST /api/notes/[id]/move - Move note to folder or reorder
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { folder_id, parent_note_id, position } = body;

    if (position === undefined) {
      return NextResponse.json(
        { error: 'Position is required' },
        { status: 400 }
      );
    }

    // Validate: note cannot be in both folder and under another note
    if (folder_id && parent_note_id) {
      return NextResponse.json(
        { error: 'Note cannot be in both a folder and nested under another note' },
        { status: 400 }
      );
    }

    // Move to folder or note based on what's provided
    if (folder_id !== undefined) {
      await moveNoteToFolder(
        params.id,
        session.user.id,
        folder_id !== undefined ? folder_id : null,
        position,
        session.accessToken
      );
    } else if (parent_note_id !== undefined) {
      await moveNoteToNote(
        params.id,
        session.user.id,
        parent_note_id !== undefined ? parent_note_id : null,
        position,
        session.accessToken
      );
    } else {
      // Moving to root (no folder, no parent note)
      await moveNoteToFolder(
        params.id,
        session.user.id,
        null,
        position,
        session.accessToken
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error moving note:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to move note' },
      { status: 500 }
    );
  }
}

