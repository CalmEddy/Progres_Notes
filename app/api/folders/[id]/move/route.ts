import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { moveFolderToParent } from '@/lib/binder';

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

// POST /api/folders/[id]/move - Move folder to different parent or reorder
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
    const { parent_id, position } = body;

    if (position === undefined) {
      return NextResponse.json(
        { error: 'Position is required' },
        { status: 400 }
      );
    }

    await moveFolderToParent(
      params.id,
      session.user.id,
      parent_id !== undefined ? parent_id : null,
      position,
      session.accessToken
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error moving folder:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to move folder' },
      { status: 500 }
    );
  }
}

