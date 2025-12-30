import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createNoteForUser, listNotesForUser } from '@/lib/notes';

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

// GET /api/notes - List all notes for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const notes = await listNotesForUser(session.user.id, session.accessToken);
    return NextResponse.json(notes);
  } catch (error) {
    console.error('Error listing notes:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list notes' },
      { status: 500 }
    );
  }
}

// POST /api/notes - Create a new note
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, body: noteBody, folder_id, parent_note_id, position } = body;

    if (!noteBody || typeof noteBody !== 'string' || noteBody.trim().length === 0) {
      return NextResponse.json(
        { error: 'Note body is required' },
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

    const note = await createNoteForUser(
      session.user.id,
      title || null,
      noteBody,
      folder_id !== undefined ? folder_id : null,
      parent_note_id !== undefined ? parent_note_id : null,
      position !== undefined ? position : 0,
      session.accessToken
    );

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error('Error creating note:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create note' },
      { status: 500 }
    );
  }
}

