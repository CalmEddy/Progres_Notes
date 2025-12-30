import { NextRequest, NextResponse } from 'next/server';
import { updateChunk, deleteChunk } from '@/lib/chunks/chunking';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
import { createClient } from '@supabase/supabase-js';

// Helper to get session from request
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

// PATCH /api/chunks/[id] - Update a single chunk
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const chunkId = params.id;

    if (!chunkId) {
      return NextResponse.json(
        { error: 'Chunk ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { chunk_text } = body;

    if (!chunk_text || typeof chunk_text !== 'string') {
      return NextResponse.json(
        { error: 'chunk_text is required and must be a string' },
        { status: 400 }
      );
    }

    const updatedChunk = await updateChunk(
      chunkId,
      chunk_text,
      session.user.id,
      session.accessToken
    );

    return NextResponse.json(updatedChunk);
  } catch (error) {
    console.error('Error updating chunk:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to update chunk',
      },
      { status: 500 }
    );
  }
}

// DELETE /api/chunks/[id] - Delete a single chunk
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const chunkId = params.id;

    if (!chunkId) {
      return NextResponse.json(
        { error: 'Chunk ID is required' },
        { status: 400 }
      );
    }

    const noteId = await deleteChunk(
      chunkId,
      session.user.id,
      session.accessToken
    );

    return NextResponse.json({ noteId, message: 'Chunk deleted successfully' });
  } catch (error) {
    console.error('Error deleting chunk:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to delete chunk',
      },
      { status: 500 }
    );
  }
}

