'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { can } from '@/lib/permissions';
import { formatDeadline } from '@/lib/dates';
import {
  assign as assignService,
  pickUp as pickUpService,
  setPriority as setPriorityService,
  setStatus as setStatusService,
  loadPermissionTicket,
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
import { deleteSavedView as deleteSavedViewService, saveView } from '@/lib/services/saved-views';
import { deleteSavedViewSchema, saveViewSchema } from '@/lib/validation/saved-views';

const FORBIDDEN = "You don't have permission to do that.";

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

export async function saveCurrentView(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = saveViewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const result = await saveView({
    userId: session.user.id,
    name: parsed.data.name,
    filters: parsed.data.filters,
  });

  revalidatePath('/inbox');
  return { ok: true, data: result };
}

export async function removeSavedView(input: unknown): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = deleteSavedViewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  await deleteSavedViewService({ id: parsed.data.id, userId: session.user.id });

  revalidatePath('/inbox');
  return { ok: true, data: null };
}

export interface TicketPreview {
  departmentName: string;
  deadlineLabel: string;
  lastMessage: string | null;
}

/** README: "Hover a row 450ms -> preview card (dept bar, status, last message 3-line
 * clamp, route, tasks, SLA)." Tasks aren't modeled yet (Phase 6), so this covers the
 * rest. A note's body is only included when the viewer can readNotes — same rule the
 * ticket detail page's conversation already applies. */
export async function getTicketPreview(ticketNumber: number): Promise<ActionResult<TicketPreview>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const ticket = await loadPermissionTicket(ticketNumber);
  if (!ticket || !can('view', session.user, ticket)) return formError(FORBIDDEN);

  const canReadNotes = can('readNotes', session.user, ticket);

  const [full, events] = await Promise.all([
    prisma.ticket.findUniqueOrThrow({
      where: { number: ticketNumber },
      select: {
        dueAt: true,
        createdAt: true,
        legs: { where: { outAt: null }, select: { department: { select: { name: true } } } },
      },
    }),
    prisma.ticketEvent.findMany({
      where: { ticketId: ticketNumber, type: { in: ['MESSAGE', 'NOTE'] } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { type: true, body: true },
    }),
  ]);

  const lastMessage = events.find((event) => event.type === 'MESSAGE' || canReadNotes);
  const deadline = formatDeadline(full.dueAt, full.createdAt);

  return {
    ok: true,
    data: {
      departmentName: full.legs[0]?.department.name ?? '',
      deadlineLabel: deadline.label,
      lastMessage: lastMessage?.body ?? null,
    },
  };
}
