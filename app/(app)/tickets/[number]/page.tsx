import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  can,
  currentDepartmentId,
  visibleTicketsWhere,
  type PermissionTicket,
} from '@/lib/permissions';
import { formatDeadline } from '@/lib/dates';
import { formatTicketId, parseTicketId } from '@/lib/ids';
import { TicketHeader } from '@/components/tickets/ticket-header';
import { Conversation } from '@/components/tickets/conversation';
import { Composer } from '@/components/tickets/composer';
import { ActionsPanel } from '@/components/tickets/actions-panel';
import { LowRatingFollowUpBanner, RatingBanner } from '@/components/tickets/rating';
import { TicketPoller } from '@/components/tickets/ticket-poller';
import { SplitList } from '@/components/tickets/split-list';
import { TasksPanel } from '@/components/tickets/tasks-panel';
import { TimePanel } from '@/components/tickets/time-panel';
import { LinkedTicketsPanel } from '@/components/tickets/linked-tickets-panel';
import { listTasks } from '@/lib/services/tasks';
import { listTimeEntries, runningTimer } from '@/lib/services/time';
import { isBlocked, listLinks } from '@/lib/services/links';
import type {
  ConversationEvent,
  JourneyLeg,
  TicketDetail,
  TicketFieldDef,
  TicketPermissions,
} from '@/components/tickets/types';

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'AWAITING_REQUESTER'] as const;

interface TicketPageProps {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ from?: string }>;
}

export async function generateMetadata({ params }: TicketPageProps): Promise<Metadata> {
  const { number: raw } = await params;
  const number = parseTicketId(raw);
  return {
    title: number
      ? `${formatTicketId(number)} — miLife Service Desk`
      : 'Ticket — miLife Service Desk',
  };
}

export default async function TicketPage({ params, searchParams }: TicketPageProps) {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const user = session.user;

  const { number: raw } = await params;
  const { from } = await searchParams;
  const number = parseTicketId(raw);
  if (!number) notFound();

  const ticket = await prisma.ticket.findUnique({
    where: { number },
    select: {
      number: true,
      subject: true,
      description: true,
      fields: true,
      priority: true,
      status: true,
      channel: true,
      confidential: true,
      dueAt: true,
      createdAt: true,
      csat: true,
      ratingFollowedUpAt: true,
      requesterId: true,
      requesterDepartmentId: true,
      assigneeId: true,
      requester: { select: { id: true, name: true } },
      requesterDepartment: { select: { name: true } },
      assignee: { select: { id: true, name: true } },
      serviceType: { select: { name: true, fields: true } },
      legs: {
        select: {
          id: true,
          departmentId: true,
          department: { select: { name: true, hue: true } },
          by: { select: { name: true } },
          reason: true,
          inAt: true,
          outAt: true,
        },
        orderBy: { inAt: 'asc' },
      },
      events: {
        select: {
          id: true,
          type: true,
          by: { select: { name: true } },
          body: true,
          meta: true,
          createdAt: true,
          attachments: { select: { id: true, filename: true, mimeType: true, sizeBytes: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      mentions: { select: { type: true, userId: true, departmentId: true } },
      escalations: {
        where: { acknowledgedAt: null },
        select: { level: true },
        orderBy: { level: 'desc' },
        take: 1,
      },
    },
  });
  if (!ticket) notFound();

  const permissionTicket: PermissionTicket = {
    id: String(ticket.number),
    requesterId: ticket.requesterId,
    requesterDepartmentId: ticket.requesterDepartmentId,
    assigneeId: ticket.assigneeId,
    confidential: ticket.confidential,
    status: ticket.status,
    legs: ticket.legs.map((leg) => ({ departmentId: leg.departmentId, outAt: leg.outAt })),
    mentions: ticket.mentions.map((mention) => ({
      type: mention.type === 'PERSON' ? ('person' as const) : ('department' as const),
      id: (mention.type === 'PERSON' ? mention.userId : mention.departmentId) ?? '',
    })),
  };

  // D-05: canView is the single gate — a ticket this user can't see 404s rather than
  // 403s, so existence is never leaked to someone outside its visibility rules.
  if (!can('view', user, permissionTicket)) notFound();

  const permissions: TicketPermissions = {
    reply: can('reply', user, permissionTicket),
    addNote: can('addNote', user, permissionTicket),
    readNotes: can('readNotes', user, permissionTicket),
    assign: can('assign', user, permissionTicket),
    pickUp: can('pickUp', user, permissionTicket),
    setPriority: can('setPriority', user, permissionTicket),
    setStatus: can('setStatus', user, permissionTicket),
    forward: can('forward', user, permissionTicket),
    resolve: can('resolve', user, permissionTicket),
    reopen: can('reopen', user, permissionTicket),
    rate: can('rate', user, permissionTicket),
    markRatingFollowedUp: can('markRatingFollowedUp', user, permissionTicket),
    escalate: can('escalate', user, permissionTicket),
    manageTasks: can('manageTasks', user, permissionTicket),
    logTime: can('logTime', user, permissionTicket),
    link: can('link', user, permissionTicket),
  };

  const currentDeptId = currentDepartmentId(permissionTicket);
  const now = new Date();

  const [members, departments, cannedReplies, tasks, timeEntries, myRunningTimer, links, blocked] =
    await Promise.all([
      prisma.user.findMany({
        where: { departmentId: currentDeptId, active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.department.findMany({
        select: { id: true, name: true, hue: true, confidentialByDefault: true },
        orderBy: { name: 'asc' },
      }),
      prisma.cannedReply.findMany({
        where: { OR: [{ departmentId: currentDeptId }, { departmentId: null }] },
        select: { id: true, title: true, body: true },
        orderBy: { title: 'asc' },
      }),
      listTasks(number),
      listTimeEntries(number),
      runningTimer({ ticketNumber: number, userId: user.id }),
      listLinks(number),
      isBlocked(number),
    ]);

  // Split view (≥1180px, the "wide" breakpoint): opening a ticket from the Inbox
  // keeps a compact list of its department's open tickets alongside it.
  const splitListRows =
    from === 'inbox'
      ? await prisma.ticket.findMany({
          where: {
            AND: [
              visibleTicketsWhere(user),
              { legs: { some: { departmentId: currentDeptId, outAt: null } } },
              { status: { in: [...OPEN_STATUSES] } },
            ],
          },
          select: { number: true, subject: true, priority: true, status: true },
          orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }],
          take: 50,
        })
      : null;

  // D-07/PERMISSIONS.md: a note never reaches the requester — filtered out here,
  // server-side, rather than just hidden in the UI.
  const visibleEvents = permissions.readNotes
    ? ticket.events
    : ticket.events.filter((e) => e.type !== 'NOTE');

  const events: ConversationEvent[] = visibleEvents.map((event) => ({
    id: event.id,
    type: event.type,
    byName: event.by?.name ?? null,
    body: event.body,
    meta: (event.meta as Record<string, unknown> | null) ?? null,
    createdAt: event.createdAt.toISOString(),
    attachments: event.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    })),
  }));

  const legs: JourneyLeg[] = ticket.legs.map((leg) => ({
    id: leg.id,
    departmentId: leg.departmentId,
    departmentName: leg.department.name,
    hue: leg.department.hue,
    byName: leg.by.name,
    reason: leg.reason,
    inAt: leg.inAt.toISOString(),
    outAt: leg.outAt ? leg.outAt.toISOString() : null,
  }));

  const deadline = formatDeadline(ticket.dueAt, ticket.createdAt, now);
  const totalMs = ticket.dueAt.getTime() - ticket.createdAt.getTime();
  const elapsedMs = now.getTime() - ticket.createdAt.getTime();
  const deadlinePercentElapsed =
    totalMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)) : 100;
  const locked = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';

  const detail: TicketDetail = {
    number: ticket.number,
    subject: ticket.subject,
    description: ticket.description,
    fields: ticket.fields as Record<string, unknown>,
    priority: ticket.priority,
    status: ticket.status,
    channel: ticket.channel,
    confidential: ticket.confidential,
    csat: ticket.csat,
    ratingFollowedUpAt: ticket.ratingFollowedUpAt ? ticket.ratingFollowedUpAt.toISOString() : null,
    createdAt: ticket.createdAt.toISOString(),
    dueAt: ticket.dueAt.toISOString(),
    deadlinePercentElapsed,
    requester: {
      id: ticket.requester.id,
      name: ticket.requester.name,
      departmentName: ticket.requesterDepartment.name,
    },
    assignee: ticket.assignee,
    serviceType: {
      name: ticket.serviceType.name,
      fields: ticket.serviceType.fields as unknown as TicketFieldDef[],
    },
    currentDepartmentId: currentDeptId,
    legs,
    deadline,
    locked,
    openEscalationLevel: ticket.escalations[0]?.level ?? null,
    blocked,
  };

  return (
    <div className="flex flex-col gap-5 wide:flex-row wide:items-start">
      <TicketPoller />
      {splitListRows ? <SplitList rows={splitListRows} activeNumber={detail.number} /> : null}

      <div className="flex min-w-0 flex-1 flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <TicketHeader ticket={detail} />

          {detail.status === 'RESOLVED' || detail.status === 'CLOSED' ? (
            <>
              <RatingBanner
                ticketNumber={detail.number}
                csat={detail.csat}
                canRate={permissions.rate}
                canReopen={permissions.reopen}
              />
              <LowRatingFollowUpBanner
                ticketNumber={detail.number}
                csat={detail.csat}
                ratingFollowedUpAt={detail.ratingFollowedUpAt}
                canMarkFollowedUp={permissions.markRatingFollowedUp}
              />
            </>
          ) : null}

          <div className="max-w-[820px]">
            <Conversation ticketNumber={detail.number} events={events} />
          </div>

          {!detail.locked ? (
            <div className="max-w-[820px]">
              <Composer
                ticketNumber={detail.number}
                requesterName={detail.requester.name}
                canReply={permissions.reply}
                canAddNote={permissions.addNote}
                cannedReplies={cannedReplies}
                signature={user.signature}
              />
            </div>
          ) : null}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[300px]">
          <div className="rounded-card border border-line bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-label font-mono uppercase tracking-wide text-faint">
                <Sparkles size={13} />
                AI assist
              </h2>
            </div>
            <p className="text-small text-muted">
              Coming in Phase 9. Check before using once live.
            </p>
          </div>

          <ActionsPanel
            ticket={detail}
            permissions={permissions}
            members={members}
            departments={departments}
          />

          <TasksPanel
            ticketNumber={detail.number}
            tasks={tasks.map((task) => ({ id: task.id, text: task.text, done: task.done }))}
            canManage={permissions.manageTasks}
          />

          <TimePanel
            ticketNumber={detail.number}
            entries={timeEntries.map((entry) => ({
              id: entry.id,
              userName: entry.user.name,
              minutes: entry.minutes,
              createdAt: entry.createdAt.toISOString(),
            }))}
            runningTimerStartedAt={myRunningTimer ? myRunningTimer.startedAt.toISOString() : null}
            canLog={permissions.logTime}
          />

          <LinkedTicketsPanel
            ticketNumber={detail.number}
            links={links}
            canLink={permissions.link}
          />
        </aside>
      </div>
    </div>
  );
}
