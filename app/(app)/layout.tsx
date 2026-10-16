import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/app-shell/app-shell';
import { NewTicketTrigger } from '@/components/new-ticket/new-ticket-trigger';
import type { NotificationItem } from '@/components/app-shell/notification-types';

const NOTIFICATION_LIMIT = 20;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect('/sign-in');
  }

  const [notificationRows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        kind: true,
        readAt: true,
        createdAt: true,
        ticket: { select: { number: true, subject: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: NOTIFICATION_LIMIT,
    }),
    prisma.notification.count({ where: { userId: session.user.id, readAt: null } }),
  ]);

  const notifications: NotificationItem[] = notificationRows.map((row) => ({
    id: row.id,
    kind: row.kind,
    ticketNumber: row.ticket.number,
    ticketSubject: row.ticket.subject,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <AppShell
      user={{ name: session.user.name, role: session.user.role }}
      notifications={notifications}
      unreadCount={unreadCount}
      newTicketTrigger={<NewTicketTrigger />}
    >
      {children}
    </AppShell>
  );
}
