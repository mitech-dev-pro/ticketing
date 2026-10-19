import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { isHeadOrAdmin, visibleTicketsWhere } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { formatTicketId } from '@/lib/ids';
import { PriorityBadge } from '@/components/ui/badge';
import { DepartmentFilter } from '@/components/inbox/department-filter';
import { LoadBar } from '@/components/workload/load-bar';

export const metadata: Metadata = {
  title: 'Workload — miLife Service Desk',
};

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'AWAITING_REQUESTER'] as const;

interface WorkloadPageProps {
  searchParams: Promise<{ department?: string }>;
}

export default async function WorkloadPage({ searchParams }: WorkloadPageProps) {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const user = session.user;
  if (!isHeadOrAdmin(user)) redirect('/');

  const params = await searchParams;
  const isAdmin = user.role === 'ADMIN';

  const departments = isAdmin
    ? await prisma.department.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : [];
  const targetDepartmentId = isAdmin
    ? (params.department ?? departments[0]?.id ?? user.departmentId)
    : user.departmentId;
  const targetDepartment = isAdmin
    ? (departments.find((d) => d.id === targetDepartmentId) ?? null)
    : await prisma.department.findUnique({
        where: { id: targetDepartmentId },
        select: { name: true },
      });

  const members = await prisma.user.findMany({
    where: { departmentId: targetDepartmentId, active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const memberIds = members.map((m) => m.id);
  const now = new Date();

  const [openTickets, awayRows] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        AND: [
          visibleTicketsWhere(user),
          { assigneeId: { in: memberIds }, status: { in: [...OPEN_STATUSES] } },
        ],
      },
      select: { number: true, subject: true, priority: true, dueAt: true, assigneeId: true },
      orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }],
    }),
    prisma.outOfOffice.findMany({
      where: { userId: { in: memberIds }, until: { gt: now } },
      select: { userId: true, until: true, delegate: { select: { name: true } } },
    }),
  ]);

  const awayByUserId = new Map(awayRows.map((row) => [row.userId, row]));

  const columns = members.map((member) => {
    const tickets = openTickets.filter((t) => t.assigneeId === member.id);
    const breached = tickets.filter((t) => t.dueAt.getTime() < now.getTime()).length;
    return { member, tickets, breached, away: awayByUserId.get(member.id) ?? null };
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-title font-bold text-ink">Workload</h1>
          <p className="mt-1 text-small text-muted">
            {targetDepartment ? `${targetDepartment.name} — ` : ''}open tickets per person.
          </p>
        </div>
        {isAdmin && departments.length > 0 ? (
          <DepartmentFilter
            departments={departments}
            value={targetDepartmentId}
            basePath="/workload"
          />
        ) : null}
      </div>

      {columns.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface py-16 text-center">
          <p className="text-subject font-semibold text-ink">No team members in this department.</p>
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
        >
          {columns.map(({ member, tickets, breached, away }) => (
            <div
              key={member.id}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink">{member.name}</span>
                <span className="font-mono text-label text-muted">{tickets.length} open</span>
              </div>

              <LoadBar count={tickets.length} />

              {away ? (
                <p className="text-label text-faint">
                  Away until {away.until.toLocaleDateString()} — delegate {away.delegate.name}
                </p>
              ) : null}

              {breached > 0 ? (
                <p className="text-label font-medium text-urgent">{breached} breached</p>
              ) : null}

              {tickets.length === 0 ? (
                <p className="text-small text-muted">Nothing assigned.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {tickets.slice(0, 5).map((ticket) => (
                    <Link
                      key={ticket.number}
                      href={`/tickets/${ticket.number}`}
                      className="flex items-center justify-between gap-2 rounded-control px-1 py-1 text-small hover:bg-hover"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-label text-muted">
                          {formatTicketId(ticket.number)}
                        </span>{' '}
                        <span className="text-ink-2">{ticket.subject}</span>
                      </span>
                      <PriorityBadge priority={ticket.priority} />
                    </Link>
                  ))}
                  {tickets.length > 5 ? (
                    <span className="text-label text-faint">+{tickets.length - 5} more</span>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
