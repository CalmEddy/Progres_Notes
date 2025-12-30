import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateComedy } from '@/lib/comedy/generateComedy';
import { createNoteForUser } from '@/lib/notes';

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
 * Split text by blank lines (two or more consecutive newlines)
 * Normalizes CRLF to LF, trims chunks, and filters empty ones
 */
function splitByBlankLines(text: string): string[] {
  // Normalize CRLF to LF
  const normalized = text.replace(/\r\n/g, '\n');
  
  // Split on two or more newlines
  const chunks = normalized.split(/\n{2,}/);
  
  // Trim each chunk and filter empty ones
  return chunks
    .map(chunk => chunk.trim())
    .filter(chunk => chunk.length > 0);
}

/**
 * POST /api/comedy/generate
 * 
 * Generate comedy jokes based on topic and joke count
 * 
 * Request body:
 * - topic: string (required)
 * - jokeCount: number (required, clamped to 1-25, defaults to 10)
 * 
 * Response:
 * - text: string - Full text output
 * - chunks: string[] - Jokes split by blank lines
 * - note: object - Created note information (id, title, created_at)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { topic, jokeCount, clean } = body;

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

    // Generate comedy
    const text = await generateComedy({
      topic: topic.trim(),
      jokeCount: count,
      clean: clean !== false, // default to true
    });

    // Split into chunks
    const chunks = splitByBlankLines(text);

    // Save generated jokes as a note
    const noteTitle = `Jokes about ${topic.trim()}`;
    const note = await createNoteForUser(
      session.user.id,
      noteTitle,
      text,
      undefined, // folderId
      undefined, // parentNoteId
      undefined, // position
      session.accessToken
    );

    return NextResponse.json({
      text,
      chunks,
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
