import { createClient } from '@supabase/supabase-js';
import { WorldPremiseItem } from './generateComedy';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface ComedyBasePremise {
  id: string;
  user_id: string;
  note_id: string;
  topic: string;
  items: WorldPremiseItem[];
  clean: boolean;
  created_at: string;
  updated_at: string;
}

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

// Dynamic import for server-side only (prevents client-side import errors)
async function getServerClient() {
  const { createSupabaseServerClient } = await import('../supabaseServerClient');
  return createSupabaseServerClient();
}

/**
 * Store base premises for a note
 */
export async function storeBasePremises(
  userId: string,
  noteId: string,
  topic: string,
  items: WorldPremiseItem[],
  clean: boolean,
  accessToken?: string
): Promise<ComedyBasePremise> {
  const supabase = createAuthenticatedClient(accessToken) || await getServerClient();

  const { data, error } = await supabase
    .from('comedy_base_premises')
    .insert({
      user_id: userId,
      note_id: noteId,
      topic: topic.trim(),
      items: items,
      clean: clean,
    })
    .select()
    .single();

  if (error) {
    console.error('Error storing base premises:', error);
    throw new Error(`Failed to store base premises: ${error.message}`);
  }

  if (!data) {
    throw new Error('Base premises stored but no data returned');
  }

  return data as ComedyBasePremise;
}

/**
 * Get base premises by note ID
 */
export async function getBasePremisesByNoteId(
  noteId: string,
  accessToken?: string
): Promise<ComedyBasePremise | null> {
  const supabase = createAuthenticatedClient(accessToken) || await getServerClient();

  const { data, error } = await supabase
    .from('comedy_base_premises')
    .select('*')
    .eq('note_id', noteId)
    .maybeSingle();

  if (error) {
    console.error('Error getting base premises:', error);
    throw new Error(`Failed to get base premises: ${error.message}`);
  }

  return data as ComedyBasePremise | null;
}

/**
 * Get base premises by topic (for checking if premises exist for a topic)
 */
export async function getBasePremisesByTopic(
  userId: string,
  topic: string,
  accessToken?: string
): Promise<ComedyBasePremise | null> {
  const supabase = createAuthenticatedClient(accessToken) || await getServerClient();

  const { data, error } = await supabase
    .from('comedy_base_premises')
    .select('*')
    .eq('user_id', userId)
    .eq('topic', topic.trim())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error getting base premises by topic:', error);
    throw new Error(`Failed to get base premises by topic: ${error.message}`);
  }

  return data as ComedyBasePremise | null;
}

