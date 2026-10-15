import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { AppShell } from '@/components/app-shell/app-shell';
import { NewTicketTrigger } from '@/components/new-ticket/new-ticket-trigger';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect('/sign-in');
  }

  return (
    <AppShell
      user={{ name: session.user.name, role: session.user.role }}
      newTicketTrigger={<NewTicketTrigger />}
    >
      {children}
    </AppShell>
  );
}
