import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { visibleTicketsWhere } from '@/lib/permissions';

export const metadata: Metadata = {
  title: 'Departments & services — miLife Service Desk',
};

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'AWAITING_REQUESTER'] as const;

export default async function DepartmentsPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  const user = session.user;

  const departments = await prisma.department.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      hue: true,
      head: { select: { name: true } },
      serviceTypes: { select: { id: true } },
      members: { where: { active: true }, select: { id: true } },
    },
    orderBy: { name: 'asc' },
  });

  const openCounts = await Promise.all(
    departments.map((dept) =>
      prisma.ticket.count({
        where: {
          AND: [
            visibleTicketsWhere(user),
            { legs: { some: { departmentId: dept.id, outAt: null } } },
            { status: { in: [...OPEN_STATUSES] } },
          ],
        },
      }),
    ),
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-title font-bold text-ink">Departments &amp; services</h1>
        <p className="mt-1 text-small text-muted">Every team, their head and what they handle.</p>
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
      >
        {departments.map((dept, index) => (
          <Link
            key={dept.id}
            href={`/departments/${dept.slug}`}
            className="overflow-hidden rounded-card border border-line bg-surface transition-colors hover:bg-hover"
          >
            <div className="h-1" style={{ background: `oklch(0.6 0.11 ${dept.hue})` }} />
            <div className="flex flex-col gap-2 p-4">
              <span className="font-medium text-ink">{dept.name}</span>
              <span className="text-small text-muted">{dept.head?.name ?? 'No head assigned'}</span>
              <div className="mt-1 flex items-center gap-3 text-label text-faint">
                <span>{dept.serviceTypes.length} services</span>
                <span>{dept.members.length} team</span>
                <span>{openCounts[index]} open</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
