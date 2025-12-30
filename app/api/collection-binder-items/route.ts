import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createBinderItem } from '@/lib/collections/binderItems';

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

// POST /api/collection-binder-items - Create binder item
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { collection_id, item_type, title, chunk_id, parent_id, position } = body;

    if (!collection_id || typeof collection_id !== 'string') {
      return NextResponse.json(
        { error: 'collection_id is required' },
        { status: 400 }
      );
    }

    if (!item_type || !['folder', 'chunk_ref'].includes(item_type)) {
      return NextResponse.json(
        { error: 'item_type must be "folder" or "chunk_ref"' },
        { status: 400 }
      );
    }

    if (item_type === 'chunk_ref' && !chunk_id) {
      return NextResponse.json(
        { error: 'chunk_id is required for chunk_ref items' },
        { status: 400 }
      );
    }

    const item = await createBinderItem(
      collection_id,
      session.user.id,
      {
        item_type,
        title: title || null,
        chunk_id: chunk_id || null,
        parent_id: parent_id || null,
        position,
      },
      session.accessToken
    );

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('Error creating binder item:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create binder item',
      },
      { status: 500 }
    );
  }
}

