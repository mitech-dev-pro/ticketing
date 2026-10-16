// lib/services/escalations.ts, notifications.ts, out-of-office.ts and the
// findAutoCloseCandidates/autoClose pair in tickets.ts (BUILD_PLAN.md Phase 4):
// escalation idempotency, manual-vs-cron collision, auto-close skipping rated or
// reopened tickets, notification dedup, and out-of-office reassignment.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { acknowledgeEscalation, AlreadyEscalatedError, escalate } from '@/lib/services/escalations';
import { notify } from '@/lib/services/notifications';
import { reassignOpenTickets, setOutOfOffice } from '@/lib/services/out-of-office';
import {
  autoClose,
  create,
  findAutoCloseCandidates,
  rate,
  reopen,
  setStatus,
} from '@/lib/services/tickets';
import settingsData from '@/prisma/seed-data/settings.json';

const settings = settingsData as Record<string, unknown>;

let departmentId: string;
let serviceTypeId: string;
let requesterId: string;
let handlerId: string;
let headId: string;
let secondHandlerId: string;

beforeAll(async () => {
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
  }

  const department = await prisma.department.create({
    data: {
      slug: 'escalation-service-test-it',
      name: 'Escalation Service Test IT',
      hue: 200,
      emailAlias: 'escalation-service-test-it@milife.test',
    },
  });
  departmentId = department.id;

  const serviceType = await prisma.serviceType.create({
    data: {
      departmentId,
      name: 'Escalation service test type',
      description: 'placeholder',
      defaultPriority: 'MEDIUM',
      needsApproval: false,
      attachmentRequired: false,
      fields: [],
    },
  });
  serviceTypeId = serviceType.id;

  const [requester, handler, head, secondHandler] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Escalation Requester',
        email: 'escalation-service-requester@milife.test',
        passwordHash: 'unused-in-this-test',
        role: 'MEMBER',
        departmentId,
        branch: 'ACHIMOTA_HQ',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Escalation Handler',
        email: 'escalation-service-handler@milife.test',
        passwordHash: 'unused-in-this-test',
        role: 'MEMBER',
        departmentId,
        branch: 'ACHIMOTA_HQ',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Escalation Head',
        email: 'escalation-service-head@milife.test',
        passwordHash: 'unused-in-this-test',
        role: 'HEAD',
        departmentId,
        branch: 'ACHIMOTA_HQ',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Escalation Second Handler',
        email: 'escalation-service-handler-2@milife.test',
        passwordHash: 'unused-in-this-test',
        role: 'MEMBER',
        departmentId,
        branch: 'ACHIMOTA_HQ',
      },
    }),
  ]);
  requesterId = requester.id;
  handlerId = handler.id;
  headId = head.id;
  secondHandlerId = secondHandler.id;

  await prisma.department.update({ where: { id: departmentId }, data: { headUserId: headId } });
}, 30_000);

afterAll(async () => {
  const createdTickets = await prisma.ticket.findMany({
    where: { serviceTypeId },
    select: { number: true },
  });
  const numbers = createdTickets.map((t) => t.number);

  await prisma.notification.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.escalation.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticketLeg.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticket.deleteMany({ where: { number: { in: numbers } } });
  await prisma.outOfOffice.deleteMany({
    where: { userId: { in: [requesterId, handlerId, headId, secondHandlerId] } },
  });
  await prisma.serviceType.deleteMany({ where: { departmentId } });
  await prisma.department.update({ where: { id: departmentId }, data: { headUserId: null } });
  await prisma.user.deleteMany({
    where: { id: { in: [requesterId, handlerId, headId, secondHandlerId] } },
  });
  await prisma.department.deleteMany({ where: { id: departmentId } });
});

async function createTestTicket() {
  return create({
    requesterId,
    requesterDepartmentId: departmentId,
    serviceTypeId,
    subject: 'Escalation service test ticket',
    description: 'A ticket created for lib/services/escalations.ts integration tests.',
    priority: 'URGENT',
    channel: 'PORTAL',
    confidential: false,
    fields: {},
  });
}

describe('escalate — idempotency and manual/cron collision (D-15)', () => {
  it('creates an Escalation row and writes an ESCALATED event', async () => {
    const { number } = await createTestTicket();
    await escalate({ ticketNumber: number, level: 1, byUserId: null, reason: null });

    const escalations = await prisma.escalation.findMany({ where: { ticketId: number } });
    expect(escalations).toHaveLength(1);
    expect(escalations[0]?.level).toBe(1);

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId: number, type: 'ESCALATED' },
    });
    expect(events).toHaveLength(1);
  });

  it('running the same escalation twice (the job re-running) still leaves exactly one row', async () => {
    const { number } = await createTestTicket();
    await escalate({ ticketNumber: number, level: 1, byUserId: null, reason: null });

    await expect(
      escalate({ ticketNumber: number, level: 1, byUserId: null, reason: null }),
    ).rejects.toThrow(AlreadyEscalatedError);

    const escalations = await prisma.escalation.findMany({ where: { ticketId: number, level: 1 } });
    expect(escalations).toHaveLength(1);
  });

  it('a manual escalation and the cron escalation to the same level cannot collide', async () => {
    const { number } = await createTestTicket();
    // Cron escalates first (byUserId null)...
    await escalate({ ticketNumber: number, level: 1, byUserId: null, reason: null });
    // ...then a human tries to escalate the same ticket to the same level.
    await expect(
      escalate({ ticketNumber: number, level: 1, byUserId: handlerId, reason: 'Still waiting' }),
    ).rejects.toThrow(AlreadyEscalatedError);

    // And the reverse order.
    const { number: number2 } = await createTestTicket();
    await escalate({ ticketNumber: number2, level: 1, byUserId: requesterId, reason: 'Urgent' });
    await expect(
      escalate({ ticketNumber: number2, level: 1, byUserId: null, reason: null }),
    ).rejects.toThrow(AlreadyEscalatedError);

    const escalations = await prisma.escalation.findMany({ where: { ticketId: number2 } });
    expect(escalations).toHaveLength(1);
    expect(escalations[0]?.byUserId).toBe(requesterId); // the manual one won
  });

  it('level 1 and level 2 on the same ticket are independent rows', async () => {
    const { number } = await createTestTicket();
    await escalate({ ticketNumber: number, level: 1, byUserId: null, reason: null });
    await escalate({ ticketNumber: number, level: 2, byUserId: null, reason: null });

    const escalations = await prisma.escalation.findMany({ where: { ticketId: number } });
    expect(escalations.map((e) => e.level).sort()).toEqual([1, 2]);
  });

  it('acknowledgeEscalation stamps acknowledgedAt and acknowledgedById', async () => {
    const { number } = await createTestTicket();
    await escalate({ ticketNumber: number, level: 1, byUserId: null, reason: null });
    const escalation = await prisma.escalation.findFirstOrThrow({ where: { ticketId: number } });

    await acknowledgeEscalation({ escalationId: escalation.id, byUserId: headId });

    const acknowledged = await prisma.escalation.findUniqueOrThrow({
      where: { id: escalation.id },
    });
    expect(acknowledged.acknowledgedById).toBe(headId);
    expect(acknowledged.acknowledgedAt).not.toBeNull();
  });
});

describe('notify — idempotent per (userId, ticketId, kind)', () => {
  it('returns true the first time and false on a repeat, without duplicating the row', async () => {
    const { number } = await createTestTicket();

    const first = await notify({ userId: handlerId, ticketId: number, kind: 'SLA_WARNING' });
    const second = await notify({ userId: handlerId, ticketId: number, kind: 'SLA_WARNING' });

    expect(first).toBe(true);
    expect(second).toBe(false);

    const rows = await prisma.notification.findMany({
      where: { userId: handlerId, ticketId: number, kind: 'SLA_WARNING' },
    });
    expect(rows).toHaveLength(1);
  });
});

describe('findAutoCloseCandidates / autoClose — skip rated or reopened', () => {
  const OLD_CUTOFF = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago

  async function createOldResolvedTicket() {
    const { number } = await createTestTicket();
    await setStatus({ ticketNumber: number, status: 'RESOLVED', byUserId: handlerId });
    // Back-date resolvedAt past the cutoff, as if this happened days ago.
    await prisma.ticket.update({
      where: { number },
      data: { resolvedAt: new Date(OLD_CUTOFF.getTime() - 60_000) },
    });
    return number;
  }

  it('includes a plain old resolved ticket', async () => {
    const number = await createOldResolvedTicket();
    const candidates = await findAutoCloseCandidates(OLD_CUTOFF);
    expect(candidates).toContain(number);
  });

  it('skips a rated ticket', async () => {
    const number = await createOldResolvedTicket();
    await rate({ ticketNumber: number, byUserId: requesterId, stars: 5, reasons: [], note: null });

    const candidates = await findAutoCloseCandidates(OLD_CUTOFF);
    expect(candidates).not.toContain(number);
  });

  it('skips a reopened ticket', async () => {
    const number = await createOldResolvedTicket();
    await reopen({ ticketNumber: number, byUserId: requesterId });
    // Re-resolve it so it's RESOLVED again (eligible by status) but still carries the
    // REOPENED event in its history.
    await setStatus({ ticketNumber: number, status: 'RESOLVED', byUserId: handlerId });
    await prisma.ticket.update({
      where: { number },
      data: { resolvedAt: new Date(OLD_CUTOFF.getTime() - 60_000) },
    });

    const candidates = await findAutoCloseCandidates(OLD_CUTOFF);
    expect(candidates).not.toContain(number);
  });

  it('autoClose moves status to CLOSED and writes a STATUS_CHANGED event', async () => {
    const number = await createOldResolvedTicket();
    await autoClose({ ticketNumber: number });

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.status).toBe('CLOSED');

    const events = await prisma.ticketEvent.findMany({
      where: { ticketId: number, type: 'STATUS_CHANGED' },
    });
    expect(events.some((e) => (e.meta as { via?: string } | null)?.via === 'auto-close')).toBe(
      true,
    );
  });
});

describe('out-of-office — reassignOpenTickets', () => {
  it('reassigns the departing user’s open tickets to the delegate, and is idempotent', async () => {
    const { number } = await createTestTicket();
    await prisma.ticket.update({ where: { number }, data: { assigneeId: handlerId } });

    await setOutOfOffice({
      userId: handlerId,
      delegateUserId: secondHandlerId,
      until: new Date(Date.now() + 60 * 60 * 1000),
    });

    const firstRun = await reassignOpenTickets();
    expect(firstRun.some((r) => r.ticketNumber === number && r.toUserId === secondHandlerId)).toBe(
      true,
    );

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.assigneeId).toBe(secondHandlerId);

    // Running again must not re-reassign (the ticket is no longer assigned to handlerId).
    const secondRun = await reassignOpenTickets();
    expect(secondRun.some((r) => r.ticketNumber === number)).toBe(false);
  });

  it('leaves a resolved ticket assigned to the out-of-office user alone', async () => {
    const { number } = await createTestTicket();
    await prisma.ticket.update({ where: { number }, data: { assigneeId: handlerId } });
    await setStatus({ ticketNumber: number, status: 'RESOLVED', byUserId: handlerId });

    await setOutOfOffice({
      userId: handlerId,
      delegateUserId: secondHandlerId,
      until: new Date(Date.now() + 60 * 60 * 1000),
    });

    await reassignOpenTickets();

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.assigneeId).toBe(handlerId);
  });
});
