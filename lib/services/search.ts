// Global search (Phase 5): MySQL FULLTEXT on Ticket(subject, description) — GA in
// Prisma since v6, no previewFeatures needed (confirmed against Prisma's own docs
// before adding the @@fulltext index, per D-14's instruction to check). Every
// result still goes through visibleTicketsWhere(user) in the same query, so a
// search can never surface a ticket the caller isn't allowed to open.

import { prisma } from '@/lib/db';
import { visibleTicketsWhere, type PermissionUser } from '@/lib/permissions';
import type { Priority, TicketStatus } from '@/generated/prisma/client';

/** MySQL boolean-mode search treats +, -, *, ", (, ) etc. as operators; strip them so
 * a raw user query can't produce a syntax error or an unintended operator. */
function toBooleanModeTerm(query: string): string | null {
  const words = query
    .split(/\s+/)
    .map((word) => word.replace(/[+\-*"()<>~@]/g, ''))
    .filter((word) => word.length > 0);
  if (words.length === 0) return null;
  return words.map((word) => `${word}*`).join(' ');
}

export interface TicketSearchResult {
  number: number;
  subject: string;
  status: TicketStatus;
  priority: Priority;
  confidential: boolean;
  requesterName: string;
}

const SEARCH_LIMIT = 20;

export async function searchTickets(
  user: PermissionUser,
  query: string,
): Promise<TicketSearchResult[]> {
  const term = toBooleanModeTerm(query);
  if (!term) return [];

  const tickets = await prisma.ticket.findMany({
    where: {
      AND: [
        visibleTicketsWhere(user),
        { OR: [{ subject: { search: term } }, { description: { search: term } }] },
      ],
    },
    select: {
      number: true,
      subject: true,
      status: true,
      priority: true,
      confidential: true,
      requester: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: SEARCH_LIMIT,
  });

  return tickets.map((ticket) => ({
    number: ticket.number,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    confidential: ticket.confidential,
    requesterName: ticket.requester.name,
  }));
}
