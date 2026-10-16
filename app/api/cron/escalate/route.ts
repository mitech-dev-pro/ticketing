// Every minute (vercel.json): level-1 escalation on breach, level-2 after a further
// window (D-04). Reuses lib/services/escalations.ts's escalate(), the same function
// a human's manual escalation calls — Escalation.(ticketId, level) being unique is
// what actually stops this cron and a person from ever double-escalating.

import { NextResponse, type NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/cron';
import { prisma } from '@/lib/db';
import { computeDueAt } from '@/lib/sla';
import {
  getEscalationSettings,
  getSlaSettings,
  getHolidays,
  calendarForPriority,
} from '@/lib/settings';
import { escalate, AlreadyEscalatedError } from '@/lib/services/escalations';
import { notify } from '@/lib/services/notifications';
import { sendNotificationEmail } from '@/lib/email';

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'AWAITING_REQUESTER'] as const;

async function notifyAndEmail(params: {
  userId: string;
  email: string;
  ticketNumber: number;
  ticketSubject: string;
  kind: 'ESCALATED_L1' | 'ESCALATED_L2';
}): Promise<void> {
  const isNew = await notify({
    userId: params.userId,
    ticketId: params.ticketNumber,
    kind: params.kind,
  });
  if (isNew) {
    await sendNotificationEmail({
      to: params.email,
      kind: params.kind,
      ticketNumber: params.ticketNumber,
      ticketSubject: params.ticketSubject,
    });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const now = new Date();
  const [slaSettings, escalationSettings, holidays] = await Promise.all([
    getSlaSettings(),
    getEscalationSettings(),
    getHolidays(),
  ]);

  let level1Count = 0;
  let level2Count = 0;

  // ---- Level 1: breached, not yet escalated ----
  const breached = await prisma.ticket.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      dueAt: { lte: now },
      escalations: { none: { level: 1 } },
    },
    select: {
      number: true,
      subject: true,
      legs: {
        where: { outAt: null },
        select: { department: { select: { head: { select: { id: true, email: true } } } } },
      },
    },
  });

  for (const ticket of breached) {
    try {
      await escalate({ ticketNumber: ticket.number, level: 1, byUserId: null, reason: null });
    } catch (error) {
      if (!(error instanceof AlreadyEscalatedError)) throw error;
      continue; // a manual escalation won the race since the query ran
    }
    level1Count++;

    const head = ticket.legs[0]?.department.head;
    if (head) {
      await notifyAndEmail({
        userId: head.id,
        email: head.email,
        ticketNumber: ticket.number,
        ticketSubject: ticket.subject,
        kind: 'ESCALATED_L1',
      });
    }
  }

  // ---- Level 2: level-1 escalated, still open, past the further window ----
  const level1Escalated = await prisma.ticket.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      AND: [{ escalations: { some: { level: 1 } } }, { escalations: { none: { level: 2 } } }],
    },
    select: {
      number: true,
      subject: true,
      priority: true,
      escalations: { where: { level: 1 }, select: { at: true } },
    },
  });

  const admins = await prisma.user.findMany({
    where:
      escalationSettings.level2UserIds.length > 0
        ? { id: { in: escalationSettings.level2UserIds } }
        : { role: 'ADMIN', active: true },
    select: { id: true, email: true },
  });

  for (const ticket of level1Escalated) {
    const level1At = ticket.escalations[0]?.at;
    if (!level1At) continue;

    const target = slaSettings.targets[ticket.priority];
    const calendar = calendarForPriority(ticket.priority, slaSettings, holidays);
    const windowMinutes =
      escalationSettings.level2AfterMinutes === 'RESOLVE_TARGET'
        ? target.resolveMinutes
        : escalationSettings.level2AfterMinutes;
    const level2At = computeDueAt({ createdAt: level1At, resolveMinutes: windowMinutes, calendar });

    if (now.getTime() < level2At.getTime()) continue;

    try {
      await escalate({ ticketNumber: ticket.number, level: 2, byUserId: null, reason: null });
    } catch (error) {
      if (!(error instanceof AlreadyEscalatedError)) throw error;
      continue;
    }
    level2Count++;

    for (const admin of admins) {
      await notifyAndEmail({
        userId: admin.id,
        email: admin.email,
        ticketNumber: ticket.number,
        ticketSubject: ticket.subject,
        kind: 'ESCALATED_L2',
      });
    }
  }

  return NextResponse.json({ ok: true, level1Count, level2Count });
}
