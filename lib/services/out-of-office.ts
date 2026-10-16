// Out-of-office reassignment (BUILD_PLAN.md Phase 4; the Profile & settings toggle to
// create these rows is Phase 7 — this file only needs to exist for app/api/cron/out-of-office
// to use). reassignOpenTickets() is naturally idempotent: it only matches tickets still
// assigned to the departing user, so a doubled or missed cron run does no harm.

import { prisma } from '@/lib/db';

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'AWAITING_REQUESTER'] as const;

export async function setOutOfOffice(params: {
  userId: string;
  delegateUserId: string;
  until: Date;
}): Promise<void> {
  await prisma.outOfOffice.create({
    data: { userId: params.userId, delegateUserId: params.delegateUserId, until: params.until },
  });
}

export interface ReassignmentResult {
  ticketNumber: number;
  fromUserId: string;
  toUserId: string;
}

/** For every out-of-office window active right now, reassigns the departing user's
 * still-open tickets to their delegate. Called by the cron route, once a minute. */
export async function reassignOpenTickets(now: Date = new Date()): Promise<ReassignmentResult[]> {
  const activeWindows = await prisma.outOfOffice.findMany({
    where: { until: { gt: now } },
    select: { userId: true, delegateUserId: true },
  });

  const results: ReassignmentResult[] = [];

  for (const window of activeWindows) {
    const tickets = await prisma.ticket.findMany({
      where: { assigneeId: window.userId, status: { in: [...OPEN_STATUSES] } },
      select: { number: true },
    });

    for (const ticket of tickets) {
      await prisma.$transaction(async (tx) => {
        const result = await tx.ticket.updateMany({
          where: { number: ticket.number, assigneeId: window.userId },
          data: { assigneeId: window.delegateUserId },
        });
        if (result.count === 0) return; // already reassigned by a concurrent run

        await tx.ticketEvent.create({
          data: {
            ticketId: ticket.number,
            type: 'ASSIGNED',
            byUserId: null,
            meta: { assigneeId: window.delegateUserId, via: 'ooo' },
          },
        });
      });
      results.push({
        ticketNumber: ticket.number,
        fromUserId: window.userId,
        toUserId: window.delegateUserId,
      });
    }
  }

  return results;
}
