import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTagById, updateTag, deleteTag } from '@/lib/tags/tags';

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

// GET /api/tags/[id] - Get a specific tag
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tag = await getTagById(params.id, session.user.id, session.accessToken);

    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json(tag);
  } catch (error) {
    console.error('Error getting tag:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get tag' },
      { status: 500 }
    );
  }
}

// PUT /api/tags/[id] - Update a tag
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
    const { name, color } = body;

    const updates: { name?: string; color?: string | null } = {};
    if (name !== undefined) {
      updates.name = name;
    }
    if (color !== undefined) {
      updates.color = color;
    }

    const tag = await updateTag(
      params.id,
      session.user.id,
      updates,
      session.accessToken
    );

    return NextResponse.json(tag);
  } catch (error) {
    console.error('Error updating tag:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update tag' },
      { status: 500 }
    );
  }
}

// DELETE /api/tags/[id] - Delete a tag
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await deleteTag(params.id, session.user.id, session.accessToken);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting tag:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete tag' },
      { status: 500 }
    );
  }
}

