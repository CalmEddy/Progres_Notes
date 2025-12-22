import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getFilterFolderById, updateFilterFolder, deleteFilterFolder } from '@/lib/filters/filterFolders';
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

// GET /api/filter-folders/[id] - Get a specific filter folder
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const folder = await getFilterFolderById(params.id, session.user.id, session.accessToken);

    if (!folder) {
      return NextResponse.json({ error: 'Filter folder not found' }, { status: 404 });
    }

    return NextResponse.json(folder);
  } catch (error) {
    console.error('Error getting filter folder:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get filter folder' },
      { status: 500 }
    );
  }
}

// PUT /api/filter-folders/[id] - Update a filter folder
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
    const { name, filterConditions, parentId, position } = body;

    const updates: {
      name?: string;
      filterConditions?: FilterCondition[];
      parentId?: string | null;
      position?: number;
    } = {};

    if (name !== undefined) {
      updates.name = name;
    }
    if (filterConditions !== undefined) {
      if (!Array.isArray(filterConditions)) {
        return NextResponse.json(
          { error: 'filterConditions must be an array' },
          { status: 400 }
        );
      }
      updates.filterConditions = filterConditions as FilterCondition[];
    }
    if (parentId !== undefined) {
      updates.parentId = parentId;
    }
    if (position !== undefined) {
      updates.position = position;
    }

    const folder = await updateFilterFolder(
      params.id,
      session.user.id,
      updates,
      session.accessToken
    );

    return NextResponse.json(folder);
  } catch (error) {
    console.error('Error updating filter folder:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update filter folder' },
      { status: 500 }
    );
  }
}

// DELETE /api/filter-folders/[id] - Delete a filter folder
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await deleteFilterFolder(params.id, session.user.id, session.accessToken);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting filter folder:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete filter folder' },
      { status: 500 }
    );
  }
}

