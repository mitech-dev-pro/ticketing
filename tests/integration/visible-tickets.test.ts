// Proves lib/permissions.ts's two halves never disagree (CLAUDE.md): for every seed
// user and every seed ticket, `visibleTicketsWhere(user)` — the real Prisma query every
// list/count/search/report/export must use — returns the ticket if and only if
// `can('view', user, ticket)` — the per-item check — says the user may see it.
//
// Departments, people and tickets are the real prisma/seed-data/*.json fixtures
// (minus ServiceType/TicketEvent, which `can()`/`visibleTicketsWhere()` never look at),
// loaded once into the test database.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import {
  can,
  visibleTicketsWhere,
  type PermissionTicket,
  type PermissionUser,
} from '@/lib/permissions';
import departmentsData from '@/prisma/seed-data/departments.json';
import peopleData from '@/prisma/seed-data/people.json';
import ticketsData from '@/prisma/seed-data/tickets.json';

const SLUG_PREFIX = 'vt-';
const EMAIL_SUFFIX = '.vt-test';

interface SeedDepartment {
  slug: string;
  name: string;
  hue: number;
  emailAlias: string;
  confidentialByDefault: boolean;
}

interface SeedPerson {
  name: string;
  email: string;
  role: 'MEMBER' | 'HEAD' | 'ADMIN';
  department: string;
  branch: 'ACHIMOTA_HQ' | 'KUMASI' | 'TAKORADI';
}

interface SeedTicketLeg {
  department: string;
  outMinutesAgo: number | null;
  byEmail: string;
}

interface SeedTicketEvent {
  type: string;
  byEmail: string | null;
  mentions?: { people: string[]; departments: string[] };
}

interface SeedTicket {
  number: number;
  requesterEmail: string;
  assigneeEmail: string | null;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'IN_PROGRESS' | 'AWAITING_REQUESTER' | 'RESOLVED' | 'CLOSED';
  confidential: boolean;
  legs: SeedTicketLeg[];
  events: SeedTicketEvent[];
}

const departments = departmentsData as SeedDepartment[];
const people = peopleData as SeedPerson[];
const tickets = ticketsData as SeedTicket[];

// Namespaced so this test never collides with real seed data or other integration tests
// sharing the same database.
const testEmail = (email: string) => email.replace('@milife.test', `${EMAIL_SUFFIX}@milife.test`);
const testSlug = (slug: string) => `${SLUG_PREFIX}${slug}`;

const departmentIdBySlug = new Map<string, string>();
const userIdByEmail = new Map<string, string>();
const userById = new Map<string, SeedPerson & { id: string }>();
const serviceTypeIdByDepartmentSlug = new Map<string, string>();

beforeAll(async () => {
  for (const dept of departments) {
    const record = await prisma.department.create({
      data: {
        slug: testSlug(dept.slug),
        name: dept.name,
        hue: dept.hue,
        emailAlias: testEmail(dept.emailAlias),
        confidentialByDefault: dept.confidentialByDefault,
      },
    });
    departmentIdBySlug.set(dept.slug, record.id);
  }

  for (const person of people) {
    const departmentId = departmentIdBySlug.get(person.department);
    if (!departmentId) throw new Error(`Unknown department "${person.department}"`);
    const record = await prisma.user.create({
      data: {
        name: person.name,
        email: testEmail(person.email),
        passwordHash: 'unused-in-this-test',
        role: person.role,
        departmentId,
        branch: person.branch,
      },
    });
    userIdByEmail.set(person.email, record.id);
    userById.set(record.id, { ...person, id: record.id });
  }

  for (const dept of departments) {
    const departmentId = departmentIdBySlug.get(dept.slug);
    if (!departmentId) throw new Error(`Unknown department "${dept.slug}"`);
    const serviceType = await prisma.serviceType.create({
      data: {
        departmentId,
        name: 'Visible-tickets test placeholder',
        description: 'Placeholder service type — only the Ticket FK needs it.',
        defaultPriority: 'LOW',
        needsApproval: false,
        attachmentRequired: false,
        fields: [],
      },
    });
    serviceTypeIdByDepartmentSlug.set(dept.slug, serviceType.id);
  }

  for (const ticket of tickets) {
    const requesterId = userIdByEmail.get(ticket.requesterEmail);
    if (!requesterId) throw new Error(`Ticket ${ticket.number}: unknown requester`);
    const requesterPerson = people.find((p) => p.email === ticket.requesterEmail);
    if (!requesterPerson) throw new Error(`Ticket ${ticket.number}: requester not a seed person`);
    const requesterDepartmentId = departmentIdBySlug.get(requesterPerson.department);
    if (!requesterDepartmentId) throw new Error(`Ticket ${ticket.number}: unknown requester dept`);

    const currentLeg = ticket.legs.find((leg) => leg.outMinutesAgo === null);
    if (!currentLeg) throw new Error(`Ticket ${ticket.number} has no open leg`);
    const serviceTypeId = serviceTypeIdByDepartmentSlug.get(currentLeg.department);
    if (!serviceTypeId) throw new Error(`Ticket ${ticket.number}: unknown current department`);

    const assigneeId = ticket.assigneeEmail ? userIdByEmail.get(ticket.assigneeEmail) : null;

    const now = new Date();
    await prisma.ticket.create({
      data: {
        number: ticket.number,
        subject: `vt-test ${ticket.number}`,
        description: 'placeholder',
        fields: {},
        requesterId,
        requesterDepartmentId,
        assigneeId,
        serviceTypeId,
        priority: ticket.priority,
        status: ticket.status,
        channel: 'PORTAL',
        confidential: ticket.confidential,
        createdAt: now,
        dueAt: now,
        firstResponseDueAt: now,
      },
    });

    for (const leg of ticket.legs) {
      const legDepartmentId = departmentIdBySlug.get(leg.department);
      if (!legDepartmentId) throw new Error(`Ticket ${ticket.number} leg: unknown department`);
      const legByUserId = userIdByEmail.get(leg.byEmail);
      if (!legByUserId) throw new Error(`Ticket ${ticket.number} leg: unknown user`);
      await prisma.ticketLeg.create({
        data: {
          ticketId: ticket.number,
          departmentId: legDepartmentId,
          byUserId: legByUserId,
          inAt: now,
          outAt: leg.outMinutesAgo === null ? null : now,
        },
      });
    }

    const mentionedPeople = new Set<string>();
    const mentionedDepartments = new Set<string>();
    for (const event of ticket.events) {
      for (const email of event.mentions?.people ?? []) mentionedPeople.add(email);
      for (const slug of event.mentions?.departments ?? []) mentionedDepartments.add(slug);
    }
    for (const email of mentionedPeople) {
      const mentionedUserId = userIdByEmail.get(email);
      if (!mentionedUserId) throw new Error(`Ticket ${ticket.number} mentions unknown person`);
      await prisma.ticketMention.create({
        data: { ticketId: ticket.number, type: 'PERSON', userId: mentionedUserId },
      });
    }
    for (const slug of mentionedDepartments) {
      const mentionedDepartmentId = departmentIdBySlug.get(slug);
      if (!mentionedDepartmentId) throw new Error(`Ticket ${ticket.number} mentions unknown dept`);
      await prisma.ticketMention.create({
        data: { ticketId: ticket.number, type: 'DEPARTMENT', departmentId: mentionedDepartmentId },
      });
    }
  }
}, 60_000);

afterAll(async () => {
  const numbers = tickets.map((t) => t.number);
  await prisma.ticketMention.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticketLeg.deleteMany({ where: { ticketId: { in: numbers } } });
  await prisma.ticket.deleteMany({ where: { number: { in: numbers } } });
  await prisma.serviceType.deleteMany({
    where: { departmentId: { in: [...departmentIdBySlug.values()] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [...userIdByEmail.values()] } } });
  await prisma.department.deleteMany({ where: { id: { in: [...departmentIdBySlug.values()] } } });
});

function permissionTicketFor(ticket: SeedTicket): PermissionTicket {
  const requesterPerson = people.find((p) => p.email === ticket.requesterEmail);
  if (!requesterPerson) throw new Error(`Ticket ${ticket.number}: requester not a seed person`);

  const mentionedPeople = new Set<string>();
  const mentionedDepartments = new Set<string>();
  for (const event of ticket.events) {
    for (const email of event.mentions?.people ?? []) mentionedPeople.add(email);
    for (const slug of event.mentions?.departments ?? []) mentionedDepartments.add(slug);
  }

  return {
    id: String(ticket.number),
    requesterId: userIdByEmail.get(ticket.requesterEmail)!,
    requesterDepartmentId: departmentIdBySlug.get(requesterPerson.department)!,
    assigneeId: ticket.assigneeEmail ? (userIdByEmail.get(ticket.assigneeEmail) ?? null) : null,
    confidential: ticket.confidential,
    status: ticket.status,
    legs: ticket.legs.map((leg) => ({
      departmentId: departmentIdBySlug.get(leg.department)!,
      outAt: leg.outMinutesAgo === null ? null : new Date(),
    })),
    mentions: [
      ...[...mentionedPeople].map((email) => ({
        type: 'person' as const,
        id: userIdByEmail.get(email)!,
      })),
      ...[...mentionedDepartments].map((slug) => ({
        type: 'department' as const,
        id: departmentIdBySlug.get(slug)!,
      })),
    ],
  };
}

describe('visibleTicketsWhere agrees with can("view", ...) for every seed user and ticket', () => {
  it('seeded every department, person and ticket', () => {
    expect(departmentIdBySlug.size).toBe(departments.length);
    expect(userIdByEmail.size).toBe(people.length);
  });

  for (const person of people) {
    it(`${person.email} (${person.role} of ${person.department})`, async () => {
      const dbUserId = userIdByEmail.get(person.email)!;
      const permissionUser: PermissionUser = {
        id: dbUserId,
        role: person.role,
        departmentId: departmentIdBySlug.get(person.department)!,
      };

      const visible = await prisma.ticket.findMany({
        where: {
          AND: [
            visibleTicketsWhere(permissionUser),
            { number: { in: tickets.map((t) => t.number) } },
          ],
        },
        select: { number: true },
      });
      const visibleNumbers = new Set(visible.map((t) => t.number));

      for (const ticket of tickets) {
        const expected = can('view', permissionUser, permissionTicketFor(ticket));
        const actual = visibleNumbers.has(ticket.number);
        expect(actual, `ticket ${ticket.number}: expected visible=${expected}, got ${actual}`).toBe(
          expected,
        );
      }
    });
  }
});
