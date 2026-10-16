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
import type { PermissionTicket } from '@/lib/permissions';

/** Shared by every Server Action that needs a `can()` check: the minimal shape
 * lib/permissions.ts reads, loaded from a real ticket row. Returns null for a ticket
 * number that doesn't exist so callers can turn that into a generic "forbidden"
 * (never leaking whether a ticket exists to someone who can't see it). */
export async function loadPermissionTicket(ticketNumber: number): Promise<PermissionTicket | null> {
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

// ---------------------------------------------------------------------------------
// Phase 3: conversation, forwarding, resolve/reopen, rating.
// ---------------------------------------------------------------------------------

export interface MentionsInput {
  people: string[];
  departments: string[];
}

export interface AttachmentInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
}

export class ConfidentialMentionError extends Error {
  constructor() {
    super(
      'Confidential tickets cannot mention a department, and can only mention people who already have access.',
    );
  }
}

export class UnknownMentionError extends Error {
  constructor(kind: 'person' | 'department', id: string) {
    super(`Mentioned ${kind} "${id}" does not exist.`);
  }
}

export class SameDepartmentForwardError extends Error {
  constructor() {
    super('That is already this ticket’s current department.');
  }
}

/** D-07: on a confidential ticket, the @ picker may only offer people who can already
 * see the ticket (requester, assignee, head of the current department, admins) and no
 * departments at all. Also checks every id actually exists, since nothing trusts the
 * client. */
async function validateAndWriteMentions(
  tx: Prisma.TransactionClient,
  params: {
    ticketId: number;
    mentions: MentionsInput;
    ticket: { confidential: boolean; requesterId: string; assigneeId: string | null };
    currentDepartmentId: string;
  },
): Promise<void> {
  const { mentions, ticket, currentDepartmentId } = params;
  if (mentions.people.length === 0 && mentions.departments.length === 0) return;

  if (ticket.confidential && mentions.departments.length > 0) {
    throw new ConfidentialMentionError();
  }

  const people = mentions.people.length
    ? await tx.user.findMany({
        where: { id: { in: mentions.people } },
        select: { id: true, role: true },
      })
    : [];
  if (people.length !== new Set(mentions.people).size) {
    const found = new Set(people.map((p) => p.id));
    const missing = mentions.people.find((id) => !found.has(id));
    throw new UnknownMentionError('person', missing ?? mentions.people[0]!);
  }

  const departments = mentions.departments.length
    ? await tx.department.findMany({
        where: { id: { in: mentions.departments } },
        select: { id: true },
      })
    : [];
  if (departments.length !== new Set(mentions.departments).size) {
    const found = new Set(departments.map((d) => d.id));
    const missing = mentions.departments.find((id) => !found.has(id));
    throw new UnknownMentionError('department', missing ?? mentions.departments[0]!);
  }

  if (ticket.confidential) {
    const currentDept = await tx.department.findUniqueOrThrow({
      where: { id: currentDepartmentId },
      select: { headUserId: true },
    });
    const allowed = new Set(
      [ticket.requesterId, ticket.assigneeId, currentDept.headUserId].filter(
        (id): id is string => id !== null,
      ),
    );
    for (const person of people) {
      if (!allowed.has(person.id) && person.role !== 'ADMIN') {
        throw new ConfidentialMentionError();
      }
    }
  }

  for (const personId of new Set(mentions.people)) {
    await tx.ticketMention.create({
      data: { ticketId: params.ticketId, type: 'PERSON', userId: personId },
    });
  }
  for (const departmentId of new Set(mentions.departments)) {
    await tx.ticketMention.create({
      data: { ticketId: params.ticketId, type: 'DEPARTMENT', departmentId },
    });
  }
}

async function writeAttachments(
  tx: Prisma.TransactionClient,
  params: {
    ticketId: number;
    eventId: string;
    uploadedById: string;
    attachments: AttachmentInput[];
  },
): Promise<void> {
  for (const attachment of params.attachments) {
    await tx.attachment.create({
      data: {
        ticketId: params.ticketId,
        eventId: params.eventId,
        uploadedById: params.uploadedById,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        storageKey: attachment.storageKey,
      },
    });
  }
}

interface ComposeInput {
  ticketNumber: number;
  byUserId: string;
  body: string;
  mentions: MentionsInput;
  attachments: AttachmentInput[];
}

async function compose(input: ComposeInput, type: 'MESSAGE' | 'NOTE'): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUniqueOrThrow({ where: { number: input.ticketNumber } });
    const currentLeg = await tx.ticketLeg.findFirstOrThrow({
      where: { ticketId: input.ticketNumber, outAt: null },
    });

    await validateAndWriteMentions(tx, {
      ticketId: input.ticketNumber,
      mentions: input.mentions,
      ticket,
      currentDepartmentId: currentLeg.departmentId,
    });

    const event = await tx.ticketEvent.create({
      data: {
        ticketId: input.ticketNumber,
        type,
        byUserId: input.byUserId,
        body: input.body,
      },
    });

    await writeAttachments(tx, {
      ticketId: input.ticketNumber,
      eventId: event.id,
      uploadedById: input.byUserId,
      attachments: input.attachments,
    });

    // D-02: firstResponseAt is set by the first public reply from the handling
    // department — never a note, never the requester's own message.
    if (type === 'MESSAGE' && !ticket.firstResponseAt && input.byUserId !== ticket.requesterId) {
      const byUser = await tx.user.findUniqueOrThrow({ where: { id: input.byUserId } });
      if (byUser.departmentId === currentLeg.departmentId) {
        await tx.ticket.update({
          where: { number: input.ticketNumber },
          data: { firstResponseAt: new Date() },
        });
      }
    }
  });
}

export async function reply(input: ComposeInput): Promise<void> {
  await compose(input, 'MESSAGE');
}

export async function addNote(input: ComposeInput): Promise<void> {
  await compose(input, 'NOTE');
}

/** Forwarding closes the current leg, opens a new one, clears the assignee and writes
 * a FORWARDED event, all in one transaction. Confidentiality is sticky (D-07): the
 * caller passes the dialog's final toggle value, and a CONFIDENTIAL_CHANGED event is
 * written alongside FORWARDED whenever it actually changes. */
export async function forward(params: {
  ticketNumber: number;
  byUserId: string;
  targetDepartmentId: string;
  reason: string;
  confidential: boolean;
}): Promise<void> {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUniqueOrThrow({ where: { number: params.ticketNumber } });
    const currentLeg = await tx.ticketLeg.findFirstOrThrow({
      where: { ticketId: params.ticketNumber, outAt: null },
    });

    if (currentLeg.departmentId === params.targetDepartmentId) {
      throw new SameDepartmentForwardError();
    }

    await tx.ticketLeg.update({ where: { id: currentLeg.id }, data: { outAt: now } });
    await tx.ticketLeg.create({
      data: {
        ticketId: params.ticketNumber,
        departmentId: params.targetDepartmentId,
        byUserId: params.byUserId,
        reason: params.reason,
        inAt: now,
      },
    });

    await tx.ticket.update({
      where: { number: params.ticketNumber },
      data: { assigneeId: null, confidential: params.confidential },
    });

    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: 'FORWARDED',
        byUserId: params.byUserId,
        body: params.reason,
        meta: { from: currentLeg.departmentId, to: params.targetDepartmentId },
        createdAt: now,
      },
    });

    if (ticket.confidential !== params.confidential) {
      await tx.ticketEvent.create({
        data: {
          ticketId: params.ticketNumber,
          type: 'CONFIDENTIAL_CHANGED',
          byUserId: params.byUserId,
          meta: { from: ticket.confidential, to: params.confidential, via: 'forward' },
          createdAt: now,
        },
      });
    }
  });
}

/** Requester-only (lib/permissions.ts `can('reopen', ...)`): puts a resolved or closed
 * ticket back to Open so the conversation can continue. */
export async function reopen(params: { ticketNumber: number; byUserId: string }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUniqueOrThrow({ where: { number: params.ticketNumber } });

    await tx.ticket.update({
      where: { number: params.ticketNumber },
      data: { status: 'OPEN', resolvedAt: null },
    });
    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: 'REOPENED',
        byUserId: params.byUserId,
        meta: { from: ticket.status },
      },
    });
  });
}

/** Requester-only, 1-5 stars on a resolved/closed ticket. csat is a real column (not
 * buried in event meta) because Phase 7 reports on it. */
export async function rate(params: {
  ticketNumber: number;
  byUserId: string;
  stars: number;
  reasons: string[];
  note: string | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { number: params.ticketNumber },
      data: { csat: params.stars },
    });
    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: 'RATED',
        byUserId: params.byUserId,
        meta: { stars: params.stars, reasons: params.reasons, note: params.note },
      },
    });
  });
}

/** Head/admin dismisses the low-rating follow-up banner. */
export async function markRatingFollowedUp(params: {
  ticketNumber: number;
  byUserId: string;
}): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { number: params.ticketNumber },
      data: { ratingFollowedUpAt: now },
    });
    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: 'RATING_FOLLOWED_UP',
        byUserId: params.byUserId,
        createdAt: now,
      },
    });
  });
}
