import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../supabaseServerClient';
import { getChunksForNote, NoteChunk } from '../chunks/chunking';
import { generateThemeLabel } from './themeLabelGenerator';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface NoteTheme {
  id: string;
  note_id: string;
  theme_label: string | null;
  centroid_embedding: number[] | null;
  is_user_modified: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Calculate the centroid (mean) of multiple embeddings
 */
function calculateCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    throw new Error('Cannot calculate centroid of empty embeddings array');
  }

  const dimension = embeddings[0].length;
  
  // Validate all embeddings have same dimension
  for (const embedding of embeddings) {
    if (embedding.length !== dimension) {
      throw new Error('All embeddings must have the same dimension');
    }
  }

  // Calculate mean for each dimension
  const centroid: number[] = [];
  for (let i = 0; i < dimension; i++) {
    let sum = 0;
    for (const embedding of embeddings) {
      sum += embedding[i];
    }
    centroid.push(sum / embeddings.length);
  }

  return centroid;
}

/**
 * Calculate cosine similarity between two embeddings
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Helper to create an authenticated Supabase client with user session
 */
function createAuthenticatedClient(accessToken?: string) {
  if (accessToken) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }
  return null;
}

/**
 * Generate or update theme for a note
 * Calculates centroid from all chunk embeddings and assigns chunks to theme
 * 
 * @param noteId - The note ID
 * @param accessToken - Optional access token for authenticated requests
 * @param preserveUserLabel - If true, preserve user-modified theme label
 * @param noteTitle - Optional note title for label generation
 */
export async function generateThemeForNote(
  noteId: string,
  accessToken?: string,
  preserveUserLabel: boolean = true,
  noteTitle?: string | null
): Promise<NoteTheme> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  // Get all chunks with embeddings for this note
  const chunks = await getChunksForNote(noteId, accessToken);
  
  const chunksWithEmbeddings = chunks.filter(
    chunk => chunk.embedding !== null && chunk.embedding.length > 0
  ) as Array<NoteChunk & { embedding: number[] }>;

  if (chunksWithEmbeddings.length === 0) {
    throw new Error('Cannot generate theme: no chunks with embeddings found');
  }

  // Calculate centroid from chunk embeddings
  const embeddings = chunksWithEmbeddings.map(chunk => chunk.embedding);
  const centroidEmbedding = calculateCentroid(embeddings);

  // Get existing theme to check if user has modified it
  const { data: existingTheme } = await supabase
    .from('note_themes')
    .select('*')
    .eq('note_id', noteId)
    .single();

  let themeLabel: string | null = null;
  let isUserModified = false;

  if (existingTheme && preserveUserLabel && existingTheme.is_user_modified) {
    // Preserve user-modified label
    themeLabel = existingTheme.theme_label;
    isUserModified = true;
  } else {
    // Generate label if not user-modified
    try {
      // If noteTitle not provided, try to fetch it from database
      let titleToUse = noteTitle;
      if (titleToUse === undefined) {
        const { data: note } = await supabase
          .from('notes')
          .select('title')
          .eq('id', noteId)
          .single();
        titleToUse = note?.title || null;
      }

      themeLabel = await generateThemeLabel(titleToUse, chunks);
    } catch (error) {
      console.error('Error generating theme label:', error);
      // Don't fail theme generation if label generation fails
      themeLabel = null;
    }
  }

  // Upsert theme
  const { data: theme, error: themeError } = await supabase
    .from('note_themes')
    .upsert({
      note_id: noteId,
      theme_label: themeLabel,
      centroid_embedding: centroidEmbedding,
      is_user_modified: isUserModified,
    }, {
      onConflict: 'note_id',
    })
    .select()
    .single();

  if (themeError) {
    console.error('Error creating/updating theme:', themeError);
    throw new Error(`Failed to create/update theme: ${themeError.message}`);
  }

  if (!theme) {
    throw new Error('Theme created but no data returned');
  }

  // Assign all chunks to this theme with similarity scores
  const themeId = theme.id;
  
  // Delete existing assignments
  await supabase
    .from('chunk_theme_assignments')
    .delete()
    .in('chunk_id', chunksWithEmbeddings.map(chunk => chunk.id));

  // Create new assignments with similarity scores
  const assignments = chunksWithEmbeddings.map(chunk => {
    const similarity = cosineSimilarity(chunk.embedding, centroidEmbedding);
    return {
      chunk_id: chunk.id,
      theme_id: themeId,
      similarity_score: similarity,
    };
  });

  if (assignments.length > 0) {
    const { error: assignmentError } = await supabase
      .from('chunk_theme_assignments')
      .upsert(assignments, {
        onConflict: 'chunk_id',
      });

    if (assignmentError) {
      console.error('Error creating chunk theme assignments:', assignmentError);
      // Don't throw - theme is created, assignments can be retried
    }
  }

  return theme as NoteTheme;
}

/**
 * Update theme label (user modification)
 */
export async function updateThemeLabel(
  noteId: string,
  themeLabel: string | null,
  accessToken?: string
): Promise<NoteTheme> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('note_themes')
    .update({
      theme_label: themeLabel,
      is_user_modified: true,
    })
    .eq('note_id', noteId)
    .select()
    .single();

  if (error) {
    console.error('Error updating theme label:', error);
    throw new Error(`Failed to update theme label: ${error.message}`);
  }

  if (!data) {
    throw new Error('Theme not found');
  }

  return data as NoteTheme;
}

/**
 * Get theme for a note
 */
export async function getThemeForNote(
  noteId: string,
  accessToken?: string
): Promise<NoteTheme | null> {
  const supabase = createAuthenticatedClient(accessToken) || await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('note_themes')
    .select('*')
    .eq('note_id', noteId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error getting theme:', error);
    throw new Error(`Failed to get theme: ${error.message}`);
  }

  return data as NoteTheme;
}

