// lib/services/search.ts and saved-views.ts (BUILD_PLAN.md Phase 5): FULLTEXT search
// composes with visibleTicketsWhere in one query, so a confidential ticket never
// surfaces to someone outside its visibility rules even when the words match; saved
// views are scoped to their owner.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { create } from '@/lib/services/tickets';
import { searchTickets } from '@/lib/services/search';
import { deleteSavedView, saveView } from '@/lib/services/saved-views';
import settingsData from '@/prisma/seed-data/settings.json';

const settings = settingsData as Record<string, unknown>;

let departmentId: string;
let otherDepartmentId: string;
let serviceTypeId: string;
let requesterId: string;
let memberInDeptId: string;
let outsiderId: string;

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
      slug: 'search-service-test-it',
      name: 'Search Service Test IT',
      hue: 210,
      emailAlias: 'search-service-test-it@milife.test',
    },
  });
  departmentId = department.id;

  const otherDepartment = await prisma.department.create({
    data: {
      slug: 'search-service-test-hr',
      name: 'Search Service Test HR',
      hue: 310,
      emailAlias: 'search-service-test-hr@milife.test',
    },
  });
  otherDepartmentId = otherDepartment.id;

  const serviceType = await prisma.serviceType.create({
    data: {
      departmentId,
      name: 'Search service test type',
      description: 'placeholder',
      defaultPriority: 'MEDIUM',
      needsApproval: false,
      attachmentRequired: false,
      fields: [],
    },
  });
  serviceTypeId = serviceType.id;

  const [requester, memberInDept, outsider] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Search Requester',
        email: 'search-service-requester@milife.test',
        passwordHash: 'unused-in-this-test',
        role: 'MEMBER',
        departmentId,
        branch: 'ACHIMOTA_HQ',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Search Member In Dept',
        email: 'search-service-member@milife.test',
        passwordHash: 'unused-in-this-test',
        role: 'MEMBER',
        departmentId,
        branch: 'ACHIMOTA_HQ',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Search Outsider',
        email: 'search-service-outsider@milife.test',
        passwordHash: 'unused-in-this-test',
        role: 'MEMBER',
        departmentId: otherDepartmentId,
        branch: 'ACHIMOTA_HQ',
      },
    }),
  ]);
  requesterId = requester.id;
  memberInDeptId = memberInDept.id;
  outsiderId = outsider.id;
}, 30_000);

afterAll(async () => {
  const createdTickets = await prisma.ticket.findMany({
    where: { serviceTypeId },
    select: { number: true },
  });
  const numbers = createdTickets.map((t) => t.number);

  await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticketLeg.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticket.deleteMany({ where: { number: { in: numbers } } });
  await prisma.savedView.deleteMany({
    where: { userId: { in: [requesterId, memberInDeptId, outsiderId] } },
  });
  await prisma.serviceType.deleteMany({ where: { departmentId } });
  await prisma.user.deleteMany({
    where: { id: { in: [requesterId, memberInDeptId, outsiderId] } },
  });
  await prisma.department.deleteMany({ where: { id: { in: [departmentId, otherDepartmentId] } } });
});

async function createTicket(params: {
  subject: string;
  description: string;
  confidential: boolean;
}) {
  return create({
    requesterId,
    requesterDepartmentId: departmentId,
    serviceTypeId,
    subject: params.subject,
    description: params.description,
    priority: 'MEDIUM',
    channel: 'PORTAL',
    confidential: params.confidential,
    fields: {},
  });
}

describe('searchTickets', () => {
  it('matches a word in the subject or description', async () => {
    const { number } = await createTicket({
      subject: 'Printer jammed on the fourth floor',
      description: 'Paper tray keeps misfeeding every morning.',
      confidential: false,
    });

    const results = await searchTickets(
      { id: memberInDeptId, role: 'MEMBER', departmentId },
      'printer',
    );

    expect(results.some((r) => r.number === number)).toBe(true);
  });

  it('matches a prefix (boolean-mode wildcard), not just whole words', async () => {
    const { number } = await createTicket({
      subject: 'Onboarding paperwork for new hire',
      description: 'Needs a laptop and email account provisioned.',
      confidential: false,
    });

    const results = await searchTickets(
      { id: memberInDeptId, role: 'MEMBER', departmentId },
      'onboard',
    );

    expect(results.some((r) => r.number === number)).toBe(true);
  });

  it('never returns a confidential ticket to someone outside its visibility rules, even on a word match', async () => {
    const { number } = await createTicket({
      subject: 'Confidential salary dispute inquiry',
      description: 'Employee disputes a deduction on their payslip.',
      confidential: true,
    });

    const outsiderResults = await searchTickets(
      { id: outsiderId, role: 'MEMBER', departmentId: otherDepartmentId },
      'salary',
    );
    expect(outsiderResults.some((r) => r.number === number)).toBe(false);

    // The requester can still find their own confidential ticket.
    const requesterResults = await searchTickets(
      { id: requesterId, role: 'MEMBER', departmentId },
      'salary',
    );
    expect(requesterResults.some((r) => r.number === number)).toBe(true);
  });

  it('strips boolean-mode operator characters instead of erroring', async () => {
    await expect(
      searchTickets({ id: memberInDeptId, role: 'MEMBER', departmentId }, '+-*"()<>~@'),
    ).resolves.toEqual([]);
  });
});

describe('saved views', () => {
  it('saveView creates a view, and saving the same name again replaces it', async () => {
    await saveView({
      userId: memberInDeptId,
      name: 'Due soon',
      filters: { tab: 'all-open', due4h: true },
    });
    const first = await prisma.savedView.findUniqueOrThrow({
      where: { userId_name: { userId: memberInDeptId, name: 'Due soon' } },
    });
    expect(first.filters).toEqual({ tab: 'all-open', due4h: true });

    await saveView({
      userId: memberInDeptId,
      name: 'Due soon',
      filters: { tab: 'unassigned', due4h: true, priority: 'URGENT' },
    });
    const views = await prisma.savedView.findMany({ where: { userId: memberInDeptId } });
    expect(views).toHaveLength(1);
    expect(views[0]?.filters).toEqual({ tab: 'unassigned', due4h: true, priority: 'URGENT' });
  });

  it('deleteSavedView only deletes the owner’s own view', async () => {
    const { id } = await saveView({
      userId: outsiderId,
      name: 'Urgent',
      filters: { tab: 'all-open', due4h: false, priority: 'URGENT' },
    });

    await deleteSavedView({ id, userId: memberInDeptId }); // wrong owner — no-op
    expect(await prisma.savedView.findUnique({ where: { id } })).not.toBeNull();

    await deleteSavedView({ id, userId: outsiderId }); // correct owner
    expect(await prisma.savedView.findUnique({ where: { id } })).toBeNull();
  });
});
