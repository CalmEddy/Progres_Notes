import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rewritePremisesFromNote } from '@/lib/comedy/generateComedy';
import { createNoteForUser } from '@/lib/notes';
import { getStyleContract, getDefaultStyleContract } from '@/lib/comedy/styleContracts';

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
 * POST /api/comedy/rewrite
 * 
 * Stage 2: Rewrite stored base premises with a different style contract
 * 
 * Request body:
 * - noteId: string (required) - ID of the note containing base premises
 * - styleContractId: string (optional) - ID of the style contract to use, defaults to default style
 * - jokeCount: number (optional, defaults to 10) - Number of jokes to generate
 * 
 * Response:
 * - noteId: string - ID of the created rewritten note
 * - text: string - Full text output
 * - chunks: string[] - Material split by blank lines
 * - note: object - Created note information (id, title, created_at)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { noteId, styleContractId, jokeCount } = body;

    // Validate noteId
    if (!noteId || typeof noteId !== 'string' || noteId.trim().length === 0) {
      return NextResponse.json(
        { error: 'noteId is required and must be a non-empty string' },
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

    // Get style contract
    let styleContract;
    if (styleContractId) {
      const contract = getStyleContract(styleContractId);
      if (!contract) {
        return NextResponse.json(
          { error: `Invalid styleContractId: ${styleContractId}` },
          { status: 400 }
        );
      }
      styleContract = contract;
    } else {
      styleContract = getDefaultStyleContract();
    }

    // Rewrite premises from the stored note
    const rewriteResponse = await rewritePremisesFromNote(
      noteId,
      styleContract,
      count,
      session.accessToken
    );

    // Extract text from RewrittenItem[] format
    const jokeStrings = rewriteResponse.jokes.map((item) => {
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

    // Get the source note to get the topic for the title
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      },
    });

    const { data: sourceNote, error: sourceNoteError } = await supabase
      .from('notes')
      .select('title')
      .eq('id', noteId)
      .single();

    if (sourceNoteError || !sourceNote) {
      return NextResponse.json(
        { error: 'Source note not found' },
        { status: 404 }
      );
    }

    // Extract topic from source note title (format: "Base premises: {topic}")
    const topicMatch = sourceNote.title?.match(/^Base premises:\s*(.+)$/);
    const topic = topicMatch ? topicMatch[1] : 'this topic';

    // Count existing child notes to determine position
    const { count: childCount } = await supabase
      .from('notes')
      .select('*', { count: 'exact', head: true })
      .eq('parent_note_id', noteId)
      .eq('user_id', session.user.id);
    
    const position = childCount !== null ? childCount : 0;

    // Create note with rewritten jokes, nested under the base premise note
    const noteTitle = `Jokes about ${topic} (${styleContract.styleId})`;
    const note = await createNoteForUser(
      session.user.id,
      noteTitle,
      text,
      undefined, // folderId
      noteId, // parentNoteId - nest under the base premise note
      position, // position - append to end of children
      session.accessToken
    );

    // Link the rewritten note back to the base premise note
    // (set source_base_premise_note_id and style_contract_id)
    await supabase
      .from('notes')
      .update({
        source_base_premise_note_id: noteId,
        style_contract_id: styleContract.styleId,
      })
      .eq('id', note.id);

    return NextResponse.json({
      noteId: note.id,
      text,
      chunks,
      note: {
        id: note.id,
        title: note.title,
        created_at: note.created_at,
      },
    });
  } catch (error) {
    console.error('Error in rewrite endpoint:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to rewrite premises',
      },
      { status: 500 }
    );
  }
}

