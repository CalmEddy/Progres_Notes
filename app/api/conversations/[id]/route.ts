import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getConversationWithMessages } from '@/lib/conversations/conversationStorage';
import { processConversation } from '@/lib/conversations/conversationProcessor';

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

// GET /api/conversations/[id] - Retrieve conversation with messages
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conversation = await getConversationWithMessages(
      params.id,
      session.accessToken
    );

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(conversation, { status: 200 });
  } catch (error) {
    console.error('Error getting conversation:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to get conversation',
      },
      { status: 500 }
    );
  }
}

// POST /api/conversations/[id]/process - Trigger conversation processing/theme generation
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Process conversation (chunk, generate embeddings, create themes)
    await processConversation(params.id, session.accessToken);

    return NextResponse.json(
      { success: true, message: 'Conversation processed successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error processing conversation:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process conversation',
      },
      { status: 500 }
    );
  }
}

