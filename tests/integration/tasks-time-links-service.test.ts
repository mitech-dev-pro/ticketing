// lib/services/tasks.ts, time.ts and links.ts (BUILD_PLAN.md Phase 6): the Tasks
// checklist, the start/stop timer + quick time entries, and linked tickets always
// writing their inverse row.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { create } from '@/lib/services/tickets';
import { addTask, removeTask, TaskNotFoundError, toggleTask } from '@/lib/services/tasks';
import {
  logQuickTime,
  NoRunningTimerError,
  runningTimer,
  startTimer,
  stopTimer,
  TimerAlreadyRunningError,
} from '@/lib/services/time';
import {
  addLink,
  AlreadyLinkedError,
  isBlocked,
  listLinks,
  removeLink,
  SelfLinkError,
  TicketNotFoundError,
} from '@/lib/services/links';
import { setStatus } from '@/lib/services/tickets';

let departmentId: string;
let serviceTypeId: string;
let requesterId: string;
let handlerId: string;

beforeAll(async () => {
  const department = await prisma.department.create({
    data: {
      slug: 'phase6-service-test-it',
      name: 'Phase 6 Service Test IT',
      hue: 210,
      emailAlias: 'phase6-service-test-it@milife.test',
    },
  });
  departmentId = department.id;

  const serviceType = await prisma.serviceType.create({
    data: {
      departmentId,
      name: 'Phase 6 service test type',
      description: 'placeholder',
      defaultPriority: 'MEDIUM',
      needsApproval: false,
      attachmentRequired: false,
      fields: [],
    },
  });
  serviceTypeId = serviceType.id;

  const [requester, handler] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Phase 6 Requester',
        email: 'phase6-service-requester@milife.test',
        passwordHash: 'unused-in-this-test',
        role: 'MEMBER',
        departmentId,
        branch: 'ACHIMOTA_HQ',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Phase 6 Handler',
        email: 'phase6-service-handler@milife.test',
        passwordHash: 'unused-in-this-test',
        role: 'MEMBER',
        departmentId,
        branch: 'ACHIMOTA_HQ',
      },
    }),
  ]);
  requesterId = requester.id;
  handlerId = handler.id;
}, 30_000);

afterAll(async () => {
  const createdTickets = await prisma.ticket.findMany({
    where: { serviceTypeId },
    select: { number: true },
  });
  const numbers = createdTickets.map((t) => t.number);

  await prisma.ticketLink.deleteMany({
    where: { OR: [{ fromId: { in: numbers } }, { toId: { in: numbers } }] },
  });
  await prisma.ticketTimer.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.timeEntry.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.task.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticketLeg.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticket.deleteMany({ where: { number: { in: numbers } } });
  await prisma.serviceType.deleteMany({ where: { departmentId } });
  await prisma.user.deleteMany({ where: { id: { in: [requesterId, handlerId] } } });
  await prisma.department.deleteMany({ where: { id: departmentId } });
});

async function createTestTicket() {
  return create({
    requesterId,
    requesterDepartmentId: departmentId,
    serviceTypeId,
    subject: 'Phase 6 service test ticket',
    description: 'A ticket created for lib/services/{tasks,time,links}.ts integration tests.',
    priority: 'MEDIUM',
    channel: 'PORTAL',
    confidential: false,
    fields: {},
  });
}

describe('tasks — checklist', () => {
  it('adds, toggles and removes a task, each writing a TASK event', async () => {
    const { number } = await createTestTicket();

    await addTask({ ticketNumber: number, text: 'Check the switch', byUserId: handlerId });
    const [task] = await prisma.task.findMany({ where: { ticketId: number } });
    expect(task?.done).toBe(false);
    expect(task?.order).toBe(0);

    await toggleTask({ ticketNumber: number, taskId: task!.id, byUserId: handlerId });
    const toggled = await prisma.task.findUniqueOrThrow({ where: { id: task!.id } });
    expect(toggled.done).toBe(true);

    await removeTask({ ticketNumber: number, taskId: task!.id, byUserId: handlerId });
    const remaining = await prisma.task.findMany({ where: { ticketId: number } });
    expect(remaining).toHaveLength(0);

    const events = await prisma.ticketEvent.findMany({ where: { ticketId: number, type: 'TASK' } });
    expect(events.map((e) => (e.meta as { action?: string } | null)?.action)).toEqual([
      'added',
      'completed',
      'removed',
    ]);
  });

  it('new tasks append after existing ones in order', async () => {
    const { number } = await createTestTicket();
    await addTask({ ticketNumber: number, text: 'First', byUserId: handlerId });
    await addTask({ ticketNumber: number, text: 'Second', byUserId: handlerId });

    const tasks = await prisma.task.findMany({
      where: { ticketId: number },
      orderBy: { order: 'asc' },
    });
    expect(tasks.map((t) => t.order)).toEqual([0, 1]);
  });

  it('toggling a task that belongs to a different ticket throws', async () => {
    const { number: ticketA } = await createTestTicket();
    const { number: ticketB } = await createTestTicket();
    await addTask({ ticketNumber: ticketA, text: 'Only on A', byUserId: handlerId });
    const [task] = await prisma.task.findMany({ where: { ticketId: ticketA } });

    await expect(
      toggleTask({ ticketNumber: ticketB, taskId: task!.id, byUserId: handlerId }),
    ).rejects.toThrow(TaskNotFoundError);
  });
});

describe('time — start/stop timer and quick entries', () => {
  it('start then stop creates exactly one TimeEntry and clears the running timer', async () => {
    const { number } = await createTestTicket();

    await startTimer({ ticketNumber: number, userId: handlerId });
    expect(await runningTimer({ ticketNumber: number, userId: handlerId })).not.toBeNull();

    const { minutes } = await stopTimer({ ticketNumber: number, userId: handlerId });
    expect(minutes).toBeGreaterThanOrEqual(1);

    expect(await runningTimer({ ticketNumber: number, userId: handlerId })).toBeNull();
    const entries = await prisma.timeEntry.findMany({ where: { ticketId: number } });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.minutes).toBe(minutes);

    const events = await prisma.ticketEvent.findMany({ where: { ticketId: number, type: 'TIME' } });
    expect(events).toHaveLength(1);
  });

  it('starting a second timer for the same person on the same ticket is rejected', async () => {
    const { number } = await createTestTicket();
    await startTimer({ ticketNumber: number, userId: handlerId });

    await expect(startTimer({ ticketNumber: number, userId: handlerId })).rejects.toThrow(
      TimerAlreadyRunningError,
    );

    await stopTimer({ ticketNumber: number, userId: handlerId });
  });

  it('stopping with nothing running is rejected', async () => {
    const { number } = await createTestTicket();
    await expect(stopTimer({ ticketNumber: number, userId: handlerId })).rejects.toThrow(
      NoRunningTimerError,
    );
  });

  it('two different people can each run their own timer on the same ticket', async () => {
    const { number } = await createTestTicket();
    await startTimer({ ticketNumber: number, userId: handlerId });
    await startTimer({ ticketNumber: number, userId: requesterId });

    expect(await runningTimer({ ticketNumber: number, userId: handlerId })).not.toBeNull();
    expect(await runningTimer({ ticketNumber: number, userId: requesterId })).not.toBeNull();

    await stopTimer({ ticketNumber: number, userId: handlerId });
    await stopTimer({ ticketNumber: number, userId: requesterId });
  });

  it('a quick time button logs an entry without touching the running timer', async () => {
    const { number } = await createTestTicket();
    await logQuickTime({ ticketNumber: number, userId: handlerId, minutes: 30 });

    const entries = await prisma.timeEntry.findMany({ where: { ticketId: number } });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.minutes).toBe(30);
    expect(await runningTimer({ ticketNumber: number, userId: handlerId })).toBeNull();
  });
});

describe('links — always create the inverse', () => {
  it('blocked_by on one ticket creates blocks on the other', async () => {
    const { number: a } = await createTestTicket();
    const { number: b } = await createTestTicket();

    await addLink({
      ticketNumber: a,
      targetTicketNumber: b,
      type: 'BLOCKED_BY',
      byUserId: handlerId,
    });

    const fromA = await listLinks(a);
    expect(fromA).toEqual([{ type: 'BLOCKED_BY', ticket: expect.objectContaining({ number: b }) }]);

    const fromB = await listLinks(b);
    expect(fromB).toEqual([{ type: 'BLOCKS', ticket: expect.objectContaining({ number: a }) }]);

    const eventsA = await prisma.ticketEvent.findMany({
      where: { ticketId: a, type: 'BLOCKED_BY' },
    });
    const eventsB = await prisma.ticketEvent.findMany({ where: { ticketId: b, type: 'BLOCKS' } });
    expect(eventsA).toHaveLength(1);
    expect(eventsB).toHaveLength(1);
  });

  it('related_to mirrors itself on both sides', async () => {
    const { number: a } = await createTestTicket();
    const { number: b } = await createTestTicket();

    await addLink({
      ticketNumber: a,
      targetTicketNumber: b,
      type: 'RELATED_TO',
      byUserId: handlerId,
    });

    expect(await listLinks(a)).toEqual([
      { type: 'RELATED_TO', ticket: expect.objectContaining({ number: b }) },
    ]);
    expect(await listLinks(b)).toEqual([
      { type: 'RELATED_TO', ticket: expect.objectContaining({ number: a }) },
    ]);
  });

  it('a ticket cannot be linked to itself', async () => {
    const { number: a } = await createTestTicket();
    await expect(
      addLink({ ticketNumber: a, targetTicketNumber: a, type: 'RELATED_TO', byUserId: handlerId }),
    ).rejects.toThrow(SelfLinkError);
  });

  it('linking to a ticket that does not exist is rejected', async () => {
    const { number: a } = await createTestTicket();
    await expect(
      addLink({
        ticketNumber: a,
        targetTicketNumber: 999_999,
        type: 'RELATED_TO',
        byUserId: handlerId,
      }),
    ).rejects.toThrow(TicketNotFoundError);
  });

  it('linking the same pair the same way twice is rejected', async () => {
    const { number: a } = await createTestTicket();
    const { number: b } = await createTestTicket();
    await addLink({
      ticketNumber: a,
      targetTicketNumber: b,
      type: 'RELATED_TO',
      byUserId: handlerId,
    });

    await expect(
      addLink({ ticketNumber: a, targetTicketNumber: b, type: 'RELATED_TO', byUserId: handlerId }),
    ).rejects.toThrow(AlreadyLinkedError);
  });

  it('removeLink deletes both directions', async () => {
    const { number: a } = await createTestTicket();
    const { number: b } = await createTestTicket();
    await addLink({ ticketNumber: a, targetTicketNumber: b, type: 'BLOCKS', byUserId: handlerId });

    await removeLink({
      ticketNumber: a,
      targetTicketNumber: b,
      type: 'BLOCKS',
      byUserId: handlerId,
    });

    expect(await listLinks(a)).toHaveLength(0);
    expect(await listLinks(b)).toHaveLength(0);
  });

  it('isBlocked is true only while the blocking ticket is still open', async () => {
    const { number: a } = await createTestTicket();
    const { number: b } = await createTestTicket();
    await addLink({
      ticketNumber: a,
      targetTicketNumber: b,
      type: 'BLOCKED_BY',
      byUserId: handlerId,
    });

    expect(await isBlocked(a)).toBe(true);

    await setStatus({ ticketNumber: b, status: 'RESOLVED', byUserId: handlerId });
    expect(await isBlocked(a)).toBe(false);
  });
});
