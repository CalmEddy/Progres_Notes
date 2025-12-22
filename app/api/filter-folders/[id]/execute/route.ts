import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getFilterFolderById } from '@/lib/filters/filterFolders';
import { filterNotesForUser, getEmbeddingFilterDebugInfo, clearEmbeddingFilterDebugInfo } from '@/lib/filters/filterEngine';

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

// POST /api/filter-folders/[id]/execute - Execute filter and return matching notes
export async function POST(
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

    console.log('========== FILTER API CALLED ==========');
    console.log('[Filter API] Executing filter folder:', {
      folderId: params.id,
      folderName: folder.name,
      conditionsCount: folder.filter_conditions.length,
      conditions: JSON.stringify(folder.filter_conditions, null, 2)
    });
    console.log('========================================');

    // Clear any previous debug info
    clearEmbeddingFilterDebugInfo();
    
    // Execute the filter
    const startTime = Date.now();
    const result = await filterNotesForUser(
      session.user.id,
      folder.filter_conditions,
      session.accessToken
    );
    const duration = Date.now() - startTime;

    console.log('[Filter API] Filter execution completed, returning', result.notes.length, 'notes in', duration, 'ms');

    // Include debug info in development
    const response: any = { 
      notes: result.notes,
      noteTags: result.noteTags // Include tags in response
    };
    if (process.env.NODE_ENV === 'development') {
      const embeddingDebug = getEmbeddingFilterDebugInfo();
      response.debug = {
        folderId: params.id,
        folderName: folder.name,
        conditionsCount: folder.filter_conditions.length,
        conditionTypes: folder.filter_conditions.map(c => c.type),
        executionTimeMs: duration,
        embeddingConditions: folder.filter_conditions.filter(c => c.type === 'embedding').map((c: any) => ({
          query: c.query,
          threshold: c.threshold || 0.7
        })),
        embeddingFilterDebug: embeddingDebug
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error executing filter folder:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to execute filter folder' },
      { status: 500 }
    );
  }
}

