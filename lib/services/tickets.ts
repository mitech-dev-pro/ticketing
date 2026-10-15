// Ticket lifecycle (BUILD_PLAN.md Phase 2). Callers (Server Actions) are responsible
// for the session + lib/permissions.ts check before calling these — this file assumes
// the action is already authorized and focuses on the write itself: one
// prisma.$transaction per call, always ending with the matching TicketEvent
// (CLAUDE.md: "Every ticket change writes its TicketEvent in the same transaction").

import { prisma } from '@/lib/db';
import { computeDueAt, computeFirstResponseDueAt } from '@/lib/sla';
import { getSlaSettings, getHolidays, calendarForPriority } from '@/lib/settings';
import type { Channel, Priority, TicketStatus } from '@/generated/prisma/client';
import { Prisma } from '@/generated/prisma/client';

export class InvalidAssigneeError extends Error {
  constructor(assigneeId: string) {
    super(`${assigneeId} is not a member of this ticket's current department.`);
  }
}

export class TicketAlreadyAssignedError extends Error {
  constructor(ticketNumber: number) {
    super(`Ticket ${ticketNumber} is already assigned.`);
  }
}

export interface CreateTicketInput {
  requesterId: string;
  requesterDepartmentId: string;
  serviceTypeId: string;
  subject: string;
  description: string;
  priority: Priority;
  channel: Channel;
  confidential: boolean;
  fields: Record<string, unknown>;
}

export async function create(input: CreateTicketInput): Promise<{ number: number }> {
  const now = new Date();

  const serviceType = await prisma.serviceType.findUniqueOrThrow({
    where: { id: input.serviceTypeId },
  });

  const [slaSettings, holidays] = await Promise.all([getSlaSettings(), getHolidays()]);
  const target = slaSettings.targets[input.priority];
  const calendar = calendarForPriority(input.priority, slaSettings, holidays);

  const dueAt = computeDueAt({ createdAt: now, resolveMinutes: target.resolveMinutes, calendar });
  const firstResponseDueAt = computeFirstResponseDueAt({
    createdAt: now,
    firstResponseMinutes: target.firstResponseMinutes,
    calendar,
  });

  const ticket = await prisma.$transaction((tx) =>
    tx.ticket.create({
      data: {
        subject: input.subject,
        description: input.description,
        fields: input.fields as unknown as Prisma.InputJsonValue,
        requesterId: input.requesterId,
        requesterDepartmentId: input.requesterDepartmentId,
        serviceTypeId: input.serviceTypeId,
        priority: input.priority,
        channel: input.channel,
        confidential: input.confidential,
        createdAt: now,
        dueAt,
        firstResponseDueAt,
        legs: {
          create: {
            departmentId: serviceType.departmentId,
            byUserId: input.requesterId,
            inAt: now,
          },
        },
        events: {
          create: {
            type: 'CREATED',
            byUserId: input.requesterId,
            meta: { departmentId: serviceType.departmentId },
            createdAt: now,
          },
        },
      },
    }),
  );

  return { number: ticket.number };
}

export async function assign(params: {
  ticketNumber: number;
  assigneeId: string;
  byUserId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const currentLeg = await tx.ticketLeg.findFirstOrThrow({
      where: { ticketId: params.ticketNumber, outAt: null },
    });

    const assignee = await tx.user.findUniqueOrThrow({ where: { id: params.assigneeId } });
    if (assignee.departmentId !== currentLeg.departmentId) {
      throw new InvalidAssigneeError(params.assigneeId);
    }

    await tx.ticket.update({
      where: { number: params.ticketNumber },
      data: { assigneeId: params.assigneeId },
    });
    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: 'ASSIGNED',
        byUserId: params.byUserId,
        meta: { assigneeId: params.assigneeId },
      },
    });
  });
}

/** D-08: a member assigns an unassigned ticket to themselves. */
export async function pickUp(params: { ticketNumber: number; userId: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const result = await tx.ticket.updateMany({
      where: { number: params.ticketNumber, assigneeId: null },
      data: { assigneeId: params.userId },
    });
    if (result.count === 0) {
      throw new TicketAlreadyAssignedError(params.ticketNumber);
    }

    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: 'ASSIGNED',
        byUserId: params.userId,
        meta: { assigneeId: params.userId, via: 'pickup' },
      },
    });
  });
}

/** Always recomputes from createdAt (+ accumulated pausedMs), never from "now". */
export async function setPriority(params: {
  ticketNumber: number;
  priority: Priority;
  byUserId: string;
}): Promise<void> {
  const [slaSettings, holidays] = await Promise.all([getSlaSettings(), getHolidays()]);

  await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUniqueOrThrow({ where: { number: params.ticketNumber } });
    if (ticket.priority === params.priority) return;

    const target = slaSettings.targets[params.priority];
    const calendar = calendarForPriority(params.priority, slaSettings, holidays);

    const dueAt = computeDueAt({
      createdAt: ticket.createdAt,
      resolveMinutes: target.resolveMinutes,
      calendar,
      pausedMs: ticket.pausedMs,
    });
    // Once the first response has happened, its deadline is already met or missed —
    // recomputing it from the new priority would be meaningless.
    const firstResponseDueAt = ticket.firstResponseAt
      ? ticket.firstResponseDueAt
      : computeFirstResponseDueAt({
          createdAt: ticket.createdAt,
          firstResponseMinutes: target.firstResponseMinutes,
          calendar,
        });

    await tx.ticket.update({
      where: { number: params.ticketNumber },
      data: { priority: params.priority, dueAt, firstResponseDueAt },
    });
    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: 'PRIORITY_CHANGED',
        byUserId: params.byUserId,
        meta: { from: ticket.priority, to: params.priority },
      },
    });
  });
}

/** D-03: pauses the deadline on entering Awaiting requester, resumes it on leaving. */
export async function setStatus(params: {
  ticketNumber: number;
  status: TicketStatus;
  byUserId: string;
}): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUniqueOrThrow({ where: { number: params.ticketNumber } });
    if (ticket.status === params.status) return;

    const data: Prisma.TicketUpdateInput = { status: params.status };

    if (params.status === 'AWAITING_REQUESTER') {
      data.pausedAt = now;
    } else if (ticket.status === 'AWAITING_REQUESTER' && ticket.pausedAt) {
      const pauseDurationMs = now.getTime() - ticket.pausedAt.getTime();
      data.pausedAt = null;
      data.pausedMs = ticket.pausedMs + pauseDurationMs;
      data.dueAt = new Date(ticket.dueAt.getTime() + pauseDurationMs);
    }

    if (params.status === 'RESOLVED' && !ticket.resolvedAt) {
      data.resolvedAt = now;
    } else if (params.status !== 'RESOLVED' && params.status !== 'CLOSED') {
      data.resolvedAt = null;
    }

    await tx.ticket.update({ where: { number: params.ticketNumber }, data });
    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: params.status === 'RESOLVED' ? 'RESOLVED' : 'STATUS_CHANGED',
        byUserId: params.byUserId,
        meta: { from: ticket.status, to: params.status },
        createdAt: now,
      },
    });
  });
}
