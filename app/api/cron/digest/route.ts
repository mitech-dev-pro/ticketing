// Scheduled once a day at digest.sendAtLocalTime, Africa/Accra (vercel.json — Ghana
// has no DST, so that's a fixed UTC cron time, no timezone maths needed here). Mails
// every user with unread notifications their current list; doesn't mark anything
// read — that stays a dropdown action (lib/services/notifications.ts markAllNotificationsRead).

import { NextResponse, type NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/cron';
import { prisma } from '@/lib/db';
import { sendDailyDigestEmail, type DigestItem } from '@/lib/email';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const unread = await prisma.notification.findMany({
    where: { readAt: null },
    select: {
      kind: true,
      ticketId: true,
      user: { select: { email: true } },
      ticket: { select: { subject: true } },
    },
  });

  const byEmail = new Map<string, DigestItem[]>();
  for (const notification of unread) {
    const items = byEmail.get(notification.user.email) ?? [];
    items.push({
      kind: notification.kind,
      ticketNumber: notification.ticketId,
      ticketSubject: notification.ticket.subject,
    });
    byEmail.set(notification.user.email, items);
  }

  for (const [email, items] of byEmail) {
    await sendDailyDigestEmail(email, items);
  }

  return NextResponse.json({ ok: true, recipients: byEmail.size });
}
