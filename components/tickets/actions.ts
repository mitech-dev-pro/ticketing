'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { can } from '@/lib/permissions';
import {
  addNote as addNoteService,
  ConfidentialMentionError,
  forward as forwardService,
  loadPermissionTicket,
  markRatingFollowedUp as markRatingFollowedUpService,
  rate as rateService,
  reopen as reopenService,
  reply as replyService,
  SameDepartmentForwardError,
  setStatus as setStatusService,
  UnknownMentionError,
  type AttachmentInput,
} from '@/lib/services/tickets';
import { AlreadyEscalatedError, escalate as escalateService } from '@/lib/services/escalations';
import {
  MAX_ATTACHMENT_BYTES,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  uploadAttachment as uploadAttachmentToStorage,
} from '@/lib/storage';
import { formError, type ActionResult } from '@/lib/validation/action-result';
import {
  addNoteTicketSchema,
  escalateTicketSchema,
  forwardTicketSchema,
  markRatingFollowedUpSchema,
  rateTicketSchema,
  reopenTicketSchema,
  replyTicketSchema,
  resolveTicketSchema,
} from '@/lib/validation/tickets';

const FORBIDDEN = "You don't have permission to do that.";

function ticketPath(ticketNumber: number): string {
  return `/tickets/${ticketNumber}`;
}

function mentionErrorMessage(error: unknown): string | null {
  if (error instanceof ConfidentialMentionError) return error.message;
  if (error instanceof UnknownMentionError) return error.message;
  return null;
}

export async function replyToTicket(input: unknown): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = replyTicketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const ticket = await loadPermissionTicket(parsed.data.ticketNumber);
  if (!ticket || !can('reply', session.user, ticket)) return formError(FORBIDDEN);

  try {
    await replyService({
      ticketNumber: parsed.data.ticketNumber,
      byUserId: session.user.id,
      body: parsed.data.body,
      mentions: parsed.data.mentions,
      attachments: parsed.data.attachments,
    });
  } catch (error) {
    const message = mentionErrorMessage(error);
    if (message) return formError(message);
    throw error;
  }

  revalidatePath(ticketPath(parsed.data.ticketNumber));
  revalidatePath('/inbox');
  return { ok: true, data: null };
}

export async function addNoteToTicket(input: unknown): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = addNoteTicketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const ticket = await loadPermissionTicket(parsed.data.ticketNumber);
  if (!ticket || !can('addNote', session.user, ticket)) return formError(FORBIDDEN);

  try {
    await addNoteService({
      ticketNumber: parsed.data.ticketNumber,
      byUserId: session.user.id,
      body: parsed.data.body,
      mentions: parsed.data.mentions,
      attachments: parsed.data.attachments,
    });
  } catch (error) {
    const message = mentionErrorMessage(error);
    if (message) return formError(message);
    throw error;
  }

  revalidatePath(ticketPath(parsed.data.ticketNumber));
  return { ok: true, data: null };
}

export async function forwardTicket(input: unknown): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = forwardTicketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const ticket = await loadPermissionTicket(parsed.data.ticketNumber);
  if (!ticket || !can('forward', session.user, ticket)) return formError(FORBIDDEN);

  try {
    await forwardService({
      ticketNumber: parsed.data.ticketNumber,
      byUserId: session.user.id,
      targetDepartmentId: parsed.data.targetDepartmentId,
      reason: parsed.data.reason,
      confidential: parsed.data.confidential,
    });
  } catch (error) {
    if (error instanceof SameDepartmentForwardError) {
      return formError(error.message);
    }
    throw error;
  }

  revalidatePath(ticketPath(parsed.data.ticketNumber));
  revalidatePath('/inbox');
  return { ok: true, data: null };
}

export async function resolveTicket(input: unknown): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = resolveTicketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const ticket = await loadPermissionTicket(parsed.data.ticketNumber);
  if (!ticket || !can('resolve', session.user, ticket)) return formError(FORBIDDEN);

  await setStatusService({
    ticketNumber: parsed.data.ticketNumber,
    status: 'RESOLVED',
    byUserId: session.user.id,
  });

  revalidatePath(ticketPath(parsed.data.ticketNumber));
  revalidatePath('/inbox');
  return { ok: true, data: null };
}

export async function reopenTicket(input: unknown): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = reopenTicketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const ticket = await loadPermissionTicket(parsed.data.ticketNumber);
  if (!ticket || !can('reopen', session.user, ticket)) return formError(FORBIDDEN);

  await reopenService({ ticketNumber: parsed.data.ticketNumber, byUserId: session.user.id });

  revalidatePath(ticketPath(parsed.data.ticketNumber));
  revalidatePath('/sent');
  return { ok: true, data: null };
}

export async function rateTicket(input: unknown): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = rateTicketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const ticket = await loadPermissionTicket(parsed.data.ticketNumber);
  if (!ticket || !can('rate', session.user, ticket)) return formError(FORBIDDEN);

  await rateService({
    ticketNumber: parsed.data.ticketNumber,
    byUserId: session.user.id,
    stars: parsed.data.stars,
    reasons: parsed.data.reasons,
    note: parsed.data.note,
  });

  revalidatePath(ticketPath(parsed.data.ticketNumber));
  return { ok: true, data: null };
}

export async function markTicketRatingFollowedUp(input: unknown): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = markRatingFollowedUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const ticket = await loadPermissionTicket(parsed.data.ticketNumber);
  if (!ticket || !can('markRatingFollowedUp', session.user, ticket)) return formError(FORBIDDEN);

  await markRatingFollowedUpService({
    ticketNumber: parsed.data.ticketNumber,
    byUserId: session.user.id,
  });

  revalidatePath(ticketPath(parsed.data.ticketNumber));
  return { ok: true, data: null };
}

/** D-15: the requester, or a handler who isn't the head, can escalate an open ticket
 * to the next level with a reason — "next" meaning one past whatever's already there. */
export async function escalateTicket(input: unknown): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = escalateTicketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const ticket = await loadPermissionTicket(parsed.data.ticketNumber);
  if (!ticket || !can('escalate', session.user, ticket)) return formError(FORBIDDEN);

  const highest = await prisma.escalation.aggregate({
    where: { ticketId: parsed.data.ticketNumber },
    _max: { level: true },
  });
  const nextLevel = (highest._max.level ?? 0) + 1;

  try {
    await escalateService({
      ticketNumber: parsed.data.ticketNumber,
      level: nextLevel,
      byUserId: session.user.id,
      reason: parsed.data.reason,
    });
  } catch (error) {
    if (error instanceof AlreadyEscalatedError) {
      return formError('This ticket was just escalated by someone else — refresh to see it.');
    }
    throw error;
  }

  revalidatePath(ticketPath(parsed.data.ticketNumber));
  revalidatePath('/escalations');
  return { ok: true, data: null };
}

export type UploadedAttachment = AttachmentInput;

/** Uploads one file ahead of Send, so the composer can show a pending chip right
 * away (README: "pending attachments chips"). The Attachment row itself is only
 * created once reply()/addNote() runs with this metadata — see lib/services/tickets.ts. */
export async function uploadTicketAttachment(
  formData: FormData,
): Promise<ActionResult<UploadedAttachment>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const ticketNumberRaw = formData.get('ticketNumber');
  const ticketNumber = typeof ticketNumberRaw === 'string' ? Number(ticketNumberRaw) : NaN;
  if (!Number.isInteger(ticketNumber)) return formError('Missing ticket number.');

  const ticket = await loadPermissionTicket(ticketNumber);
  if (!ticket || !(can('reply', session.user, ticket) || can('addNote', session.user, ticket))) {
    return formError(FORBIDDEN);
  }

  const file = formData.get('file');
  if (!(file instanceof File)) return formError('No file provided.');
  if (file.size === 0) return formError('That file is empty.');
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return formError('Attachments must be 10MB or smaller.');
  }
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.type)) {
    return formError('That file type is not supported.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { storageKey } = await uploadAttachmentToStorage({
    filename: file.name,
    mimeType: file.type,
    buffer,
  });

  return {
    ok: true,
    data: { filename: file.name, mimeType: file.type, sizeBytes: file.size, storageKey },
  };
}

export interface MentionCandidate {
  people: { id: string; name: string }[];
  departments: { id: string; name: string }[];
}

/** D-07: the @ picker only offers people who can already see a confidential ticket,
 * and no departments at all. */
export async function mentionCandidatesForTicket(
  ticketNumber: number,
): Promise<ActionResult<MentionCandidate>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const ticket = await loadPermissionTicket(ticketNumber);
  if (!ticket || !can('view', session.user, ticket)) return formError(FORBIDDEN);

  if (ticket.confidential) {
    const currentLeg = ticket.legs.find((leg) => leg.outAt === null);
    const department = currentLeg
      ? await prisma.department.findUnique({
          where: { id: currentLeg.departmentId },
          select: { headUserId: true },
        })
      : null;
    const candidateIds = [ticket.requesterId, ticket.assigneeId, department?.headUserId].filter(
      (id): id is string => id !== null && id !== undefined,
    );
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', active: true },
      select: { id: true, name: true },
    });
    const named = await prisma.user.findMany({
      where: { id: { in: candidateIds }, active: true },
      select: { id: true, name: true },
    });
    const byId = new Map([...named, ...admins].map((u) => [u.id, u]));
    return { ok: true, data: { people: [...byId.values()], departments: [] } };
  }

  const [people, departments] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return { ok: true, data: { people, departments } };
}
