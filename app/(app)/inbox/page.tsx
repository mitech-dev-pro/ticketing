import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { can, visibleTicketsWhere, type PermissionTicket } from '@/lib/permissions';
import { formatDeadline } from '@/lib/dates';
import { InboxTable } from '@/components/inbox/inbox-table';
import { InboxTabs } from '@/components/inbox/inbox-tabs';
import { DepartmentFilter } from '@/components/inbox/department-filter';
import { SavedViews, type SavedViewItem } from '@/components/inbox/saved-views';
import { ViewModeSwitch, type InboxViewMode } from '@/components/inbox/view-mode-switch';
import { BoardView } from '@/components/inbox/board-view';
import { CalendarView } from '@/components/inbox/calendar-view';
import { INBOX_TABS, type InboxRow, type InboxTab } from '@/components/inbox/types';
import type { Prisma, Priority } from '@/generated/prisma/client';

export const metadata: Metadata = {
  title: 'Inbox — miLife Service Desk',
};

const PRIORITIES: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'AWAITING_REQUESTER'] as const;
const CLOSED_STATUSES = ['RESOLVED', 'CLOSED'] as const;
const DUE_HOURS_PATTERN = /^(\d+)h$/;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function tabWhere(tab: InboxTab, userId: string): Prisma.TicketWhereInput {
  switch (tab) {
    case 'unassigned':
      return { assigneeId: null, status: { in: [...OPEN_STATUSES] } };
    case 'assigned-to-me':
      return { assigneeId: userId };
    case 'resolved':
      return { status: { in: [...CLOSED_STATUSES] } };
    case 'all-open':
    default:
      return { status: { in: [...OPEN_STATUSES] } };
  }
}

interface InboxPageProps {
  searchParams: Promise<{
    tab?: string;
    priority?: string;
    due?: string;
    department?: string;
    view?: string;
    month?: string;
  }>;
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const user = session.user;
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
        select: { id: true, name: true },
      });

  const activeTab = INBOX_TABS.some((t) => t.id === params.tab)
    ? (params.tab as InboxTab)
    : 'all-open';
  const priorityFilter = PRIORITIES.includes(params.priority as Priority)
    ? (params.priority as Priority)
    : undefined;
  const dueHoursMatch = params.due ? DUE_HOURS_PATTERN.exec(params.due) : null;
  const dueHours = dueHoursMatch ? Number(dueHoursMatch[1]) : null;
  const viewMode: InboxViewMode =
    params.view === 'board' || params.view === 'calendar' ? params.view : 'list';
  const now = new Date();

  const baseWhere: Prisma.TicketWhereInput = {
    AND: [
      visibleTicketsWhere(user),
      { legs: { some: { departmentId: targetDepartmentId, outAt: null } } },
    ],
  };

  const filters: Prisma.TicketWhereInput[] = [];
  if (priorityFilter) filters.push({ priority: priorityFilter });
  if (dueHours !== null) {
    filters.push({
      dueAt: { lte: new Date(now.getTime() + dueHours * 60 * 60 * 1000) },
      status: { in: [...OPEN_STATUSES] },
    });
  }

  // Board/Calendar show the department's whole open picture (tabs are a List-only
  // concept), with the Resolved bucket capped to the last 7 days per the design.
  const ticketsWhere: Prisma.TicketWhereInput =
    viewMode === 'list'
      ? { AND: [baseWhere, tabWhere(activeTab, user.id), ...filters] }
      : {
          AND: [
            baseWhere,
            ...filters,
            {
              OR: [
                { status: { in: [...OPEN_STATUSES] } },
                {
                  status: { in: [...CLOSED_STATUSES] },
                  resolvedAt: { gte: new Date(now.getTime() - SEVEN_DAYS_MS) },
                },
              ],
            },
          ],
        };

  const [tickets, tabCounts, members, savedViewRows] = await Promise.all([
    prisma.ticket.findMany({
      where: ticketsWhere,
      select: {
        number: true,
        subject: true,
        confidential: true,
        priority: true,
        status: true,
        dueAt: true,
        createdAt: true,
        requesterId: true,
        requesterDepartmentId: true,
        assigneeId: true,
        requester: { select: { name: true } },
        requesterDepartment: { select: { name: true } },
        assignee: { select: { name: true } },
        legs: { select: { departmentId: true, outAt: true } },
        mentions: { select: { type: true, userId: true, departmentId: true } },
      },
      orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }],
    }),
    Promise.all(
      INBOX_TABS.map(async (tab) => ({
        id: tab.id,
        count: await prisma.ticket.count({
          where: { AND: [baseWhere, tabWhere(tab.id, user.id)] },
        }),
      })),
    ),
    prisma.user.findMany({
      where: { departmentId: targetDepartmentId, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.savedView.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, filters: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const savedViews: SavedViewItem[] = savedViewRows.map((view) => ({
    id: view.id,
    name: view.name,
    filters: view.filters as unknown as SavedViewItem['filters'],
  }));

  const canManageDept = isAdmin || user.departmentId === targetDepartmentId;
  const canBulkActions =
    isAdmin || (user.role === 'HEAD' && user.departmentId === targetDepartmentId);

  const rows: InboxRow[] = tickets.map((ticket) => {
    const permissionTicket: PermissionTicket = {
      id: String(ticket.number),
      requesterId: ticket.requesterId,
      requesterDepartmentId: ticket.requesterDepartmentId,
      assigneeId: ticket.assigneeId,
      confidential: ticket.confidential,
      status: ticket.status,
      legs: ticket.legs,
      mentions: ticket.mentions.map((mention) => ({
        type: mention.type === 'PERSON' ? ('person' as const) : ('department' as const),
        id: (mention.type === 'PERSON' ? mention.userId : mention.departmentId) ?? '',
      })),
    };
    const deadline = formatDeadline(ticket.dueAt, ticket.createdAt, now);
    const locked = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';

    return {
      number: ticket.number,
      subject: ticket.subject,
      requesterName: ticket.requester.name,
      requesterDepartmentName: ticket.requesterDepartment.name,
      confidential: ticket.confidential,
      priority: ticket.priority,
      status: ticket.status,
      dueAt: ticket.dueAt.toISOString(),
      deadlineLabel: deadline.label,
      deadlineAbsolute: deadline.absolute,
      deadlineTone: deadline.tone,
      assigneeId: ticket.assigneeId,
      assigneeName: ticket.assignee?.name ?? null,
      locked,
      canPickUp: can('pickUp', user, permissionTicket),
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-title font-bold text-ink">
            {targetDepartment ? `${targetDepartment.name} inbox` : 'Inbox'}
          </h1>
          <p className="mt-1 text-small text-muted">
            {isAdmin
              ? 'Everything sent to this department.'
              : user.role === 'HEAD'
                ? "Everything sent to your department. You see the whole team's work."
                : 'Tickets sent to your department.'}
          </p>
        </div>
        {isAdmin && departments.length > 0 ? (
          <DepartmentFilter departments={departments} value={targetDepartmentId} />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <InboxTabs
          activeTab={activeTab}
          counts={tabCounts}
          priority={priorityFilter}
          dueHours={dueHours}
        />
        <ViewModeSwitch active={viewMode} />
      </div>

      {viewMode === 'list' ? (
        <SavedViews
          views={savedViews}
          currentTab={activeTab}
          currentPriority={priorityFilter}
          currentDueHours={dueHours}
        />
      ) : null}

      {viewMode === 'list' ? (
        <InboxTable
          rows={rows}
          members={members}
          canManageDept={canManageDept}
          canBulkActions={canBulkActions}
        />
      ) : viewMode === 'board' ? (
        <BoardView rows={rows} canManageDept={canManageDept} />
      ) : (
        <CalendarView rows={rows} monthParam={params.month} />
      )}
    </div>
  );
}
