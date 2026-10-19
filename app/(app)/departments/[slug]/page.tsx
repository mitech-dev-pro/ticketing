import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { visibleTicketsWhere } from '@/lib/permissions';
import { getSlaSettings } from '@/lib/settings';
import { formatTicketId } from '@/lib/ids';
import { Badge } from '@/components/ui/badge';
import { NewTicketDialog } from '@/components/new-ticket/new-ticket-dialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { NewTicketData, NewTicketField } from '@/components/new-ticket/types';

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'AWAITING_REQUESTER'] as const;

interface DepartmentPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: DepartmentPageProps): Promise<Metadata> {
  const { slug } = await params;
  const department = await prisma.department.findUnique({
    where: { slug },
    select: { name: true },
  });
  return {
    title: department
      ? `${department.name} — miLife Service Desk`
      : 'Department — miLife Service Desk',
  };
}

export default async function DepartmentPage({ params }: DepartmentPageProps) {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const user = session.user;
  const { slug } = await params;

  const department = await prisma.department.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      hue: true,
      emailAlias: true,
      head: { select: { name: true, ext: true } },
      serviceTypes: {
        select: {
          id: true,
          name: true,
          description: true,
          defaultPriority: true,
          needsApproval: true,
          fields: true,
        },
        orderBy: { name: 'asc' },
      },
      members: {
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      },
    },
  });
  if (!department) notFound();

  const now = new Date();
  const memberIds = department.members.map((m) => m.id);

  const [
    slaSettings,
    openNow,
    resolvedTickets,
    awayRows,
    newTicketDepartments,
    newTicketServiceTypes,
    yourRequests,
  ] = await Promise.all([
    getSlaSettings(),
    prisma.ticket.count({
      where: {
        AND: [
          visibleTicketsWhere(user),
          { legs: { some: { departmentId: department.id, outAt: null } } },
          { status: { in: [...OPEN_STATUSES] } },
        ],
      },
    }),
    prisma.ticket.findMany({
      where: {
        AND: [visibleTicketsWhere(user), { legs: { some: { departmentId: department.id } } }],
        status: { in: ['RESOLVED', 'CLOSED'] },
        resolvedAt: { not: null },
      },
      select: { dueAt: true, resolvedAt: true },
    }),
    prisma.outOfOffice.findMany({
      where: { userId: { in: memberIds }, until: { gt: now } },
      select: { userId: true },
    }),
    prisma.department.findMany({
      select: { id: true, slug: true, name: true, confidentialByDefault: true },
      orderBy: { name: 'asc' },
    }),
    prisma.serviceType.findMany({
      select: {
        id: true,
        departmentId: true,
        name: true,
        description: true,
        defaultPriority: true,
        fields: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.ticket.findMany({
      where: {
        requesterId: user.id,
        legs: { some: { departmentId: department.id, outAt: null } },
      },
      select: { number: true, subject: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const metDeadlines = resolvedTickets.filter((t) => t.resolvedAt! <= t.dueAt).length;
  const deadlinesMetPercent =
    resolvedTickets.length === 0 ? null : Math.round((metDeadlines / resolvedTickets.length) * 100);
  const awayUserIds = new Set(awayRows.map((r) => r.userId));

  const newTicketData: NewTicketData = {
    departments: newTicketDepartments,
    serviceTypes: newTicketServiceTypes.map((st) => ({
      ...st,
      fields: st.fields as unknown as NewTicketField[],
    })),
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="h-1.5" style={{ background: `oklch(0.6 0.11 ${department.hue})` }} />
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div>
            <h1 className="text-title font-bold text-ink">{department.name}</h1>
            <p className="mt-1 text-small text-muted">
              {department.head?.name ?? 'No head assigned'}
              {department.head?.ext ? ` · ext. ${department.head.ext}` : ''} ·{' '}
              {department.emailAlias}
            </p>
          </div>
          <NewTicketDialog
            data={newTicketData}
            initialDepartmentId={department.id}
            trigger={
              <Button type="button" className="gap-2">
                <Plus size={16} />
                New request to {department.name}
              </Button>
            }
          />
        </div>

        <div className="grid grid-cols-3 gap-4 border-t border-line px-5 py-4">
          <div>
            <div className="text-title font-bold text-ink">{openNow}</div>
            <div className="text-small text-muted">Open now</div>
          </div>
          <div>
            <div className="text-title font-bold text-ink">
              {deadlinesMetPercent === null ? '—' : `${deadlinesMetPercent}%`}
            </div>
            <div className="text-small text-muted">Deadlines met</div>
          </div>
          <div>
            <div className="text-title font-bold text-ink">{department.serviceTypes.length}</div>
            <div className="text-small text-muted">Services</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <h2 className="text-small font-semibold text-ink">Services</h2>
          <div className="flex flex-col gap-3">
            {department.serviceTypes.map((service) => {
              const target = slaSettings.targets[service.defaultPriority];
              const fieldCount = Array.isArray(service.fields) ? service.fields.length : 0;
              return (
                <div
                  key={service.id}
                  className="border-b border-line-2 pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{service.name}</span>
                    {service.needsApproval ? (
                      <Badge className="bg-line text-muted">Needs approval</Badge>
                    ) : null}
                  </div>
                  <p className="text-small text-muted">{service.description}</p>
                  <p className="text-label text-faint">
                    Target: {Math.round(target.resolveMinutes / 60)}h · {fieldCount} field
                    {fieldCount === 1 ? '' : 's'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <h2 className="text-small font-semibold text-ink">Team</h2>
          <div className="flex flex-col gap-1.5">
            {department.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between text-small">
                <span className="text-ink-2">{member.name}</span>
                {awayUserIds.has(member.id) ? (
                  <Badge className="bg-line text-muted">Away</Badge>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 lg:col-span-2">
          <h2 className="text-small font-semibold text-ink">Your requests to {department.name}</h2>
          {yourRequests.length === 0 ? (
            <p className="text-small text-muted">You haven&apos;t sent anything here yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {yourRequests.map((ticket) => (
                <Link
                  key={ticket.number}
                  href={`/tickets/${ticket.number}`}
                  className="rounded-control px-1 py-1 text-small hover:bg-hover"
                >
                  <span className="font-mono text-label text-muted">
                    {formatTicketId(ticket.number)}
                  </span>{' '}
                  <span className="text-ink-2">{ticket.subject}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
