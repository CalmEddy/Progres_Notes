import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getNotesWithTag } from '@/lib/tags/tags';

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

// GET /api/tags/[id]/notes - Get all notes with a specific tag
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const noteIds = await getNotesWithTag(
      params.id,
      session.user.id,
      session.accessToken
    );

    return NextResponse.json({ noteIds });
  } catch (error) {
    console.error('Error getting notes with tag:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get notes with tag' },
      { status: 500 }
    );
  }
}

