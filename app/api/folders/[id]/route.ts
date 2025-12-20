import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateFolderForUser, deleteFolderForUser } from '@/lib/folders';

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

// PUT /api/folders/[id] - Update folder
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
    const { name, parent_id, position } = body;

    const updates: {
      name?: string;
      parent_id?: string | null;
      position?: number;
    } = {};

    if (name !== undefined) updates.name = name;
    if (parent_id !== undefined) updates.parent_id = parent_id;
    if (position !== undefined) updates.position = position;

    const folder = await updateFolderForUser(
      params.id,
      session.user.id,
      updates,
      session.accessToken
    );

    return NextResponse.json(folder);
  } catch (error) {
    console.error('Error updating folder:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update folder' },
      { status: 500 }
    );
  }
}

// DELETE /api/folders/[id] - Delete folder
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const moveChildrenToParent = searchParams.get('moveChildrenToParent') !== 'false';

    await deleteFolderForUser(
      params.id,
      session.user.id,
      moveChildrenToParent,
      session.accessToken
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting folder:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete folder' },
      { status: 500 }
    );
  }
}

