import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '@/lib/embeddings';

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

// GET /api/binder/search/test - Diagnostic endpoint to test chunk search
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      },
    });

    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      userId: session.user.id,
      checks: {},
    };

    // Check 1: Verify chunks exist with embeddings
    console.log('[TEST] Checking for chunks with embeddings...');
    const { data: chunkCheck, error: chunkCheckError } = await supabase
      .from('note_chunks')
      .select('id, note_id, notes!inner(user_id, title)')
      .not('embedding', 'is', null)
      .eq('notes.user_id', session.user.id)
      .limit(5);

    diagnostics.checks.chunksWithEmbeddings = {
      exists: chunkCheck && chunkCheck.length > 0,
      count: chunkCheck?.length || 0,
      error: chunkCheckError ? {
        code: chunkCheckError.code,
        message: chunkCheckError.message,
      } : null,
      sample: chunkCheck?.slice(0, 3).map(c => ({
        chunkId: c.id,
        noteId: c.note_id,
        noteTitle: (c as any).notes?.title,
      })),
    };

    // Check 2: Test if function exists by calling it with a dummy embedding
    console.log('[TEST] Testing if match_chunks_across_notes function exists...');
    const testEmbedding = new Array(1536).fill(0.001); // Dummy embedding
    const { data: functionTest, error: functionError } = await supabase.rpc(
      'match_chunks_across_notes',
      {
        p_query_embedding: testEmbedding,
        p_match_threshold: 0.0, // Very low threshold to get any results
        p_limit: 1,
      }
    );

    diagnostics.checks.functionExists = {
      exists: !functionError || functionError.code !== '42883',
      error: functionError ? {
        code: functionError.code,
        message: functionError.message,
        hint: functionError.hint,
        details: functionError.details,
      } : null,
      returnedData: functionTest !== null && functionTest !== undefined,
      dataType: Array.isArray(functionTest) ? 'array' : typeof functionTest,
      dataLength: Array.isArray(functionTest) ? functionTest.length : null,
    };

    // Check 3: Test with a real query embedding
    if (diagnostics.checks.chunksWithEmbeddings.exists) {
      console.log('[TEST] Testing with real query embedding...');
      const testQuery = 'test';
      const queryEmbedding = await generateEmbedding(testQuery);
      
      const { data: realTest, error: realError } = await supabase.rpc(
        'match_chunks_across_notes',
        {
          p_query_embedding: queryEmbedding,
          p_match_threshold: 0.0,
          p_limit: 5,
        }
      );

      diagnostics.checks.realQueryTest = {
        success: !realError,
        error: realError ? {
          code: realError.code,
          message: realError.message,
        } : null,
        resultCount: Array.isArray(realTest) ? realTest.length : 0,
        sampleResults: Array.isArray(realTest) ? realTest.slice(0, 2) : null,
      };
    }

    // Check 4: Verify RLS policies
    console.log('[TEST] Checking RLS policies...');
    const { data: rlsCheck, error: rlsError } = await supabase
      .from('note_chunks')
      .select('id, note_id, notes!inner(user_id)')
      .eq('notes.user_id', session.user.id)
      .limit(1);

    diagnostics.checks.rlsPolicy = {
      allowsRead: !rlsError && rlsCheck !== null,
      error: rlsError ? {
        code: rlsError.code,
        message: rlsError.message,
      } : null,
    };

    return NextResponse.json(diagnostics, { status: 200 });
  } catch (error) {
    console.error('[TEST] Error in diagnostic test:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to run diagnostic test',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

