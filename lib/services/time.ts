// Ticket detail aside "Time logged" (BUILD_PLAN.md Phase 6): a start/stop timer per
// person per ticket, plus quick +15m/+30m/+1h buttons that log an entry directly.
// A TicketTimer row's mere existence IS the running state (README's "start/stop
// timer"), so it survives a reload or the Phase 5 20s poll (D-10) without any
// client-side clock to lose.

import { prisma } from '@/lib/db';

export class TimerAlreadyRunningError extends Error {
  constructor() {
    super('A timer is already running on this ticket for you.');
  }
}

export class NoRunningTimerError extends Error {
  constructor() {
    super('No timer is running on this ticket for you.');
  }
}

export async function listTimeEntries(ticketNumber: number) {
  return prisma.timeEntry.findMany({
    where: { ticketId: ticketNumber },
    orderBy: { createdAt: 'desc' },
    select: { id: true, minutes: true, createdAt: true, user: { select: { name: true } } },
  });
}

export async function runningTimer(params: { ticketNumber: number; userId: string }) {
  return prisma.ticketTimer.findUnique({
    where: { ticketId_userId: { ticketId: params.ticketNumber, userId: params.userId } },
  });
}

export async function startTimer(params: { ticketNumber: number; userId: string }): Promise<void> {
  try {
    await prisma.ticketTimer.create({
      data: { ticketId: params.ticketNumber, userId: params.userId },
    });
  } catch {
    // Unique (ticketId, userId) violation: already running.
    throw new TimerAlreadyRunningError();
  }
}

/** Minimum logged on "stop" so a near-instant click doesn't write a 0-minute entry. */
const MIN_STOP_MINUTES = 1;

export async function stopTimer(params: {
  ticketNumber: number;
  userId: string;
}): Promise<{ minutes: number }> {
  return prisma.$transaction(async (tx) => {
    const timer = await tx.ticketTimer.findUnique({
      where: { ticketId_userId: { ticketId: params.ticketNumber, userId: params.userId } },
    });
    if (!timer) throw new NoRunningTimerError();

    const minutes = Math.max(
      MIN_STOP_MINUTES,
      Math.round((Date.now() - timer.startedAt.getTime()) / 60_000),
    );

    await tx.ticketTimer.delete({ where: { id: timer.id } });
    await tx.timeEntry.create({
      data: { ticketId: params.ticketNumber, userId: params.userId, minutes },
    });
    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: 'TIME',
        byUserId: params.userId,
        meta: { minutes, via: 'timer' },
      },
    });

    return { minutes };
  });
}

export async function logQuickTime(params: {
  ticketNumber: number;
  userId: string;
  minutes: number;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.timeEntry.create({
      data: { ticketId: params.ticketNumber, userId: params.userId, minutes: params.minutes },
    });
    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: 'TIME',
        byUserId: params.userId,
        meta: { minutes: params.minutes, via: 'quick' },
      },
    });
  });
}
