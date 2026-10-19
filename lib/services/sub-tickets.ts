// Sub-tickets (BUILD_PLAN.md Phase 6): a lightweight child ticket in the parent's
// own department, created from the Actions panel. Inherits the parent's requester
// and confidentiality, same as a forward keeps confidentiality sticky (D-07).

import { prisma } from '@/lib/db';
import { create, type CreateTicketInput } from '@/lib/services/tickets';
import type { TicketStatus } from '@/generated/prisma/client';

export class ParentTicketNotFoundError extends Error {
  constructor(ticketNumber: number) {
    super(`Ticket ${ticketNumber} does not exist.`);
  }
}

export interface AddSubTicketInput {
  parentTicketNumber: number;
  byUserId: string;
  serviceTypeId: string;
  subject: string;
  description: string;
  priority: CreateTicketInput['priority'];
  fields: Record<string, unknown>;
}

export async function addSubTicket(input: AddSubTicketInput): Promise<{ number: number }> {
  const parent = await prisma.ticket.findUnique({ where: { number: input.parentTicketNumber } });
  if (!parent) throw new ParentTicketNotFoundError(input.parentTicketNumber);

  const child = await create({
    requesterId: parent.requesterId,
    requesterDepartmentId: parent.requesterDepartmentId,
    serviceTypeId: input.serviceTypeId,
    subject: input.subject,
    description: input.description,
    priority: input.priority,
    channel: 'PORTAL',
    confidential: parent.confidential,
    fields: input.fields,
  });

  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { number: child.number },
      data: { parentId: input.parentTicketNumber },
    });
    await tx.ticketEvent.create({
      data: {
        ticketId: input.parentTicketNumber,
        type: 'CHILD',
        byUserId: input.byUserId,
        meta: { childNumber: child.number },
      },
    });
  });

  return child;
}

export interface SubTicketRow {
  number: number;
  subject: string;
  status: TicketStatus;
}

export async function listSubTickets(parentTicketNumber: number): Promise<SubTicketRow[]> {
  return prisma.ticket.findMany({
    where: { parentId: parentTicketNumber },
    select: { number: true, subject: true, status: true },
    orderBy: { createdAt: 'asc' },
  });
}
