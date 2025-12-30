import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateBinderItem, deleteBinderItem, moveBinderItem } from '@/lib/collections/binderItems';

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

// PATCH /api/collection-binder-items/[id] - Update binder item
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Handle move operation separately
    if (body.parent_id !== undefined || body.position !== undefined) {
      if (body.position === undefined) {
        return NextResponse.json(
          { error: 'position is required when moving items' },
          { status: 400 }
        );
      }

      await moveBinderItem(
        params.id,
        session.user.id,
        body.parent_id !== undefined ? body.parent_id : null,
        body.position,
        session.accessToken
      );

      return NextResponse.json({ success: true });
    }

    // Handle other updates (title, is_muted)
    const updates: { title?: string | null; is_muted?: boolean } = {};

    if (body.title !== undefined) {
      updates.title = body.title !== null && body.title.trim().length > 0 
        ? body.title.trim() 
        : null;
    }

    if (body.is_muted !== undefined) {
      if (typeof body.is_muted !== 'boolean') {
        return NextResponse.json(
          { error: 'is_muted must be a boolean' },
          { status: 400 }
        );
      }
      updates.is_muted = body.is_muted;
    }

    const item = await updateBinderItem(
      params.id,
      session.user.id,
      updates,
      session.accessToken
    );

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating binder item:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to update binder item',
      },
      { status: 500 }
    );
  }
}

// DELETE /api/collection-binder-items/[id] - Soft-delete binder item
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await deleteBinderItem(params.id, session.user.id, session.accessToken);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting binder item:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to delete binder item',
      },
      { status: 500 }
    );
  }
}

