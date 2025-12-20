import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
}

// Client-side Supabase client (for use in Client Components)
// This file must NOT import next/headers to avoid build errors

// Singleton instance to avoid creating multiple clients
let supabaseClientInstance: ReturnType<typeof createClient> | null = null;

export function createSupabaseClient() {
  // Return singleton instance if it exists
  if (supabaseClientInstance) {
    return supabaseClientInstance;
  }
  
  // Create new instance only if it doesn't exist
  supabaseClientInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  
  return supabaseClientInstance;
}
