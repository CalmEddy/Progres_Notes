import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateComedy, generateOverlapComedyReport } from '@/lib/comedy/generateComedy';
import { createNoteForUser } from '@/lib/notes';
import { getStyleContract, StyleContract } from '@/lib/comedy/styleContracts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getSessionFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
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
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      return { user: session.user, accessToken: session.access_token };
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { topic, jokeCount, clean, styleContractId, outputMode } = body;

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return NextResponse.json(
        { error: 'Topic is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    let count: number;
    if (typeof jokeCount === 'number') {
      count = Math.max(1, Math.min(25, Math.round(jokeCount)));
    } else if (typeof jokeCount === 'string') {
      const parsed = parseInt(jokeCount, 10);
      if (isNaN(parsed)) {
        count = 10;
      } else {
        count = Math.max(1, Math.min(25, parsed));
      }
    } else {
      count = 10;
    }

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

    if (outputMode === 'overlapReport') {
      const overlapResult = await generateOverlapComedyReport({
        topic: topic.trim(),
        styleContract,
      });

      const reportText = overlapResult.phase2.report;
      const noteTitle = `Overlap Report: ${topic.trim()}`;
      const note = await createNoteForUser(
        session.user.id,
        noteTitle,
        reportText,
        undefined,
        undefined,
        undefined,
        session.accessToken
      );

      return NextResponse.json({
        outputMode: 'overlapReport',
        report: reportText,
        phase1: overlapResult.phase1,
        note: {
          id: note.id,
          title: note.title,
          created_at: note.created_at,
        },
      });
    }

    const result = await generateComedy({
      topic: topic.trim(),
      jokeCount: count,
      clean: clean !== false,
      styleContract,
    });

    const jokeStrings = result.jokes.map((item) => {
      if ('text' in item) {
        return item.text;
      }
      if ('a' in item) {
        return item.a;
      }
      throw new Error('Invalid joke format in response');
    });

    const text = jokeStrings.join('\n\n');
    const chunks = jokeStrings;

    const noteTitle = `Jokes about ${topic.trim()}`;
    const note = await createNoteForUser(
      session.user.id,
      noteTitle,
      text,
      undefined,
      undefined,
      undefined,
      session.accessToken
    );

    return NextResponse.json({
      outputMode: 'standard',
      text,
      chunks,
      baseJokes: result.baseJokes,
      selectedPremises: result.selectedPremises,
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
