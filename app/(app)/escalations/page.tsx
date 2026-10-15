import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { isHeadOrAdmin } from '@/lib/permissions';
import { ComingSoon } from '@/components/app-shell/coming-soon';

export default async function EscalationsPage() {
  const session = await getSession();
  if (!session) {
    redirect('/sign-in');
  }
  if (!isHeadOrAdmin(session.user)) {
    redirect('/');
  }

  return <ComingSoon title="Escalations" phase="Phase 4" />;
}
