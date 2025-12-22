import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listTagsForUser, createTag } from '@/lib/tags/tags';

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

// GET /api/tags - List all tags for the user
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tags = await listTagsForUser(session.user.id, session.accessToken);
    return NextResponse.json(tags);
  } catch (error) {
    console.error('Error listing tags:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list tags' },
      { status: 500 }
    );
  }
}

// POST /api/tags - Create a new tag
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, color } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Tag name is required' },
        { status: 400 }
      );
    }

    const tag = await createTag(
      session.user.id,
      name.trim(),
      color || null,
      session.accessToken
    );

    return NextResponse.json(tag);
  } catch (error) {
    console.error('Error creating tag:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create tag' },
      { status: 500 }
    );
  }
}

