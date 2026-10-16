// Every minute (vercel.json): notifies the assignee and department head once a ticket
// crosses the 75% warning threshold, and once more if the first-response deadline
// passes with no public reply. Idempotent via Notification's (userId, ticketId, kind)
// unique constraint — notify() silently no-ops on a repeat.

import { NextResponse, type NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/cron';
import { prisma } from '@/lib/db';
import { slaState } from '@/lib/sla';
import { getSlaSettings } from '@/lib/settings';
import { notify } from '@/lib/services/notifications';
import { sendNotificationEmail } from '@/lib/email';

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'AWAITING_REQUESTER'] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const now = new Date();
  const slaSettings = await getSlaSettings();

  const tickets = await prisma.ticket.findMany({
    where: { status: { in: [...OPEN_STATUSES] } },
    select: {
      number: true,
      subject: true,
      createdAt: true,
      dueAt: true,
      pausedAt: true,
      firstResponseAt: true,
      firstResponseDueAt: true,
      assigneeId: true,
      assignee: { select: { email: true } },
      legs: {
        where: { outAt: null },
        select: { department: { select: { head: { select: { id: true, email: true } } } } },
      },
    },
  });

  let warningCount = 0;
  let firstResponseMissCount = 0;

  for (const ticket of tickets) {
    const head = ticket.legs[0]?.department.head ?? null;
    const recipients = new Map<string, string>(); // userId -> email
    if (ticket.assigneeId && ticket.assignee)
      recipients.set(ticket.assigneeId, ticket.assignee.email);
    if (head) recipients.set(head.id, head.email);

    const state = slaState({
      now,
      createdAt: ticket.createdAt,
      dueAt: ticket.dueAt,
      pausedAt: ticket.pausedAt,
      warningPercent: slaSettings.warningPercent,
    });

    if (state === 'WARNING') {
      for (const [userId, email] of recipients) {
        const isNew = await notify({ userId, ticketId: ticket.number, kind: 'SLA_WARNING' });
        if (isNew) {
          await sendNotificationEmail({
            to: email,
            kind: 'SLA_WARNING',
            ticketNumber: ticket.number,
            ticketSubject: ticket.subject,
          });
        }
      }
      warningCount++;
    }

    if (!ticket.firstResponseAt && now.getTime() >= ticket.firstResponseDueAt.getTime()) {
      for (const [userId, email] of recipients) {
        const isNew = await notify({
          userId,
          ticketId: ticket.number,
          kind: 'FIRST_RESPONSE_MISS',
        });
        if (isNew) {
          await sendNotificationEmail({
            to: email,
            kind: 'FIRST_RESPONSE_MISS',
            ticketNumber: ticket.number,
            ticketSubject: ticket.subject,
          });
        }
      }
      firstResponseMissCount++;
    }
  }

  return NextResponse.json({
    ok: true,
    checked: tickets.length,
    warningCount,
    firstResponseMissCount,
  });
}
