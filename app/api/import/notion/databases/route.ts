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

export interface NotionDatabase {
  id: string;
  title: string;
  url?: string;
}

// GET /api/import/notion/databases - Get list of accessible Notion databases
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

    // Create Notion client
    const client = createNotionClient(notionApiKey);

    // Search for data sources (the new API term for databases)
    // The search API supports filtering by "data_source" object type
    const databases: NotionDatabase[] = [];
    const seenDatabaseIds = new Set<string>();
    
    let cursor: string | undefined = undefined;
    let hasMore = true;
    let searchAttempts = 0;
    const maxSearchAttempts = 10; // Limit to prevent infinite loops

    console.log('Starting data source search...');

    while (hasMore && searchAttempts < maxSearchAttempts) {
      searchAttempts++;
      
      // Search for data sources specifically
      const searchParams: any = {
        filter: {
          value: 'data_source',
          property: 'object',
        },
        page_size: 100,
      };

      if (cursor) {
        searchParams.start_cursor = cursor;
      }

      const response = await client.search(searchParams);

      // Debug: log what we're getting
      console.log(`Search batch ${searchAttempts}: returned ${response.results.length} results`);
      
      // Log all object types we're seeing
      const objectTypes = new Set(response.results.map((r: any) => r.object));
      console.log(`Object types in this batch: ${Array.from(objectTypes).join(', ')}`);
      
      if (response.results.length > 0) {
        // Log detailed info about first few results
        const sampleResults = response.results.slice(0, 3).map((r: any) => ({
          object: r.object,
          type: r.type,
          id: r.id,
          hasTitle: !!r.title,
          hasProperties: !!r.properties,
          parentType: r.parent?.type,
          parentDatabaseId: r.parent?.database_id,
        }));
        console.log('Sample results:', JSON.stringify(sampleResults, null, 2));
      }

      // Extract data source info from results
      // All results should be data sources since we filtered by object='data_source'
      for (const result of response.results as any[]) {
        // Check if this is a data source
        const isDataSource = result.object === 'data_source' || 
                            result.type === 'data_source';
        
        if (isDataSource && !seenDatabaseIds.has(result.id)) {
          seenDatabaseIds.add(result.id);
          
          // Extract title from data source
          let title = 'Untitled Data Source';
          
          // Try different ways to get the title
          // Method 1: Direct title property (array of rich text)
          if (result.title && Array.isArray(result.title)) {
            title = result.title
              .map((t: any) => t.plain_text || t.text?.content || '')
              .join('')
              .trim() || 'Untitled Data Source';
          }
          // Method 2: Check properties for a title property
          else if (result.properties) {
            for (const [key, value] of Object.entries(result.properties)) {
              const prop = value as any;
              if (prop.type === 'title' && prop.title && Array.isArray(prop.title)) {
                title = prop.title
                  .map((t: any) => t.plain_text || t.text?.content || '')
                  .join('')
                  .trim() || 'Untitled Data Source';
                break;
              }
            }
          }

          console.log(`Found data source: "${title}" (${result.id}), object=${result.object}, type=${result.type}`);

          databases.push({
            id: result.id,
            title,
            url: result.url,
          });
        }
      }
      
      console.log(`Total data sources found so far: ${databases.length}`);

      hasMore = response.has_more === true;
      cursor = response.next_cursor || undefined;
    }

    return NextResponse.json({ databases }, { status: 200 });
  } catch (error) {
    console.error('Error fetching Notion databases:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch Notion databases',
      },
      { status: 500 }
    );
  }
}
