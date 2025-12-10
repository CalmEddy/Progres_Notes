import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createNoteForUser } from '@/lib/notes';
import { importNotionDatabase } from '@/lib/import/fileImporters/notionImporter';
import { NotionImportResult } from '@/lib/import/types';

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

// POST /api/import/notion - Import pages from a Notion database
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for Notion API key
    const notionApiKey = process.env.NOTION_API_KEY;
    if (!notionApiKey) {
      return NextResponse.json(
        { error: 'Notion API key is not configured. Please set NOTION_API_KEY environment variable.' },
        { status: 500 }
      );
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { databaseId, filters, startIndex, endIndex, maxPages } = body;

    if (!databaseId || typeof databaseId !== 'string') {
      return NextResponse.json(
        { error: 'databaseId is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate range parameters if provided
    if (startIndex !== undefined) {
      if (typeof startIndex !== 'number' || startIndex < 1) {
        return NextResponse.json(
          { error: 'startIndex must be a number >= 1' },
          { status: 400 }
        );
      }
    }

    if (endIndex !== undefined) {
      if (typeof endIndex !== 'number' || endIndex < 1) {
        return NextResponse.json(
          { error: 'endIndex must be a number >= 1' },
          { status: 400 }
        );
      }
    }

    if (startIndex !== undefined && endIndex !== undefined && startIndex > endIndex) {
      return NextResponse.json(
        { error: 'startIndex must be <= endIndex' },
        { status: 400 }
      );
    }

    if (maxPages !== undefined) {
      if (typeof maxPages !== 'number' || maxPages < 1) {
        return NextResponse.json(
          { error: 'maxPages must be a number >= 1' },
          { status: 400 }
        );
      }
    }

    // Validate database ID format (Notion database IDs are 32 hex characters, possibly with dashes)
    // Accept both formats: with dashes (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) or without
    const cleanedDatabaseId = databaseId.replace(/-/g, '');
    if (!/^[a-f0-9]{32}$/i.test(cleanedDatabaseId)) {
      return NextResponse.json(
        { error: 'Invalid database ID format. Database ID should be a 32-character hexadecimal string (with or without dashes).' },
        { status: 400 }
      );
    }

    // Import from Notion database (use original format as Notion API accepts both)
    console.log(`Starting Notion import for database: ${databaseId}`);
    let extractedContents;
    try {
      extractedContents = await importNotionDatabase(notionApiKey, {
        databaseId, // Use original format
        filters,
        startIndex,
        endIndex,
        maxPages,
      });
      console.log(`Notion import completed. Found ${extractedContents.length} pages with content.`);
    } catch (importError) {
      console.error('Error in importNotionDatabase:', importError);
      // Re-throw with context
      throw new Error(
        importError instanceof Error 
          ? `Import failed: ${importError.message}` 
          : 'Unknown error during import'
      );
    }

    if (extractedContents.length === 0) {
      return NextResponse.json(
        {
          success: true,
          importedCount: 0,
          failedCount: 0,
          message: 'No pages found in database or all pages were empty',
        } as NotionImportResult,
        { status: 200 }
      );
    }

    // Create notes for each imported page
    const errors: Array<{ pageTitle: string; error: string }> = [];
    let importedCount = 0;

    for (const content of extractedContents) {
      try {
        // Import page even if it has no body content - at least import the title
        // Use empty string if body is missing
        const body = content.body && content.body.trim().length > 0 
          ? content.body.trim() 
          : '';

        // Create note (body can be empty if page has no content)
        await createNoteForUser(
          session.user.id,
          content.title,
          body,
          session.accessToken
        );

        importedCount++;
      } catch (error) {
        errors.push({
          pageTitle: content.title || 'Untitled',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const result: NotionImportResult = {
      success: true,
      importedCount,
      failedCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error importing from Notion:', error);
    
    // Log full error details for debugging
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }

    // Handle specific Notion API errors
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      
      if (errorMessage.includes('database_id') || errorMessage.includes('object_not_found')) {
        return NextResponse.json(
          { error: 'Invalid database ID. Please check that the database ID is correct and the API key has access to it.' },
          { status: 400 }
        );
      }
      if (errorMessage.includes('unauthorized') || errorMessage.includes('401') || errorMessage.includes('invalid_api_key')) {
        return NextResponse.json(
          { error: 'Notion API authentication failed. Please check the API key configuration.' },
          { status: 401 }
        );
      }
      if (errorMessage.includes('rate_limit') || errorMessage.includes('429')) {
        return NextResponse.json(
          { error: 'Notion API rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }
      
      // Return the actual error message for debugging
      return NextResponse.json(
        {
          error: `Failed to import from Notion: ${error.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to import from Notion: Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

