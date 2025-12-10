import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
}

// Server-side Supabase client (for use in Server Components and Server Actions)
// This file can safely import next/headers since it's only used server-side
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  
  // Build cookie string from the cookies object
  // Supabase stores auth cookies with names like 'sb-<project-ref>-auth-token'
  const cookieString = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  
  // Create client with cookies in headers
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: cookieString ? { Cookie: cookieString } : {},
    },
  });
}

