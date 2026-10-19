// Merge and the possible-duplicate panel (BUILD_PLAN.md Phase 6). The named check
// for this phase: "merging writes MERGED / MERGED_IN events on both tickets."

import { prisma } from '@/lib/db';
import { visibleTicketsWhere, type PermissionUser } from '@/lib/permissions';

export class SelfMergeError extends Error {
  constructor() {
    super('A ticket cannot be merged into itself.');
  }
}

export class TicketNotFoundError extends Error {
  constructor(ticketNumber: number) {
    super(`Ticket ${ticketNumber} does not exist.`);
  }
}

export class AlreadyMergedError extends Error {
  constructor() {
    super('This ticket has already been merged.');
  }
}

export async function mergeTicket(params: {
  ticketNumber: number;
  intoTicketNumber: number;
  byUserId: string;
}): Promise<void> {
  if (params.ticketNumber === params.intoTicketNumber) throw new SelfMergeError();

  await prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.ticket.findUnique({ where: { number: params.ticketNumber } }),
      tx.ticket.findUnique({ where: { number: params.intoTicketNumber } }),
    ]);
    if (!source) throw new TicketNotFoundError(params.ticketNumber);
    if (!target) throw new TicketNotFoundError(params.intoTicketNumber);
    if (source.mergedIntoId !== null) throw new AlreadyMergedError();

    await tx.ticket.update({
      where: { number: params.ticketNumber },
      data: { mergedIntoId: params.intoTicketNumber, status: 'CLOSED' },
    });

    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: 'MERGED',
        byUserId: params.byUserId,
        meta: { intoNumber: params.intoTicketNumber },
      },
    });
    await tx.ticketEvent.create({
      data: {
        ticketId: params.intoTicketNumber,
        type: 'MERGED_IN',
        byUserId: params.byUserId,
        meta: { fromNumber: params.ticketNumber },
      },
    });
  });
}

const DUPLICATE_LIMIT = 5;

function toBooleanModeTerm(query: string): string | null {
  const words = query
    .split(/\s+/)
    .map((word) => word.replace(/[+\-*"()<>~@]/g, ''))
    .filter((word) => word.length > 0);
  if (words.length === 0) return null;
  return words.map((word) => `${word}*`).join(' ');
}

export interface PossibleDuplicate {
  number: number;
  subject: string;
}

/** README: "possible-duplicate panel (merge)" — other open tickets in the same
 * current department whose subject shares words with this one. Same visibility
 * rule as everywhere else (D-05), so it can never surface a ticket the viewer
 * couldn't otherwise see. */
export async function findPossibleDuplicates(params: {
  ticketNumber: number;
  subject: string;
  currentDepartmentId: string;
  user: PermissionUser;
}): Promise<PossibleDuplicate[]> {
  const term = toBooleanModeTerm(params.subject);
  if (!term) return [];

  const tickets = await prisma.ticket.findMany({
    where: {
      AND: [
        visibleTicketsWhere(params.user),
        { number: { not: params.ticketNumber } },
        { mergedIntoId: null },
        { status: { notIn: ['RESOLVED', 'CLOSED'] } },
        { legs: { some: { departmentId: params.currentDepartmentId, outAt: null } } },
        { OR: [{ subject: { search: term } }, { description: { search: term } }] },
      ],
    },
    select: { number: true, subject: true },
    orderBy: { updatedAt: 'desc' },
    take: DUPLICATE_LIMIT,
  });

  return tickets;
}
