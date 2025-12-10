import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createNoteForUser } from '@/lib/notes';
import { importFile, detectFileType } from '@/lib/import/importService';
import { SupportedFileType, MAX_FILE_SIZE, ImportOptions } from '@/lib/import/types';

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

// POST /api/import - Import a file and create a note
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Detect file type
    const fileType = detectFileType(file.name);
    if (!fileType) {
      return NextResponse.json(
        { error: 'Unsupported file type. Supported types: .txt, .pdf, .md, .markdown' },
        { status: 400 }
      );
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Import file and extract content
    const importOptions: ImportOptions = {
      filename: file.name,
      fileType,
      content: fileType === 'pdf' ? buffer : buffer.toString('utf-8'),
    };

    const extractedContent = await importFile(importOptions);

    // Validate extracted content
    if (!extractedContent.body || extractedContent.body.trim().length === 0) {
      return NextResponse.json(
        { error: 'File contains no extractable text content' },
        { status: 400 }
      );
    }

    // Create note using existing function
    const note = await createNoteForUser(
      session.user.id,
      extractedContent.title,
      extractedContent.body,
      session.accessToken
    );

    return NextResponse.json(
      {
        success: true,
        noteId: note.id,
        filename: file.name,
        title: note.title,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error importing file:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to import file',
      },
      { status: 500 }
    );
  }
}

