import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { suggestTagsForNote } from '@/lib/tags/tagSuggestion';
import { getNoteById } from '@/lib/notes';

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

// POST /api/tags/suggest - Get tag suggestions for a note
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { noteId, title, body: noteBody } = body;

    // If noteId is provided, fetch the note. Otherwise use provided title/body
    let titleToUse: string | null = title || null;
    let bodyToUse: string = noteBody || '';

    if (noteId && (!title && !noteBody)) {
      // Fetch note if only noteId provided
      const note = await getNoteById(noteId, session.user.id, session.accessToken);
      if (note) {
        titleToUse = note.title;
        bodyToUse = note.body;
      } else {
        return NextResponse.json(
          { error: 'Note not found' },
          { status: 404 }
        );
      }
    }

    if (!bodyToUse && !titleToUse) {
      return NextResponse.json(
        { error: 'Note content or noteId is required' },
        { status: 400 }
      );
    }

    const suggestions = await suggestTagsForNote(
      noteId || 'temp',
      { title: titleToUse, body: bodyToUse },
      session.user.id,
      session.accessToken
    );

    return NextResponse.json(suggestions);
  } catch (error) {
    console.error('Error suggesting tags:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to suggest tags' },
      { status: 500 }
    );
  }
}

