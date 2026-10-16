import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isHeadOrAdmin } from '@/lib/permissions';
import { EscalationList } from '@/components/escalations/escalation-list';
import type { EscalationRow } from '@/components/escalations/types';

export const metadata: Metadata = {
  title: 'Escalations — miLife Service Desk',
};

export default async function EscalationsPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const user = session.user;
  if (!isHeadOrAdmin(user)) redirect('/');

  const isAdmin = user.role === 'ADMIN';

  const escalations = await prisma.escalation.findMany({
    where: isAdmin
      ? {}
      : { ticket: { legs: { some: { departmentId: user.departmentId, outAt: null } } } },
    select: {
      id: true,
      level: true,
      reason: true,
      at: true,
      acknowledgedAt: true,
      by: { select: { name: true } },
      acknowledgedBy: { select: { name: true } },
      ticket: { select: { number: true, subject: true, status: true, priority: true } },
    },
    orderBy: [{ acknowledgedAt: 'asc' }, { level: 'desc' }, { at: 'asc' }],
  });

  const rows: EscalationRow[] = escalations.map((escalation) => ({
    id: escalation.id,
    level: escalation.level,
    reason: escalation.reason,
    at: escalation.at.toISOString(),
    byName: escalation.by?.name ?? null,
    acknowledgedAt: escalation.acknowledgedAt ? escalation.acknowledgedAt.toISOString() : null,
    acknowledgedByName: escalation.acknowledgedBy?.name ?? null,
    ticketNumber: escalation.ticket.number,
    ticketSubject: escalation.ticket.subject,
    ticketStatus: escalation.ticket.status,
    ticketPriority: escalation.ticket.priority,
    // Heads can acknowledge level 1 for their own department (the query above already
    // scopes them to it); admins can acknowledge any level. Mirrors
    // lib/permissions.ts's acknowledgeL1/acknowledgeL2 rules without a second query
    // per row — the server action still re-checks with can() before writing anything.
    canAcknowledge: isAdmin || escalation.level === 1,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-title font-bold text-ink">Escalations</h1>
        <p className="mt-1 text-small text-muted">
          {isAdmin
            ? 'Every department, level 1 and level 2.'
            : "Level 1 escalations in your department — acknowledge to confirm you've seen them."}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface py-16 text-center">
          <p className="text-subject font-semibold text-ink">No escalations.</p>
          <p className="text-small text-muted">Nothing has breached its deadline.</p>
        </div>
      ) : (
        <EscalationList rows={rows} />
      )}
    </div>
  );
}
