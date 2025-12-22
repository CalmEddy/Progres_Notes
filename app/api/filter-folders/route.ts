import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listFilterFoldersForUser, createFilterFolder } from '@/lib/filters/filterFolders';
import { FilterCondition } from '@/lib/filters/types';

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

// GET /api/filter-folders - List all filter folders for the user
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const folders = await listFilterFoldersForUser(session.user.id, session.accessToken);
    return NextResponse.json(folders);
  } catch (error) {
    console.error('Error listing filter folders:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list filter folders' },
      { status: 500 }
    );
  }
}

// POST /api/filter-folders - Create a new filter folder
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, filterConditions, parentId, position } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Filter folder name is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(filterConditions)) {
      return NextResponse.json(
        { error: 'filterConditions must be an array' },
        { status: 400 }
      );
    }

    const folder = await createFilterFolder(
      session.user.id,
      name.trim(),
      filterConditions as FilterCondition[],
      parentId !== undefined ? parentId : null,
      position !== undefined ? position : 0,
      session.accessToken
    );

    return NextResponse.json(folder);
  } catch (error) {
    console.error('Error creating filter folder:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create filter folder' },
      { status: 500 }
    );
  }
}

