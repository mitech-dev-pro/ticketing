import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { visibleTicketsWhere } from '@/lib/permissions';
import { formatDeadline } from '@/lib/dates';
import { formatTicketId } from '@/lib/ids';
import { PriorityBadge, StatusBadge, Badge } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: 'Mentions — miLife Service Desk',
};

export default async function MentionsPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const user = session.user;

  const tickets = await prisma.ticket.findMany({
    where: {
      AND: [
        visibleTicketsWhere(user),
        {
          mentions: {
            some: {
              OR: [
                { type: 'PERSON', userId: user.id },
                { type: 'DEPARTMENT', departmentId: user.departmentId },
              ],
            },
          },
        },
      ],
    },
    select: {
      number: true,
      subject: true,
      priority: true,
      status: true,
      dueAt: true,
      createdAt: true,
      requester: { select: { name: true } },
      mentions: { select: { type: true, departmentId: true } },
      legs: { where: { outAt: null }, select: { department: { select: { name: true } } } },
    },
    orderBy: { dueAt: 'asc' },
  });

  const now = new Date();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-title font-bold text-ink">Mentions</h1>
        <p className="mt-1 text-small text-muted">
          Tickets where you or your department were @mentioned.
        </p>
      </div>

      {tickets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface py-16 text-center">
          <p className="text-subject font-semibold text-ink">No mentions.</p>
          <p className="text-small text-muted">
            You&apos;ll see tickets here when someone @mentions you.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[720px] border-collapse text-small">
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
                const mentionedDepartment = ticket.mentions.find((m) => m.type === 'DEPARTMENT');
                return (
                  <tr
                    key={ticket.number}
                    className="border-b border-line-2 last:border-0 hover:bg-hover"
                  >
                    <td className="px-3 py-2.5 align-top">
                      <Link href={`/tickets/${ticket.number}`} className="block hover:underline">
                        <div className="font-mono text-label text-muted">
                          {formatTicketId(ticket.number)}
                        </div>
                        <div className="font-medium text-ink">
                          {ticket.subject}
                          {mentionedDepartment ? (
                            <Badge className="ml-1.5 bg-line text-muted">Dept mentioned</Badge>
                          ) : null}
                        </div>
                      </Link>
                      <div className="text-small text-muted">{ticket.requester.name}</div>
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
