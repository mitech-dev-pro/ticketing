import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { format } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { visibleTicketsWhere } from '@/lib/permissions';
import { StatCard } from '@/components/home/stat-card';
import { ListCard, type HomeTicketRow } from '@/components/home/list-card';
import type { Prisma } from '@/generated/prisma/client';

export const metadata: Metadata = {
  title: 'Home — miLife Service Desk',
};

const DISPLAY_TIME_ZONE = 'Africa/Accra';
const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'AWAITING_REQUESTER'] as const;
const ROLE_LABELS = { MEMBER: 'Member', HEAD: 'Department head', ADMIN: 'Admin' } as const;

function greeting(now: Date): string {
  const hour = new TZDate(now, DISPLAY_TIME_ZONE).getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const user = session.user;
  const isAdmin = user.role === 'ADMIN';
  const isHeadOrAdminUser = user.role === 'HEAD' || isAdmin;

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const visible = visibleTicketsWhere(user);

  // Admins have no single department, so their "oversight" queries (escalations to
  // acknowledge, low ratings to follow up) look at everything; heads are scoped to
  // their own department's current leg, same as the Inbox and Workload pages.
  const deptScope: Prisma.TicketWhereInput = isAdmin
    ? {}
    : { legs: { some: { departmentId: user.departmentId, outAt: null } } };

  const [
    assignedToMeCount,
    dueIn24hTickets,
    yourOpenRequestsCount,
    escalationsOrMentionsCount,
    needsYouTickets,
    yourRequests,
    recentEvents,
    lowRatingTickets,
  ] = await Promise.all([
    prisma.ticket.count({
      where: { AND: [visible, { assigneeId: user.id, status: { in: [...OPEN_STATUSES] } }] },
    }),
    prisma.ticket.findMany({
      where: {
        AND: [
          visible,
          { assigneeId: user.id, status: { in: [...OPEN_STATUSES] }, dueAt: { lte: in24h } },
        ],
      },
      select: { number: true, subject: true, priority: true, dueAt: true },
      orderBy: { dueAt: 'asc' },
      take: 5,
    }),
    prisma.ticket.count({
      where: { requesterId: user.id, status: { in: [...OPEN_STATUSES] } },
    }),
    isHeadOrAdminUser
      ? prisma.escalation.count({
          where: {
            acknowledgedAt: null,
            ...(isAdmin ? {} : { level: 1 }),
            ticket: isAdmin ? {} : deptScope,
          },
        })
      : prisma.ticket.count({
          where: {
            AND: [
              visible,
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
        }),
    prisma.ticket.findMany({
      where: {
        AND: [visible, { assigneeId: user.id, status: { in: [...OPEN_STATUSES] } }],
      },
      select: { number: true, subject: true, priority: true, dueAt: true },
      orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }],
      take: 5,
    }),
    prisma.ticket.findMany({
      where: { requesterId: user.id },
      select: { number: true, subject: true, priority: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.ticketEvent.findMany({
      where: {
        type: { notIn: ['MESSAGE', 'NOTE'] },
        ticket: { OR: [{ requesterId: user.id }, { assigneeId: user.id }] },
      },
      select: {
        type: true,
        createdAt: true,
        by: { select: { name: true } },
        ticket: { select: { number: true, subject: true, priority: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    isHeadOrAdminUser
      ? prisma.ticket.findMany({
          where: { AND: [deptScope, { csat: { lte: 2 }, ratingFollowedUpAt: null }] },
          select: { number: true, subject: true, priority: true, csat: true },
          orderBy: { resolvedAt: 'desc' },
          take: 5,
        })
      : Promise.resolve([]),
  ]);

  const dueIn24hCount = dueIn24hTickets.length;
  const anyOverdue = dueIn24hTickets.some((t) => t.dueAt.getTime() < now.getTime());

  const toRow = (
    t: { number: number; subject: string; priority: HomeTicketRow['priority'] },
    meta: string,
  ): HomeTicketRow => ({
    number: t.number,
    subject: t.subject,
    priority: t.priority,
    meta,
  });

  const needsYouRows = needsYouTickets.map((t) => toRow(t, t.priority));
  const dueIn24hRows = dueIn24hTickets.map((t) =>
    toRow(t, t.dueAt.getTime() < now.getTime() ? 'Overdue' : 'Due within 24h'),
  );
  const yourRequestsRows = yourRequests.map((t) => toRow(t, t.status.replace('_', ' ')));
  const lowRatingRows = lowRatingTickets.map((t) => toRow(t, `${t.csat}/5`));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-small text-muted">
          {format(new TZDate(now, DISPLAY_TIME_ZONE), 'EEEE, d MMMM')}
        </p>
        <h1 className="text-title font-bold text-ink">
          {greeting(now)}, {user.name.split(' ')[0]}
        </h1>
        <p className="mt-1 text-small text-muted">
          {ROLE_LABELS[user.role]} · {user.branch.replace(/_/g, ' ')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Assigned to you"
          value={assignedToMeCount}
          href="/inbox?tab=assigned-to-me"
        />
        <StatCard
          label="Due in 24h"
          value={dueIn24hCount}
          danger={anyOverdue}
          href="/inbox?tab=assigned-to-me&due=24h"
        />
        <StatCard
          label="Your open requests"
          value={yourOpenRequestsCount}
          href="/sent?status=open"
        />
        {isHeadOrAdminUser ? (
          <StatCard
            label="Escalations to acknowledge"
            value={escalationsOrMentionsCount}
            href="/escalations"
          />
        ) : (
          <StatCard label="Mentions" value={escalationsOrMentionsCount} href="/mentions" />
        )}
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}
      >
        <ListCard
          title="Needs you"
          viewAllHref="/inbox?tab=assigned-to-me"
          emptyText="Nothing waiting on you right now."
          rows={needsYouRows}
        />
        <ListCard
          title="Due in next 24 hours"
          viewAllHref="/inbox?tab=assigned-to-me&due=24h"
          emptyText="Nothing due that soon."
          rows={dueIn24hRows}
        />
        <ListCard
          title="Your requests"
          viewAllHref="/sent"
          emptyText="You haven't raised anything yet."
          rows={yourRequestsRows}
        />
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <h2 className="text-small font-semibold text-ink">Recent updates</h2>
          {recentEvents.length === 0 ? (
            <p className="text-small text-muted">No recent activity on your tickets.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentEvents.map((event, index) => (
                <Link
                  key={index}
                  href={`/tickets/${event.ticket.number}`}
                  className="flex flex-col rounded-control px-1 py-1 text-small hover:bg-hover"
                >
                  <span className="text-ink-2">
                    {event.by?.name ?? 'System'} updated{' '}
                    <span className="font-mono text-label text-muted">
                      MLT-{event.ticket.number}
                    </span>
                  </span>
                  <span className="text-label text-faint">{event.ticket.subject}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {isHeadOrAdminUser ? (
          <ListCard
            title="Low ratings to follow up"
            emptyText="No low ratings waiting on a follow-up."
            rows={lowRatingRows}
          />
        ) : null}

        <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
          <h2 className="text-small font-semibold text-ink">Announcements</h2>
          <p className="text-small text-muted">Coming in a later phase.</p>
        </div>
      </div>
    </div>
  );
}
