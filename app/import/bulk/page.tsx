import { createSupabaseServerClient } from '@/lib/supabaseServerClient';
import BulkImportClient from './BulkImportClient';

export default async function BulkImportPage() {
  // Try to get session on server, but don't block if it fails
  // Client-side will handle the auth check
  let userEmail = 'User';
  
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user?.email) {
      userEmail = session.user.email;
    }
  } catch (err) {
    // Server-side session check failed, let client-side handle it
    console.log('Server-side session check failed, client-side will verify');
  }

  return <BulkImportClient userEmail={userEmail} />;
}


