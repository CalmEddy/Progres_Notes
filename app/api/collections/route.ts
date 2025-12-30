import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listCollections, createCollection, createSearchCollection } from '@/lib/collections/collections';
import { SearchCriteria } from '@/lib/collections/types';

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

// GET /api/collections - List user's collections
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const collections = await listCollections(session.user.id, session.accessToken);

    return NextResponse.json(collections);
  } catch (error) {
    console.error('Error listing collections:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to list collections',
      },
      { status: 500 }
    );
  }
}

// POST /api/collections - Create collection
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, searchCriteria } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Collection name is required' },
        { status: 400 }
      );
    }

    // If searchCriteria is provided, create a search collection
    let collection;
    if (searchCriteria) {
      // Validate searchCriteria structure
      if (!searchCriteria.search_type) {
        return NextResponse.json(
          { error: 'searchCriteria.search_type is required' },
          { status: 400 }
        );
      }
      collection = await createSearchCollection(
        session.user.id,
        name.trim(),
        searchCriteria as SearchCriteria,
        session.accessToken
      );
    } else {
      // Create a regular collection
      collection = await createCollection(session.user.id, name.trim(), session.accessToken);
    }

    return NextResponse.json(collection, { status: 201 });
  } catch (error) {
    console.error('Error creating collection:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create collection',
      },
      { status: 500 }
    );
  }
}

