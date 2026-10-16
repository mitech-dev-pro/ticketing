// lib/services/tickets.ts (BUILD_PLAN.md Phase 2): deadline maths on create, priority
// recompute from createdAt (never from "now"), the pause/resume contract for Awaiting
// requester, and pickUp vs assign (D-08: members self-assign, only heads reassign).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  addNote,
  assign,
  ConfidentialMentionError,
  create,
  forward,
  InvalidAssigneeError,
  markRatingFollowedUp,
  pickUp,
  rate,
  reopen,
  reply,
  SameDepartmentForwardError,
  setPriority,
  setStatus,
  TicketAlreadyAssignedError,
  UnknownMentionError,
} from '@/lib/services/tickets';
import { can, type PermissionTicket } from '@/lib/permissions';
import settingsData from '@/prisma/seed-data/settings.json';

const settings = settingsData as Record<string, unknown>;

let departmentId: string;
let otherDepartmentId: string;
let thirdDepartmentId: string;
let serviceTypeId: string;
let requesterId: string;
let assigneeInDeptId: string;
let secondAssigneeInDeptId: string;
let outsiderId: string;
let headInDeptId: string;
let adminId: string;

beforeAll(async () => {
  // Shared global config `create`/`setPriority` read via lib/settings.ts — harmless to
  // leave in place afterwards since these are the real production defaults.
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
  }

  const department = await prisma.department.create({
    data: {
      slug: 'ticket-service-test-it',
      name: 'Ticket Service Test IT',
      hue: 235,
      emailAlias: 'ticket-service-test-it@milife.test',
    },
  });
  departmentId = department.id;

  const otherDepartment = await prisma.department.create({
    data: {
      slug: 'ticket-service-test-hr',
      name: 'Ticket Service Test HR',
      hue: 325,
      emailAlias: 'ticket-service-test-hr@milife.test',
    },
  });
  otherDepartmentId = otherDepartment.id;

  const thirdDepartment = await prisma.department.create({
    data: {
      slug: 'ticket-service-test-facilities',
      name: 'Ticket Service Test Facilities',
      hue: 45,
      emailAlias: 'ticket-service-test-facilities@milife.test',
    },
  });
  thirdDepartmentId = thirdDepartment.id;

  const serviceType = await prisma.serviceType.create({
    data: {
      departmentId,
      name: 'Ticket service test type',
      description: 'placeholder',
      defaultPriority: 'MEDIUM',
      needsApproval: false,
      attachmentRequired: false,
      fields: [],
    },
  });
  serviceTypeId = serviceType.id;

  const [requester, assigneeInDept, secondAssigneeInDept, outsider, headInDept, admin] =
    await Promise.all([
      prisma.user.create({
        data: {
          name: 'Requester',
          email: 'ticket-service-requester@milife.test',
          passwordHash: 'unused-in-this-test',
          role: 'MEMBER',
          departmentId,
          branch: 'ACHIMOTA_HQ',
        },
      }),
      prisma.user.create({
        data: {
          name: 'Assignee In Dept',
          email: 'ticket-service-assignee@milife.test',
          passwordHash: 'unused-in-this-test',
          role: 'MEMBER',
          departmentId,
          branch: 'ACHIMOTA_HQ',
        },
      }),
      prisma.user.create({
        data: {
          name: 'Second Assignee In Dept',
          email: 'ticket-service-assignee-2@milife.test',
          passwordHash: 'unused-in-this-test',
          role: 'MEMBER',
          departmentId,
          branch: 'ACHIMOTA_HQ',
        },
      }),
      prisma.user.create({
        data: {
          name: 'Outsider',
          email: 'ticket-service-outsider@milife.test',
          passwordHash: 'unused-in-this-test',
          role: 'MEMBER',
          departmentId: otherDepartmentId,
          branch: 'ACHIMOTA_HQ',
        },
      }),
      prisma.user.create({
        data: {
          name: 'Head In Dept',
          email: 'ticket-service-head@milife.test',
          passwordHash: 'unused-in-this-test',
          role: 'HEAD',
          departmentId,
          branch: 'ACHIMOTA_HQ',
        },
      }),
      prisma.user.create({
        data: {
          name: 'Admin',
          email: 'ticket-service-admin@milife.test',
          passwordHash: 'unused-in-this-test',
          role: 'ADMIN',
          departmentId: otherDepartmentId,
          branch: 'ACHIMOTA_HQ',
        },
      }),
    ]);
  requesterId = requester.id;
  assigneeInDeptId = assigneeInDept.id;
  secondAssigneeInDeptId = secondAssigneeInDept.id;
  outsiderId = outsider.id;
  headInDeptId = headInDept.id;
  adminId = admin.id;

  await prisma.department.update({
    where: { id: departmentId },
    data: { headUserId: headInDeptId },
  });
}, 30_000);

afterAll(async () => {
  const createdTickets = await prisma.ticket.findMany({
    where: { serviceTypeId },
    select: { number: true },
  });
  const numbers = createdTickets.map((t) => t.number);

  await prisma.attachment.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticketMention.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticketLeg.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticket.deleteMany({ where: { number: { in: numbers } } });
  await prisma.serviceType.deleteMany({ where: { departmentId } });
  await prisma.department.update({ where: { id: departmentId }, data: { headUserId: null } });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          requesterId,
          assigneeInDeptId,
          secondAssigneeInDeptId,
          outsiderId,
          headInDeptId,
          adminId,
        ],
      },
    },
  });
  await prisma.department.deleteMany({
    where: { id: { in: [departmentId, otherDepartmentId, thirdDepartmentId] } },
  });
});

async function createTestTicket(priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' = 'URGENT') {
  return create({
    requesterId,
    requesterDepartmentId: departmentId,
    serviceTypeId,
    subject: 'Test ticket',
    description: 'A ticket created for lib/services/tickets.ts integration tests.',
    priority,
    channel: 'PORTAL',
    confidential: false,
    fields: {},
  });
}

describe('create', () => {
  it('computes dueAt and firstResponseDueAt from the Urgent SLA target (24x7)', async () => {
    const before = Date.now();
    const { number } = await createTestTicket('URGENT');
    const after = Date.now();

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    const elapsedToDue = ticket.dueAt.getTime() - ticket.createdAt.getTime();
    const elapsedToFirstResponse = ticket.firstResponseDueAt.getTime() - ticket.createdAt.getTime();

    expect(elapsedToDue).toBe(240 * 60_000); // Urgent resolve target: 4h
    expect(elapsedToFirstResponse).toBe(30 * 60_000); // Urgent first-response target: 30min
    expect(ticket.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(ticket.createdAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("opens a TicketLeg in the service type's department and writes a CREATED event", async () => {
    const { number } = await createTestTicket();

    const legs = await prisma.ticketLeg.findMany({ where: { ticketId: number } });
    expect(legs).toHaveLength(1);
    expect(legs[0]?.departmentId).toBe(departmentId);
    expect(legs[0]?.outAt).toBeNull();

    const events = await prisma.ticketEvent.findMany({ where: { ticketId: number } });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('CREATED');
    expect(events[0]?.byUserId).toBe(requesterId);
  });
});

describe('assign vs pickUp (D-08)', () => {
  it("assign succeeds when the assignee is a member of the ticket's current department", async () => {
    const { number } = await createTestTicket();
    await assign({ ticketNumber: number, assigneeId: assigneeInDeptId, byUserId: requesterId });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.assigneeId).toBe(assigneeInDeptId);

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId: number, type: 'ASSIGNED' },
    });
    expect(events).toHaveLength(1);
  });

  it("assign rejects an assignee outside the ticket's current department", async () => {
    const { number } = await createTestTicket();
    await expect(
      assign({ ticketNumber: number, assigneeId: outsiderId, byUserId: requesterId }),
    ).rejects.toThrow(InvalidAssigneeError);
  });

  it('pickUp lets a member self-assign an unassigned ticket', async () => {
    const { number } = await createTestTicket();
    await pickUp({ ticketNumber: number, userId: assigneeInDeptId });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.assigneeId).toBe(assigneeInDeptId);
  });

  it('pickUp rejects a ticket that is already assigned', async () => {
    const { number } = await createTestTicket();
    await pickUp({ ticketNumber: number, userId: assigneeInDeptId });

    await expect(pickUp({ ticketNumber: number, userId: secondAssigneeInDeptId })).rejects.toThrow(
      TicketAlreadyAssignedError,
    );
  });
});

describe('setPriority', () => {
  it('recomputes dueAt from createdAt (not "now") when priority changes', async () => {
    const { number } = await createTestTicket('LOW');
    const before = await prisma.ticket.findUniqueOrThrow({ where: { number } });

    await setPriority({ ticketNumber: number, priority: 'URGENT', byUserId: requesterId });

    const after = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    expect(after.dueAt.getTime() - after.createdAt.getTime()).toBe(240 * 60_000); // Urgent

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId: number, type: 'PRIORITY_CHANGED' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.meta).toMatchObject({ from: 'LOW', to: 'URGENT' });
  });

  it('adds any accumulated pausedMs on top of the recomputed target', async () => {
    const { number } = await createTestTicket('LOW');
    await prisma.ticket.update({ where: { number }, data: { pausedMs: 10 * 60_000 } });

    await setPriority({ ticketNumber: number, priority: 'HIGH', byUserId: requesterId });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.dueAt.getTime() - ticket.createdAt.getTime()).toBe(480 * 60_000 + 10 * 60_000);
  });

  it('leaves firstResponseDueAt untouched once firstResponseAt is already set', async () => {
    const { number } = await createTestTicket('LOW');
    const firstResponseAt = new Date();
    const before = await prisma.ticket.update({
      where: { number },
      data: { firstResponseAt },
    });

    await setPriority({ ticketNumber: number, priority: 'URGENT', byUserId: requesterId });

    const after = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(after.firstResponseDueAt.getTime()).toBe(before.firstResponseDueAt.getTime());
  });
});

describe('setStatus — pause/resume (D-03)', () => {
  it('pauses the deadline on entering Awaiting requester', async () => {
    const { number } = await createTestTicket();
    const before = Date.now();

    await setStatus({ ticketNumber: number, status: 'AWAITING_REQUESTER', byUserId: requesterId });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.status).toBe('AWAITING_REQUESTER');
    expect(ticket.pausedAt).not.toBeNull();
    expect(ticket.pausedAt!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('shifts dueAt forward by the real pause duration on resume and accumulates pausedMs', async () => {
    const { number } = await createTestTicket();
    const original = await prisma.ticket.findUniqueOrThrow({ where: { number } });

    // Simulate having been paused for 30 real minutes.
    const pausedAt = new Date(Date.now() - 30 * 60_000);
    await prisma.ticket.update({
      where: { number },
      data: { status: 'AWAITING_REQUESTER', pausedAt },
    });

    await setStatus({ ticketNumber: number, status: 'IN_PROGRESS', byUserId: requesterId });

    const resumed = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(resumed.pausedAt).toBeNull();
    expect(resumed.status).toBe('IN_PROGRESS');

    const pauseDurationMs = resumed.pausedMs;
    expect(pauseDurationMs).toBeGreaterThanOrEqual(30 * 60_000);
    expect(pauseDurationMs).toBeLessThan(30 * 60_000 + 5_000); // tolerate test runtime drift

    expect(resumed.dueAt.getTime() - original.dueAt.getTime()).toBe(pauseDurationMs);
  });

  it('sets resolvedAt on RESOLVED and clears it if moved away again', async () => {
    const { number } = await createTestTicket();

    await setStatus({ ticketNumber: number, status: 'RESOLVED', byUserId: requesterId });
    const resolved = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(resolved.resolvedAt).not.toBeNull();

    await setStatus({ ticketNumber: number, status: 'IN_PROGRESS', byUserId: requesterId });
    const reopened = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(reopened.resolvedAt).toBeNull();
  });
});

function asPermissionTicket(ticket: {
  number: number;
  requesterId: string;
  requesterDepartmentId: string;
  assigneeId: string | null;
  confidential: boolean;
  status: PermissionTicket['status'];
  legs: { departmentId: string; outAt: Date | null }[];
  mentions: { type: 'PERSON' | 'DEPARTMENT'; userId: string | null; departmentId: string | null }[];
}): PermissionTicket {
  return {
    id: String(ticket.number),
    requesterId: ticket.requesterId,
    requesterDepartmentId: ticket.requesterDepartmentId,
    assigneeId: ticket.assigneeId,
    confidential: ticket.confidential,
    status: ticket.status,
    legs: ticket.legs,
    mentions: ticket.mentions.map((m) => ({
      type: m.type === 'PERSON' ? ('person' as const) : ('department' as const),
      id: (m.type === 'PERSON' ? m.userId : m.departmentId) ?? '',
    })),
  };
}

async function loadFull(number: number) {
  return prisma.ticket.findUniqueOrThrow({
    where: { number },
    include: { legs: true, mentions: true },
  });
}

describe('forward (D-07)', () => {
  it('closes the current leg and opens a new one in the target department', async () => {
    const { number } = await createTestTicket();
    await forward({
      ticketNumber: number,
      byUserId: requesterId,
      targetDepartmentId: otherDepartmentId,
      reason: 'Wrong department',
      confidential: false,
    });

    const legs = await prisma.ticketLeg.findMany({
      where: { ticketId: number },
      orderBy: { inAt: 'asc' },
    });
    expect(legs).toHaveLength(2);
    expect(legs[0]?.departmentId).toBe(departmentId);
    expect(legs[0]?.outAt).not.toBeNull();
    expect(legs[1]?.departmentId).toBe(otherDepartmentId);
    expect(legs[1]?.outAt).toBeNull();
  });

  it('clears the assignee and writes a FORWARDED event with the reason', async () => {
    const { number } = await createTestTicket();
    await assign({ ticketNumber: number, assigneeId: assigneeInDeptId, byUserId: requesterId });

    await forward({
      ticketNumber: number,
      byUserId: requesterId,
      targetDepartmentId: otherDepartmentId,
      reason: 'Printer issue, not an IT matter',
      confidential: false,
    });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.assigneeId).toBeNull();

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId: number, type: 'FORWARDED' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.body).toBe('Printer issue, not an IT matter');
    expect(events[0]?.meta).toMatchObject({ from: departmentId, to: otherDepartmentId });
  });

  it('rejects forwarding to the department the ticket is already in', async () => {
    const { number } = await createTestTicket();
    await expect(
      forward({
        ticketNumber: number,
        byUserId: requesterId,
        targetDepartmentId: departmentId,
        reason: 'No-op',
        confidential: false,
      }),
    ).rejects.toThrow(SameDepartmentForwardError);
  });

  it('keeps confidentiality sticky and only writes CONFIDENTIAL_CHANGED when it actually changes', async () => {
    const { number } = await createTestTicket();
    await prisma.ticket.update({ where: { number }, data: { confidential: true } });

    // Forwarding with the same confidential value: no CONFIDENTIAL_CHANGED event.
    await forward({
      ticketNumber: number,
      byUserId: requesterId,
      targetDepartmentId: otherDepartmentId,
      reason: 'First hop',
      confidential: true,
    });
    let ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.confidential).toBe(true);
    let confidentialEvents = await prisma.ticketEvent.findMany({
      where: { ticketId: number, type: 'CONFIDENTIAL_CHANGED' },
    });
    expect(confidentialEvents).toHaveLength(0);

    // Forwarding again and switching it off writes the event (D-07: always writes an event).
    await forward({
      ticketNumber: number,
      byUserId: requesterId,
      targetDepartmentId: thirdDepartmentId,
      reason: 'Second hop',
      confidential: false,
    });
    ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.confidential).toBe(false);
    confidentialEvents = await prisma.ticketEvent.findMany({
      where: { ticketId: number, type: 'CONFIDENTIAL_CHANGED' },
    });
    expect(confidentialEvents).toHaveLength(1);
    expect(confidentialEvents[0]?.meta).toMatchObject({ from: true, to: false, via: 'forward' });
  });

  it('history survives several forwards: every leg and its time in each department is kept', async () => {
    const { number } = await createTestTicket();
    await forward({
      ticketNumber: number,
      byUserId: requesterId,
      targetDepartmentId: otherDepartmentId,
      reason: 'Hop 1',
      confidential: false,
    });
    await forward({
      ticketNumber: number,
      byUserId: requesterId,
      targetDepartmentId: thirdDepartmentId,
      reason: 'Hop 2',
      confidential: false,
    });
    await forward({
      ticketNumber: number,
      byUserId: requesterId,
      targetDepartmentId: departmentId,
      reason: 'Hop 3, back to IT',
      confidential: false,
    });

    const legs = await prisma.ticketLeg.findMany({
      where: { ticketId: number },
      orderBy: { inAt: 'asc' },
    });
    expect(legs.map((leg) => leg.departmentId)).toEqual([
      departmentId,
      otherDepartmentId,
      thirdDepartmentId,
      departmentId,
    ]);
    expect(legs.slice(0, 3).every((leg) => leg.outAt !== null)).toBe(true);
    expect(legs[3]?.outAt).toBeNull();

    const forwardedEvents = await prisma.ticketEvent.findMany({
      where: { ticketId: number, type: 'FORWARDED' },
    });
    expect(forwardedEvents).toHaveLength(3);
  });
});

describe('reply / addNote — mentions (D-07) and firstResponseAt (D-02)', () => {
  it('addNote writes a NOTE event and never touches firstResponseAt', async () => {
    const { number } = await createTestTicket();
    await addNote({
      ticketNumber: number,
      byUserId: assigneeInDeptId,
      body: 'Internal note, not for the requester',
      mentions: { people: [], departments: [] },
      attachments: [],
    });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.firstResponseAt).toBeNull();

    const events = await prisma.ticketEvent.findMany({ where: { ticketId: number, type: 'NOTE' } });
    expect(events).toHaveLength(1);
    expect(events[0]?.body).toBe('Internal note, not for the requester');
  });

  it('a note never reaches the requester: the requester cannot readNotes on their own ticket', async () => {
    // Unlike createTestTicket(), the requester here is genuinely outside the handling
    // department (outsiderId is a member of otherDepartmentId) so isCurrentDepartmentMember
    // cannot accidentally grant them handler-level access to the note.
    const { number } = await create({
      requesterId: outsiderId,
      requesterDepartmentId: otherDepartmentId,
      serviceTypeId,
      subject: 'Cross-department test ticket',
      description: 'Raised by an outsider to the handling department.',
      priority: 'MEDIUM',
      channel: 'PORTAL',
      confidential: false,
      fields: {},
    });
    await addNote({
      ticketNumber: number,
      byUserId: assigneeInDeptId,
      body: 'Handler-only note',
      mentions: { people: [], departments: [] },
      attachments: [],
    });

    const full = await loadFull(number);
    const permissionTicket = asPermissionTicket(full);
    expect(
      can(
        'readNotes',
        { id: outsiderId, role: 'MEMBER', departmentId: otherDepartmentId },
        permissionTicket,
      ),
    ).toBe(false);
    expect(
      can('readNotes', { id: assigneeInDeptId, role: 'MEMBER', departmentId }, permissionTicket),
    ).toBe(true);
  });

  it("reply by the requester does not set firstResponseAt (D-02: not the requester's own message)", async () => {
    const { number } = await createTestTicket();
    await reply({
      ticketNumber: number,
      byUserId: requesterId,
      body: 'Any update?',
      mentions: { people: [], departments: [] },
      attachments: [],
    });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.firstResponseAt).toBeNull();
  });

  it('reply by a member of the handling department sets firstResponseAt once', async () => {
    const { number } = await createTestTicket();
    await reply({
      ticketNumber: number,
      byUserId: assigneeInDeptId,
      body: 'On it',
      mentions: { people: [], departments: [] },
      attachments: [],
    });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.firstResponseAt).not.toBeNull();
    const firstStamp = ticket.firstResponseAt!.getTime();

    // A second reply must not move it.
    await reply({
      ticketNumber: number,
      byUserId: secondAssigneeInDeptId,
      body: 'Following up',
      mentions: { people: [], departments: [] },
      attachments: [],
    });
    const after = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(after.firstResponseAt!.getTime()).toBe(firstStamp);
  });

  it('mentioning a person writes a TicketMention and grants that person view access', async () => {
    const { number } = await createTestTicket();
    await reply({
      ticketNumber: number,
      byUserId: assigneeInDeptId,
      body: `Looping in you for this, @outsider`,
      mentions: { people: [outsiderId], departments: [] },
      attachments: [],
    });

    const full = await loadFull(number);
    expect(full.mentions).toHaveLength(1);
    expect(full.mentions[0]).toMatchObject({ type: 'PERSON', userId: outsiderId });

    const permissionTicket = asPermissionTicket(full);
    expect(
      can(
        'view',
        { id: outsiderId, role: 'MEMBER', departmentId: otherDepartmentId },
        permissionTicket,
      ),
    ).toBe(true);
  });

  it('rejects mentioning a department or an unrelated person on a confidential ticket', async () => {
    const { number } = await createTestTicket();
    await prisma.ticket.update({ where: { number }, data: { confidential: true } });

    await expect(
      reply({
        ticketNumber: number,
        byUserId: assigneeInDeptId,
        body: 'cc department',
        mentions: { people: [], departments: [otherDepartmentId] },
        attachments: [],
      }),
    ).rejects.toThrow(ConfidentialMentionError);

    await expect(
      reply({
        ticketNumber: number,
        byUserId: assigneeInDeptId,
        body: 'cc outsider',
        mentions: { people: [outsiderId], departments: [] },
        attachments: [],
      }),
    ).rejects.toThrow(ConfidentialMentionError);
  });

  it('allows mentioning the assignee, the head of the current department or an admin on a confidential ticket', async () => {
    const { number } = await createTestTicket();
    await assign({ ticketNumber: number, assigneeId: assigneeInDeptId, byUserId: requesterId });
    await prisma.ticket.update({ where: { number }, data: { confidential: true } });

    await reply({
      ticketNumber: number,
      byUserId: assigneeInDeptId,
      body: 'cc head and admin',
      mentions: { people: [headInDeptId, adminId], departments: [] },
      attachments: [],
    });

    const mentions = await prisma.ticketMention.findMany({ where: { ticketId: number } });
    expect(mentions.map((m) => m.userId).sort()).toEqual([adminId, headInDeptId].sort());
  });

  it('rejects a mention referencing a person that does not exist', async () => {
    const { number } = await createTestTicket();
    await expect(
      reply({
        ticketNumber: number,
        byUserId: assigneeInDeptId,
        body: 'cc nobody',
        mentions: { people: ['does-not-exist'], departments: [] },
        attachments: [],
      }),
    ).rejects.toThrow(UnknownMentionError);
  });
});

describe('reopen / rate / markRatingFollowedUp', () => {
  it('reopen puts a resolved ticket back to Open, clears resolvedAt and writes REOPENED', async () => {
    const { number } = await createTestTicket();
    await setStatus({ ticketNumber: number, status: 'RESOLVED', byUserId: assigneeInDeptId });

    await reopen({ ticketNumber: number, byUserId: requesterId });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.status).toBe('OPEN');
    expect(ticket.resolvedAt).toBeNull();

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId: number, type: 'REOPENED' },
    });
    expect(events).toHaveLength(1);
  });

  it('rate sets csat and writes a RATED event with reasons and note', async () => {
    const { number } = await createTestTicket();
    await setStatus({ ticketNumber: number, status: 'RESOLVED', byUserId: assigneeInDeptId });

    await rate({
      ticketNumber: number,
      byUserId: requesterId,
      stars: 2,
      reasons: ['Took too long'],
      note: 'Please follow up',
    });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.csat).toBe(2);

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId: number, type: 'RATED' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.meta).toMatchObject({
      stars: 2,
      reasons: ['Took too long'],
      note: 'Please follow up',
    });
  });

  it('markRatingFollowedUp stamps ratingFollowedUpAt and writes RATING_FOLLOWED_UP', async () => {
    const { number } = await createTestTicket();
    await setStatus({ ticketNumber: number, status: 'RESOLVED', byUserId: assigneeInDeptId });
    await rate({ ticketNumber: number, byUserId: requesterId, stars: 1, reasons: [], note: null });

    await markRatingFollowedUp({ ticketNumber: number, byUserId: headInDeptId });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.ratingFollowedUpAt).not.toBeNull();

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId: number, type: 'RATING_FOLLOWED_UP' },
    });
    expect(events).toHaveLength(1);
  });
});
