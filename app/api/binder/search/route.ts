import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { searchBinderNotes, SearchType, SearchFilters } from '@/lib/binder/binderSearch';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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

// POST /api/binder/search - Unified search endpoint
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      query,
      searchType = 'auto',
      dateCreated,
      dateModified,
      tagIds,
      themeId,
      limit = 20,
      threshold = 0.7,
      themeThreshold = 0.7,
    } = body;

    // Validate query
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }

    // Validate searchType
    const validSearchTypes: SearchType[] = ['keyword', 'semantic', 'theme', 'combined', 'auto'];
    if (!validSearchTypes.includes(searchType)) {
      return NextResponse.json(
        { error: `Invalid searchType. Must be one of: ${validSearchTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Build filters
    const filters: SearchFilters = {};

    if (dateCreated) {
      filters.dateCreated = {
        start: dateCreated.start,
        end: dateCreated.end,
      };
    }

    if (dateModified) {
      filters.dateModified = {
        start: dateModified.start,
        end: dateModified.end,
      };
    }

    if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      filters.tagIds = tagIds;
    }

    if (themeId && typeof themeId === 'string') {
      filters.themeId = themeId;
    }

    // Perform search
    console.log('[API] Binder search request:', {
      userId: session.user.id,
      query: query.trim(),
      searchType,
      threshold,
      themeThreshold,
      filters,
      limit,
    });

    let results: any[] = [];
    try {
      results = await searchBinderNotes(
        session.user.id,
        {
          query: query.trim(),
          searchType: searchType as SearchType,
          filters,
          limit: Math.min(limit, 100), // Cap at 100
          threshold,
          themeThreshold,
        },
        session.accessToken
      );

      console.log('[API] Binder search response:', {
        query: query.trim(),
        searchType,
        threshold,
        resultCount: results.length,
      });
    } catch (error) {
      console.error('[API] Error in searchBinderNotes:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        query: query.trim(),
        searchType,
        threshold,
      });
      
      // Return empty results instead of error to allow UI to continue
      results = [];
    }

    return NextResponse.json({
      results,
      count: results.length,
      query: query.trim(),
      searchType,
    });
  } catch (error) {
    console.error('[API] Error searching binder:', {
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to search binder',
      },
      { status: 500 }
    );
  }
}

