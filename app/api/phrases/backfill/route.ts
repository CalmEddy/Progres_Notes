import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processAllUsersNotes, processUserNotes, BackfillOptions } from '@/lib/phrases/backfillService';

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

// POST /api/phrases/backfill - Trigger phrase extraction backfill
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body for options
    const body = await request.json().catch(() => ({}));
    const {
      userId,
      batchSize,
      skipExisting,
      delayMs,
      maxNotes,
    } = body as Partial<BackfillOptions & { userId?: string }>;

    const options: BackfillOptions = {
      batchSize: batchSize || 50,
      skipExisting: skipExisting !== false, // Default to true
      delayMs: delayMs || 100,
      maxNotes: maxNotes || undefined,
    };

    // Start backfill in background (don't await to avoid timeout)
    // In production, consider using a job queue system
    let backfillPromise: Promise<any>;
    
    if (userId) {
      // Validate that user can only process their own notes (unless admin)
      if (userId !== session.user.id) {
        // Check if user is admin (you may want to implement admin check)
        // For now, only allow users to process their own notes
        return NextResponse.json(
          { error: 'You can only process your own notes' },
          { status: 403 }
        );
      }
      backfillPromise = processUserNotes(userId, options);
    } else {
      // Processing all users requires admin privileges
      // For now, we'll restrict this to the authenticated user's notes only
      // In production, implement proper admin check
      backfillPromise = processUserNotes(session.user.id, options);
    }

    // Return immediately with job started status
    // In production, you'd want to return a job ID and poll for status
    backfillPromise
      .then((result) => {
        console.log('Backfill completed:', {
          totalNotes: result.totalNotes,
          processedNotes: result.processedNotes,
          skippedNotes: result.skippedNotes,
          failedNotes: result.failedNotes,
          totalPhrasesExtracted: result.totalPhrasesExtracted,
        });
      })
      .catch((error) => {
        console.error('Backfill failed:', error);
      });

    return NextResponse.json({
      success: true,
      message: 'Backfill started',
      userId: userId || session.user.id,
      options,
    });
  } catch (error) {
    console.error('Error starting backfill:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to start backfill',
      },
      { status: 500 }
    );
  }
}

// GET /api/phrases/backfill - Get backfill status (placeholder - implement job tracking if needed)
export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Backfill status endpoint - implement job tracking if needed',
    note: 'For now, check server logs for backfill progress',
  });
}

