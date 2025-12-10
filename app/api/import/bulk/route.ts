import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createNoteForUser } from '@/lib/notes';
import { importJsonFile } from '@/lib/import/fileImporters/jsonImporter';
import { MAX_FILE_SIZE } from '@/lib/import/types';

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

interface BulkImportResult {
  success: boolean;
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    title: string;
    success: boolean;
    noteId?: string;
    error?: string;
  }>;
}

// POST /api/import/bulk - Bulk import JSON file with multiple blog entries
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

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.json')) {
      return NextResponse.json(
        { error: 'File must be a JSON file (.json)' },
        { status: 400 }
      );
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const content = Buffer.from(arrayBuffer).toString('utf-8');

    // Import JSON and extract entries
    const extractedContents = await importJsonFile(content, file.name);

    if (extractedContents.length === 0) {
      return NextResponse.json(
        { error: 'JSON file contains no valid entries' },
        { status: 400 }
      );
    }

    // Process entries and create notes
    const results: BulkImportResult['results'] = [];
    let successful = 0;
    let failed = 0;

    for (const extracted of extractedContents) {
      try {
        // Validate extracted content
        if (!extracted.body || extracted.body.trim().length === 0) {
          results.push({
            title: extracted.title || 'Untitled',
            success: false,
            error: 'Entry body is empty',
          });
          failed++;
          continue;
        }

        // Create note using existing function
        const note = await createNoteForUser(
          session.user.id,
          extracted.title,
          extracted.body,
          session.accessToken
        );

        results.push({
          title: extracted.title || 'Untitled',
          success: true,
          noteId: note.id,
        });
        successful++;
      } catch (error) {
        results.push({
          title: extracted.title || 'Untitled',
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create note',
        });
        failed++;
      }
    }

    const bulkResult: BulkImportResult = {
      success: true,
      total: extractedContents.length,
      successful,
      failed,
      results,
    };

    return NextResponse.json(bulkResult, { status: 200 });
  } catch (error) {
    console.error('Error in bulk import:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to import file',
      },
      { status: 500 }
    );
  }
}


