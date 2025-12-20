'use client';

import BinderView from './components/BinderView';

export default function NotesClient({ userEmail }: { userEmail: string }) {
  return <BinderView userEmail={userEmail} />;
}
