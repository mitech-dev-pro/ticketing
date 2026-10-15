'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { can, type PermissionTicket } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import {
  assign as assignService,
  pickUp as pickUpService,
  setPriority as setPriorityService,
  setStatus as setStatusService,
  InvalidAssigneeError,
  TicketAlreadyAssignedError,
} from '@/lib/services/tickets';
import { formError, type ActionResult } from '@/lib/validation/action-result';
import {
  assignTicketSchema,
  pickUpTicketSchema,
  setTicketPrioritySchema,
  setTicketStatusSchema,
  bulkAssignTicketsSchema,
  bulkResolveTicketsSchema,
} from '@/lib/validation/tickets';

const FORBIDDEN = "You don't have permission to do that.";

async function loadPermissionTicket(ticketNumber: number): Promise<PermissionTicket | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { number: ticketNumber },
    select: {
      requesterId: true,
      requesterDepartmentId: true,
      assigneeId: true,
      confidential: true,
      status: true,
      legs: { select: { departmentId: true, outAt: true } },
      mentions: { select: { type: true, userId: true, departmentId: true } },
    },
  });
  if (!ticket) return null;

  return {
    id: String(ticketNumber),
    requesterId: ticket.requesterId,
    requesterDepartmentId: ticket.requesterDepartmentId,
    assigneeId: ticket.assigneeId,
    confidential: ticket.confidential,
    status: ticket.status,
    legs: ticket.legs,
    mentions: ticket.mentions.map((mention) => ({
      type: mention.type === 'PERSON' ? ('person' as const) : ('department' as const),
      id: (mention.type === 'PERSON' ? mention.userId : mention.departmentId) ?? '',
    })),
  };
}

export async function assignTicket(input: unknown): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = assignTicketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const ticket = await loadPermissionTicket(parsed.data.ticketNumber);
  if (!ticket || !can('assign', session.user, ticket)) return formError(FORBIDDEN);

  try {
    await assignService({
      ticketNumber: parsed.data.ticketNumber,
      assigneeId: parsed.data.assigneeId,
      byUserId: session.user.id,
    });
  } catch (error) {
    if (error instanceof InvalidAssigneeError) {
      return formError("That person isn't in this ticket's current department.");
    }
    throw error;
  }

  revalidatePath('/inbox');
  return { ok: true, data: null };
}

export async function pickUpTicket(input: unknown): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = pickUpTicketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const ticket = await loadPermissionTicket(parsed.data.ticketNumber);
  if (!ticket || !can('pickUp', session.user, ticket)) return formError(FORBIDDEN);

  try {
    await pickUpService({ ticketNumber: parsed.data.ticketNumber, userId: session.user.id });
  } catch (error) {
    if (error instanceof TicketAlreadyAssignedError) {
      return formError('Someone already picked this ticket up.');
    }
    throw error;
  }

  revalidatePath('/inbox');
  return { ok: true, data: null };
}

export async function setTicketPriority(input: unknown): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = setTicketPrioritySchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const ticket = await loadPermissionTicket(parsed.data.ticketNumber);
  if (!ticket || !can('setPriority', session.user, ticket)) return formError(FORBIDDEN);

  await setPriorityService({
    ticketNumber: parsed.data.ticketNumber,
    priority: parsed.data.priority,
    byUserId: session.user.id,
  });

  revalidatePath('/inbox');
  return { ok: true, data: null };
}

export async function setTicketStatus(input: unknown): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = setTicketStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const ticket = await loadPermissionTicket(parsed.data.ticketNumber);
  if (!ticket || !can('setStatus', session.user, ticket)) return formError(FORBIDDEN);

  await setStatusService({
    ticketNumber: parsed.data.ticketNumber,
    status: parsed.data.status,
    byUserId: session.user.id,
  });

  revalidatePath('/inbox');
  return { ok: true, data: null };
}

export async function bulkAssignTickets(
  input: unknown,
): Promise<ActionResult<{ updated: number }>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = bulkAssignTicketsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  let updated = 0;
  for (const ticketNumber of parsed.data.ticketNumbers) {
    const ticket = await loadPermissionTicket(ticketNumber);
    if (!ticket || !can('assign', session.user, ticket)) continue;
    try {
      await assignService({
        ticketNumber,
        assigneeId: parsed.data.assigneeId,
        byUserId: session.user.id,
      });
      updated += 1;
    } catch (error) {
      if (!(error instanceof InvalidAssigneeError)) throw error;
    }
  }

  revalidatePath('/inbox');
  return { ok: true, data: { updated } };
}

export async function bulkResolveTickets(
  input: unknown,
): Promise<ActionResult<{ updated: number }>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = bulkResolveTicketsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  let updated = 0;
  for (const ticketNumber of parsed.data.ticketNumbers) {
    const ticket = await loadPermissionTicket(ticketNumber);
    if (!ticket || !can('resolve', session.user, ticket)) continue;
    await setStatusService({ ticketNumber, status: 'RESOLVED', byUserId: session.user.id });
    updated += 1;
  }

  revalidatePath('/inbox');
  return { ok: true, data: { updated } };
}
