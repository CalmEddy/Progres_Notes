import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateComedy } from '@/lib/comedy/generateComedy';
import { createNoteForUser } from '@/lib/notes';
import { getStyleContract, StyleContract } from '@/lib/comedy/styleContracts';

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

/**
 * POST /api/comedy/generate
 * 
 * Generate comedy material based on topic and count
 * 
 * Request body:
 * - topic: string (required)
 * - jokeCount: number (required, clamped to 1-25, defaults to 10)
 * 
 * Response:
 * - text: string - Full text output
 * - chunks: string[] - Material split by blank lines
 * - diagnostics: JokeDiagnostics[] - Diagnostics aligned to chunks
 * - note: object - Created note information (id, title, created_at)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { topic, jokeCount, clean, styleContractId } = body;

    // Validate topic
    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return NextResponse.json(
        { error: 'Topic is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    // Validate and clamp jokeCount
    let count: number;
    if (typeof jokeCount === 'number') {
      count = Math.max(1, Math.min(25, Math.round(jokeCount)));
    } else if (typeof jokeCount === 'string') {
      const parsed = parseInt(jokeCount, 10);
      if (isNaN(parsed)) {
        count = 10; // default
      } else {
        count = Math.max(1, Math.min(25, parsed));
      }
    } else {
      count = 10; // default
    }

    // Get style contract if specified
    let styleContract: StyleContract | undefined = undefined;
    if (styleContractId) {
      const contract = getStyleContract(styleContractId);
      if (!contract) {
        return NextResponse.json(
          { error: `Invalid styleContractId: ${styleContractId}` },
          { status: 400 }
        );
      }
      styleContract = contract;
    }

    // Generate comedy
    const result = await generateComedy({
      topic: topic.trim(),
      jokeCount: count,
      clean: clean !== false, // default to true
      styleContract,
    });

    // Extract text from RewrittenItem[] format
    const jokeStrings = result.jokes.map((item) => {
      if ('text' in item) {
        return item.text;
      } else if ('a' in item) {
        // Legacy format fallback
        return item.a;
      }
      throw new Error('Invalid joke format in response');
    });
    const text = jokeStrings.join('\n\n');
    const chunks = jokeStrings;

    // Save generated jokes as a note
    const noteTitle = `Jokes about ${topic.trim()}`;
    const note = await createNoteForUser(
      session.user.id,
      noteTitle,
      text,
      undefined, // folderId
      undefined, // parentNoteId
      undefined, // position
      session.accessToken,
      result.diagnostics || [] // Handle optional diagnostics
    );

    return NextResponse.json({
      text,
      chunks,
      diagnostics: result.diagnostics || [], // Handle optional diagnostics
      baseJokes: result.baseJokes, // Deprecated: for backward compatibility
      selectedPremises: result.selectedPremises, // Selected premises sent to rewrite step
      note: {
        id: note.id,
        title: note.title,
        created_at: note.created_at,
      },
    });
  } catch (error) {
    console.error('Error in comedy generation endpoint:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate comedy',
      },
      { status: 500 }
    );
  }
}
