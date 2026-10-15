// lib/services/tickets.ts (BUILD_PLAN.md Phase 2): deadline maths on create, priority
// recompute from createdAt (never from "now"), the pause/resume contract for Awaiting
// requester, and pickUp vs assign (D-08: members self-assign, only heads reassign).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  assign,
  create,
  InvalidAssigneeError,
  pickUp,
  setPriority,
  setStatus,
  TicketAlreadyAssignedError,
} from '@/lib/services/tickets';
import settingsData from '@/prisma/seed-data/settings.json';

const settings = settingsData as Record<string, unknown>;

let departmentId: string;
let otherDepartmentId: string;
let serviceTypeId: string;
let requesterId: string;
let assigneeInDeptId: string;
let secondAssigneeInDeptId: string;
let outsiderId: string;

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

  const [requester, assigneeInDept, secondAssigneeInDept, outsider] = await Promise.all([
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
  ]);
  requesterId = requester.id;
  assigneeInDeptId = assigneeInDept.id;
  secondAssigneeInDeptId = secondAssigneeInDept.id;
  outsiderId = outsider.id;
}, 30_000);

afterAll(async () => {
  const createdTickets = await prisma.ticket.findMany({
    where: { requesterDepartmentId: departmentId },
    select: { number: true },
  });
  const numbers = createdTickets.map((t) => t.number);

  await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticketLeg.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticket.deleteMany({ where: { number: { in: numbers } } });
  await prisma.serviceType.deleteMany({ where: { departmentId } });
  await prisma.user.deleteMany({
    where: { id: { in: [requesterId, assigneeInDeptId, secondAssigneeInDeptId, outsiderId] } },
  });
  await prisma.department.deleteMany({ where: { id: { in: [departmentId, otherDepartmentId] } } });
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
