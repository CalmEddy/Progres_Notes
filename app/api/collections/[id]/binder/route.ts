import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCollectionBinderItems, executeSearchFromCollection } from '@/lib/collections/collections';

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

// GET /api/collections/[id]/binder - Get binder items for collection
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if this is a search collection by trying to get it
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      },
    });

    const { data: collection } = await supabase
      .from('collections')
      .select('is_search_collection')
      .eq('id', params.id)
      .single();

    // If it's a search collection, execute the search
    if (collection?.is_search_collection) {
      const searchResults = await executeSearchFromCollection(params.id, session.accessToken);
      return NextResponse.json({ 
        isSearchCollection: true,
        searchResults 
      });
    }

    // Otherwise, get static binder items
    const items = await getCollectionBinderItems(params.id, session.accessToken);

    return NextResponse.json({ 
      isSearchCollection: false,
      items 
    });
  } catch (error) {
    console.error('Error getting collection binder items:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to get collection binder items',
      },
      { status: 500 }
    );
  }
}

