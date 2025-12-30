import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getOpenAIClient } from '@/lib/openaiClient';
import {
  createConversation,
  addMessageToConversation,
  getConversationWithMessages,
} from '@/lib/conversations/conversationStorage';

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

// POST /api/chat - Handle chat requests, stream responses, save to database
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { message, conversationId, model = 'gpt-4o-mini' } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const openai = getOpenAIClient();
    let conversationNoteId = conversationId;

    // If no conversation ID, create a new conversation
    if (!conversationNoteId) {
      const newConversation = await createConversation(
        session.user.id,
        [{ role: 'user', content: message }],
        null,
        session.accessToken
      );
      conversationNoteId = newConversation.id;
    } else {
      // Add user message to existing conversation
      await addMessageToConversation(
        conversationNoteId,
        'user',
        message,
        session.accessToken
      );
    }

    // Get conversation history for context
    const conversation = await getConversationWithMessages(
      conversationNoteId,
      session.accessToken
    );

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Build messages array for OpenAI API
    const messages = conversation.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Call OpenAI API with streaming
          const completion = await openai.chat.completions.create({
            model,
            messages: messages as any,
            stream: true,
            top_p: 0.95,
            presence_penalty: 0.4,
            frequency_penalty: 0.2,
            max_tokens: 700,
          });

          let fullResponse = '';

          // Stream the response
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              fullResponse += content;
              // Send chunk to client
              const data = `data: ${JSON.stringify({ content, done: false })}\n\n`;
              controller.enqueue(new TextEncoder().encode(data));
            }
          }

          // Save assistant response to database
          await addMessageToConversation(
            conversationNoteId,
            'assistant',
            fullResponse,
            session.accessToken
          );

          // Send final message
          const finalData = `data: ${JSON.stringify({ content: '', done: true, conversationId: conversationNoteId })}\n\n`;
          controller.enqueue(new TextEncoder().encode(finalData));
          controller.close();
        } catch (error) {
          console.error('Error in chat stream:', error);
          const errorData = `data: ${JSON.stringify({ 
            error: error instanceof Error ? error.message : 'Failed to get response',
            done: true 
          })}\n\n`;
          controller.enqueue(new TextEncoder().encode(errorData));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to process chat request',
      },
      { status: 500 }
    );
  }
}
