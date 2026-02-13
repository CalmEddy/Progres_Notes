import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateBasePremises } from '@/lib/comedy/generateComedy';
import { createNoteForUser } from '@/lib/notes';
import { storeBasePremises } from '@/lib/comedy/basePremiseStorage';
import { getDefaultStyleContract } from '@/lib/comedy/styleContracts';

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
 * POST /api/comedy/generate-base
 * 
 * Stage 1: Generate base premises for a topic and store them in the database
 * 
 * Request body:
 * - topic: string (required)
 * - jokeCount: number (optional, defaults to 10, used to determine premise count)
 * - clean: boolean (optional, defaults to true)
 * - runStage2: boolean (optional, defaults to false) - If true, also runs Stage 2 with default style contract
 * 
 * Response:
 * - noteId: string - ID of the created note
 * - topic: string - The topic used
 * - itemCount: number - Number of base premises generated
 * - note: object - Created note information (id, title, created_at)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { topic, jokeCount, clean, runStage2 } = body;

    // Validate topic
    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return NextResponse.json(
        { error: 'Topic is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    // Validate and clamp jokeCount (used to calculate premise count)
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

    // Calculate premise count (N_base = max(12, N_final * 3))
    const premiseCount = Math.max(12, count * 3);
    const cleanLabel = clean === false ? 'NO' : 'YES';

    // Generate base premises
    const baseResponse = await generateBasePremises({
      topic: topic.trim(),
      premiseCount,
      cleanLabel,
      temperature: 0.8,
      addReminder: false,
    });

    // Create a note to store the base premises
    // Format base premises as readable text for the note body
    const basePremisesText = baseResponse.items
      .map((item, idx) => `${idx + 1}. [${item.world}] ${item.premise}`)
      .join('\n\n');

    const noteTitle = `Base premises: ${topic.trim()}`;
    const note = await createNoteForUser(
      session.user.id,
      noteTitle,
      basePremisesText,
      undefined, // folderId
      undefined, // parentNoteId
      undefined, // position
      session.accessToken
    );

    // Store base premises in database
    await storeBasePremises(
      session.user.id,
      note.id,
      topic.trim(),
      baseResponse.items,
      clean !== false,
      session.accessToken
    );

    // Optionally run Stage 2 with default style contract
    let stage2Note = null;
    if (runStage2) {
      try {
        const { rewritePremisesFromNote } = await import('@/lib/comedy/generateComedy');
        const defaultStyleContract = getDefaultStyleContract();
        
        const rewriteResponse = await rewritePremisesFromNote(
          note.id,
          defaultStyleContract,
          count,
          session.accessToken
        );

        // Extract text from rewritten jokes
        const jokeStrings = rewriteResponse.jokes.map((item) => {
          if ('text' in item) {
            return item.text;
          } else if ('a' in item) {
            return item.a;
          }
          throw new Error('Invalid joke format in response');
        });
        const text = jokeStrings.join('\n\n');

        // Count existing child notes to determine position and create supabase client
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
            },
          },
        });

        const { count: childCount } = await supabase
          .from('notes')
          .select('*', { count: 'exact', head: true })
          .eq('parent_note_id', note.id)
          .eq('user_id', session.user.id);
        
        const position = childCount !== null ? childCount : 0;

        // Create note for rewritten jokes, nested under the base premise note
        const rewriteNoteTitle = `Jokes about ${topic.trim()}`;
        stage2Note = await createNoteForUser(
          session.user.id,
          rewriteNoteTitle,
          text,
          undefined, // folderId
          note.id, // parentNoteId - nest under the base premise note
          position, // position - append to end of children
          session.accessToken
        );

        // Link the rewritten note back to the base premise note

        await supabase
          .from('notes')
          .update({
            source_base_premise_note_id: note.id,
            style_contract_id: defaultStyleContract.styleId,
          })
          .eq('id', stage2Note.id);
      } catch (error) {
        console.error('Error running Stage 2:', error);
        // Don't fail Stage 1 if Stage 2 fails
      }
    }

    return NextResponse.json({
      noteId: note.id,
      topic: topic.trim(),
      itemCount: baseResponse.items.length,
      note: {
        id: note.id,
        title: note.title,
        created_at: note.created_at,
      },
      stage2Note: stage2Note ? {
        id: stage2Note.id,
        title: stage2Note.title,
        created_at: stage2Note.created_at,
      } : null,
    });
  } catch (error) {
    console.error('Error in base premise generation endpoint:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate base premises',
      },
      { status: 500 }
    );
  }
}

