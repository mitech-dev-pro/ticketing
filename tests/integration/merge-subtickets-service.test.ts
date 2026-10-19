// lib/services/merge.ts and sub-tickets.ts (BUILD_PLAN.md Phase 6). The named check
// for this phase: "merging writes MERGED / MERGED_IN events on both tickets."

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { create } from '@/lib/services/tickets';
import {
  AlreadyMergedError,
  findPossibleDuplicates,
  mergeTicket,
  SelfMergeError,
  TicketNotFoundError,
} from '@/lib/services/merge';
import {
  addSubTicket,
  listSubTickets,
  ParentTicketNotFoundError,
} from '@/lib/services/sub-tickets';
import type { PermissionUser } from '@/lib/permissions';

let departmentId: string;
let serviceTypeId: string;
let requesterId: string;
let handlerId: string;

beforeAll(async () => {
  const department = await prisma.department.create({
    data: {
      slug: 'phase6-merge-test-it',
      name: 'Phase 6 Merge Test IT',
      hue: 215,
      emailAlias: 'phase6-merge-test-it@milife.test',
    },
  });
  departmentId = department.id;

  const serviceType = await prisma.serviceType.create({
    data: {
      departmentId,
      name: 'Phase 6 merge test type',
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
        name: 'Phase 6 Merge Requester',
        email: 'phase6-merge-requester@milife.test',
        passwordHash: 'unused-in-this-test',
        role: 'MEMBER',
        departmentId,
        branch: 'ACHIMOTA_HQ',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Phase 6 Merge Handler',
        email: 'phase6-merge-handler@milife.test',
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

  // Clear self-referencing FKs first so the tickets themselves can be deleted.
  await prisma.ticket.updateMany({
    where: { number: { in: numbers } },
    data: { parentId: null, mergedIntoId: null },
  });
  await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticketLeg.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticket.deleteMany({ where: { number: { in: numbers } } });
  await prisma.serviceType.deleteMany({ where: { departmentId } });
  await prisma.user.deleteMany({ where: { id: { in: [requesterId, handlerId] } } });
  await prisma.department.deleteMany({ where: { id: departmentId } });
});

async function createTestTicket(subject = 'Phase 6 merge/sub-ticket test ticket') {
  return create({
    requesterId,
    requesterDepartmentId: departmentId,
    serviceTypeId,
    subject,
    description: 'A ticket created for lib/services/{merge,sub-tickets}.ts integration tests.',
    priority: 'MEDIUM',
    channel: 'PORTAL',
    confidential: false,
    fields: {},
  });
}

describe('mergeTicket', () => {
  it('writes MERGED on the source and MERGED_IN on the target, and closes the source', async () => {
    const { number: source } = await createTestTicket();
    const { number: target } = await createTestTicket();

    await mergeTicket({ ticketNumber: source, intoTicketNumber: target, byUserId: handlerId });

    const sourceTicket = await prisma.ticket.findUniqueOrThrow({ where: { number: source } });
    expect(sourceTicket.status).toBe('CLOSED');
    expect(sourceTicket.mergedIntoId).toBe(target);

    const mergedEvents = await prisma.ticketEvent.findMany({
      where: { ticketId: source, type: 'MERGED' },
    });
    expect(mergedEvents).toHaveLength(1);
    expect((mergedEvents[0]?.meta as { intoNumber?: number } | null)?.intoNumber).toBe(target);

    const mergedInEvents = await prisma.ticketEvent.findMany({
      where: { ticketId: target, type: 'MERGED_IN' },
    });
    expect(mergedInEvents).toHaveLength(1);
    expect((mergedInEvents[0]?.meta as { fromNumber?: number } | null)?.fromNumber).toBe(source);
  });

  it('rejects merging a ticket into itself', async () => {
    const { number } = await createTestTicket();
    await expect(
      mergeTicket({ ticketNumber: number, intoTicketNumber: number, byUserId: handlerId }),
    ).rejects.toThrow(SelfMergeError);
  });

  it('rejects merging into a ticket that does not exist', async () => {
    const { number } = await createTestTicket();
    await expect(
      mergeTicket({ ticketNumber: number, intoTicketNumber: 999_999, byUserId: handlerId }),
    ).rejects.toThrow(TicketNotFoundError);
  });

  it('rejects merging an already-merged ticket a second time', async () => {
    const { number: source } = await createTestTicket();
    const { number: target } = await createTestTicket();
    const { number: anotherTarget } = await createTestTicket();
    await mergeTicket({ ticketNumber: source, intoTicketNumber: target, byUserId: handlerId });

    await expect(
      mergeTicket({ ticketNumber: source, intoTicketNumber: anotherTarget, byUserId: handlerId }),
    ).rejects.toThrow(AlreadyMergedError);
  });
});

describe('findPossibleDuplicates', () => {
  const user: PermissionUser = { id: '', role: 'ADMIN', departmentId: '' };

  it('finds another open ticket in the same department sharing subject words', async () => {
    const { number: ticketA } = await createTestTicket('Laptop screen keeps flickering');
    const { number: ticketB } = await createTestTicket('My laptop screen is flickering again');

    const duplicates = await findPossibleDuplicates({
      ticketNumber: ticketB,
      subject: 'My laptop screen is flickering again',
      currentDepartmentId: departmentId,
      user,
    });

    expect(duplicates.some((d) => d.number === ticketA)).toBe(true);
    expect(duplicates.some((d) => d.number === ticketB)).toBe(false);
  });

  it('excludes a ticket that has already been merged away', async () => {
    const { number: ticketA } = await createTestTicket('Printer is jamming on floor 2');
    const { number: ticketB } = await createTestTicket('Printer jamming on floor 2 again');
    await mergeTicket({ ticketNumber: ticketA, intoTicketNumber: ticketB, byUserId: handlerId });

    const duplicates = await findPossibleDuplicates({
      ticketNumber: ticketB,
      subject: 'Printer jamming on floor 2 again',
      currentDepartmentId: departmentId,
      user,
    });

    expect(duplicates.some((d) => d.number === ticketA)).toBe(false);
  });
});

describe('addSubTicket / listSubTickets', () => {
  it('creates a child ticket inheriting the parent requester and department, and writes CHILD on the parent', async () => {
    const { number: parentNumber } = await createTestTicket();

    const child = await addSubTicket({
      parentTicketNumber: parentNumber,
      byUserId: handlerId,
      serviceTypeId,
      subject: 'Sub-ticket: order replacement part',
      description: 'Order the replacement part separately.',
      priority: 'LOW',
      fields: {},
    });

    const childTicket = await prisma.ticket.findUniqueOrThrow({ where: { number: child.number } });
    expect(childTicket.parentId).toBe(parentNumber);
    expect(childTicket.requesterId).toBe(requesterId);
    expect(childTicket.requesterDepartmentId).toBe(departmentId);

    const childEvents = await prisma.ticketEvent.findMany({
      where: { ticketId: parentNumber, type: 'CHILD' },
    });
    expect(childEvents).toHaveLength(1);
    expect((childEvents[0]?.meta as { childNumber?: number } | null)?.childNumber).toBe(
      child.number,
    );

    const subTickets = await listSubTickets(parentNumber);
    expect(subTickets.map((s) => s.number)).toEqual([child.number]);
  });

  it('inherits the parent ticket’s confidentiality', async () => {
    const confidentialParent = await create({
      requesterId,
      requesterDepartmentId: departmentId,
      serviceTypeId,
      subject: 'Confidential parent ticket',
      description: 'Confidential parent for sub-ticket inheritance test.',
      priority: 'MEDIUM',
      channel: 'PORTAL',
      confidential: true,
      fields: {},
    });

    const child = await addSubTicket({
      parentTicketNumber: confidentialParent.number,
      byUserId: handlerId,
      serviceTypeId,
      subject: 'Sub-ticket of a confidential ticket',
      description: 'Should stay confidential too.',
      priority: 'MEDIUM',
      fields: {},
    });

    const childTicket = await prisma.ticket.findUniqueOrThrow({ where: { number: child.number } });
    expect(childTicket.confidential).toBe(true);
  });

  it('rejects adding a sub-ticket to a parent that does not exist', async () => {
    await expect(
      addSubTicket({
        parentTicketNumber: 999_999,
        byUserId: handlerId,
        serviceTypeId,
        subject: 'Orphan sub-ticket',
        description: 'Should fail.',
        priority: 'MEDIUM',
        fields: {},
      }),
    ).rejects.toThrow(ParentTicketNotFoundError);
  });
});
