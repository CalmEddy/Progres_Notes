import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createNotionClient } from '@/lib/notion/notionClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Helper to get session from Authorization header or cookies
async function getSessionFromRequest(request: NextRequest) {
  // Try to get token from Authorization header first
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { user, accessToken: token };
    }
  }

  // Fallback to cookies
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

// GET /api/import/notion/count - Get total page count for a data source
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for Notion API key
    const notionApiKey = process.env.NOTION_API_KEY;
    if (!notionApiKey) {
      return NextResponse.json(
        { error: 'Notion API key is not configured. Please set NOTION_API_KEY environment variable.' },
        { status: 500 }
      );
    }

    // Get databaseId from query parameters
    const { searchParams } = new URL(request.url);
    const databaseId = searchParams.get('databaseId');

    if (!databaseId) {
      return NextResponse.json(
        { error: 'databaseId query parameter is required' },
        { status: 400 }
      );
    }

    // Create Notion client
    const client = createNotionClient(notionApiKey);

    // Count pages by querying with pagination
    let totalPages = 0;
    let cursor: string | undefined = undefined;
    let hasMore = true;
    let queryCount = 0;
    const maxQueries = 1000; // Safety limit

    console.log(`Counting pages in data source ${databaseId}...`);

    while (hasMore && queryCount < maxQueries) {
      queryCount++;
      
      const queryParams: any = {
        data_source_id: databaseId,
        page_size: 100, // Max page size for efficiency
        result_type: 'page',
      };

      if (cursor) {
        queryParams.start_cursor = cursor;
      }

      const response = await client.dataSources.query(queryParams);
      
      // Count pages in this batch
      const pagesInBatch = (response.results || []).filter((result: any) => 
        result.object === 'page' || (result as any).type === 'page'
      ).length;
      
      totalPages += pagesInBatch;
      
      console.log(`Count query ${queryCount}: found ${pagesInBatch} pages (total so far: ${totalPages})`);

      hasMore = response.has_more === true;
      cursor = response.next_cursor || undefined;
    }

    if (queryCount >= maxQueries) {
      console.warn(`Reached safety limit of ${maxQueries} queries. Total pages counted: ${totalPages}`);
    }

    console.log(`Total pages in data source: ${totalPages}`);

    return NextResponse.json({ totalPages }, { status: 200 });
  } catch (error) {
    console.error('Error counting pages:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to count pages',
      },
      { status: 500 }
    );
  }
}

