import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatDeadline } from '@/lib/dates';
import { formatTicketId } from '@/lib/ids';
import { PriorityBadge, StatusBadge } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: 'Sent — miLife Service Desk',
};

export default async function SentPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const tickets = await prisma.ticket.findMany({
    where: { requesterId: session.user.id },
    select: {
      number: true,
      subject: true,
      priority: true,
      status: true,
      dueAt: true,
      createdAt: true,
      legs: { where: { outAt: null }, select: { department: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const now = new Date();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-title font-bold text-ink">Sent</h1>
        <p className="mt-1 text-small text-muted">
          Requests you&apos;ve sent, and where they are now.
        </p>
      </div>

      {tickets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface py-16 text-center">
          <p className="text-subject font-semibold text-ink">Nothing sent yet.</p>
          <p className="text-small text-muted">Raise a ticket with &ldquo;+ New ticket&rdquo;.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[640px] border-collapse text-small">
            <thead>
              <tr className="border-b border-line text-label font-mono uppercase tracking-wide text-faint">
                <th className="px-3 py-2.5 text-left">Ticket</th>
                <th className="px-3 py-2.5 text-left">Priority</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-left">With</th>
                <th className="px-3 py-2.5 text-left">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => {
                const deadline = formatDeadline(ticket.dueAt, ticket.createdAt, now);
                const currentDepartment = ticket.legs[0]?.department.name ?? '—';
                return (
                  <tr
                    key={ticket.number}
                    className="border-b border-line-2 last:border-0 hover:bg-hover"
                  >
                    <td className="px-3 py-2.5 align-top">
                      <div className="font-mono text-label text-muted">
                        {formatTicketId(ticket.number)}
                      </div>
                      <div className="font-medium text-ink">{ticket.subject}</div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-3 py-2.5 align-top text-ink-2">{currentDepartment}</td>
                    <td
                      className="px-3 py-2.5 align-top font-mono text-muted"
                      title={deadline.absolute}
                    >
                      {deadline.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
