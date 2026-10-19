// Ticket detail aside "Linked tickets" (BUILD_PLAN.md Phase 6). README: "always
// create the inverse" — every link is written as a pair, one row per direction, so
// either ticket's own `linksFrom` already tells the whole story with no second query
// walking the other way.

import { prisma } from '@/lib/db';
import type { TicketLinkType, TicketStatus } from '@/generated/prisma/client';

const INVERSE: Record<TicketLinkType, TicketLinkType> = {
  BLOCKED_BY: 'BLOCKS',
  BLOCKS: 'BLOCKED_BY',
  RELATED_TO: 'RELATED_TO',
};

export class SelfLinkError extends Error {
  constructor() {
    super('A ticket cannot be linked to itself.');
  }
}

export class TicketNotFoundError extends Error {
  constructor(ticketNumber: number) {
    super(`Ticket ${ticketNumber} does not exist.`);
  }
}

export class AlreadyLinkedError extends Error {
  constructor() {
    super('These tickets are already linked that way.');
  }
}

export interface LinkedTicketRow {
  type: TicketLinkType;
  ticket: { number: number; subject: string; status: TicketStatus };
}

export async function listLinks(ticketNumber: number): Promise<LinkedTicketRow[]> {
  const links = await prisma.ticketLink.findMany({
    where: { fromId: ticketNumber },
    select: { type: true, to: { select: { number: true, subject: true, status: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return links.map((link) => ({ type: link.type, ticket: link.to }));
}

/** README's header "Blocked" tag: true while an unresolved blocked_by link exists. */
export async function isBlocked(ticketNumber: number): Promise<boolean> {
  const count = await prisma.ticketLink.count({
    where: {
      fromId: ticketNumber,
      type: 'BLOCKED_BY',
      to: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
    },
  });
  return count > 0;
}

export async function addLink(params: {
  ticketNumber: number;
  targetTicketNumber: number;
  type: TicketLinkType;
  byUserId: string;
}): Promise<void> {
  if (params.ticketNumber === params.targetTicketNumber) throw new SelfLinkError();

  await prisma.$transaction(async (tx) => {
    const target = await tx.ticket.findUnique({ where: { number: params.targetTicketNumber } });
    if (!target) throw new TicketNotFoundError(params.targetTicketNumber);

    const existing = await tx.ticketLink.findUnique({
      where: {
        fromId_toId_type: {
          fromId: params.ticketNumber,
          toId: params.targetTicketNumber,
          type: params.type,
        },
      },
    });
    if (existing) throw new AlreadyLinkedError();

    const inverseType = INVERSE[params.type];
    await tx.ticketLink.create({
      data: { fromId: params.ticketNumber, toId: params.targetTicketNumber, type: params.type },
    });
    await tx.ticketLink.create({
      data: { fromId: params.targetTicketNumber, toId: params.ticketNumber, type: inverseType },
    });

    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: params.type,
        byUserId: params.byUserId,
        meta: { action: 'added', toNumber: params.targetTicketNumber },
      },
    });
    await tx.ticketEvent.create({
      data: {
        ticketId: params.targetTicketNumber,
        type: inverseType,
        byUserId: params.byUserId,
        meta: { action: 'added', toNumber: params.ticketNumber },
      },
    });
  });
}

export async function removeLink(params: {
  ticketNumber: number;
  targetTicketNumber: number;
  type: TicketLinkType;
  byUserId: string;
}): Promise<void> {
  const inverseType = INVERSE[params.type];

  await prisma.$transaction(async (tx) => {
    await tx.ticketLink.deleteMany({
      where: {
        fromId: params.ticketNumber,
        toId: params.targetTicketNumber,
        type: params.type,
      },
    });
    await tx.ticketLink.deleteMany({
      where: {
        fromId: params.targetTicketNumber,
        toId: params.ticketNumber,
        type: inverseType,
      },
    });

    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: params.type,
        byUserId: params.byUserId,
        meta: { action: 'removed', toNumber: params.targetTicketNumber },
      },
    });
    await tx.ticketEvent.create({
      data: {
        ticketId: params.targetTicketNumber,
        type: inverseType,
        byUserId: params.byUserId,
        meta: { action: 'removed', toNumber: params.ticketNumber },
      },
    });
  });
}
