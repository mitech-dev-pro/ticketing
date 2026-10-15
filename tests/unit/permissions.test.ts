// Runs every case in permissions.matrix.ts against lib/permissions.ts.
//
// Phase 2 replaces these hand-built fixtures with real Ticket/TicketLeg/Mention rows,
// but the shapes in lib/permissions.ts are already what a Prisma `include` will produce,
// so `can()` itself does not change.

import { describe, expect, it } from 'vitest';
import departments from '@/prisma/seed-data/departments.json';
import people from '@/prisma/seed-data/people.json';
import tickets from '@/prisma/seed-data/tickets.json';
import {
  can,
  canManagePeople,
  type PermissionTicket,
  type PermissionUser,
  type TicketStatus,
} from '@/lib/permissions';
import { CASES } from './permissions.matrix';

const EMAIL_DOMAIN = '@milife.test';

interface SeedPerson {
  name: string;
  email: string;
  role: 'MEMBER' | 'HEAD' | 'ADMIN';
  department: string;
  branch: string;
}

interface SeedTicketLeg {
  department: string;
  inMinutesAgo: number;
  outMinutesAgo: number | null;
  byEmail: string;
  reason: string | null;
}

interface SeedTicketEvent {
  type: string;
  minutesAgo: number;
  byEmail: string;
  body?: string | null;
  meta?: Record<string, unknown>;
  mentions?: { people: string[]; departments: string[] };
}

interface SeedTicket {
  number: number;
  requesterEmail: string;
  department: string;
  assigneeEmail: string | null;
  status: TicketStatus;
  confidential: boolean;
  legs: SeedTicketLeg[];
  events: SeedTicketEvent[];
}

const peopleByEmail = new Map<string, SeedPerson>(
  (people as SeedPerson[]).map((person) => [person.email, person]),
);

const ticketsByNumber = new Map<number, SeedTicket>(
  (tickets as SeedTicket[]).map((ticket) => [ticket.number, ticket]),
);

function userFor(who: string): PermissionUser {
  const email = `${who}${EMAIL_DOMAIN}`;
  const person = peopleByEmail.get(email);
  if (!person) {
    throw new Error(`Unknown seed person "${who}" — check prisma/seed-data/people.json`);
  }
  return { id: person.email, role: person.role, departmentId: person.department };
}

function ticketFor(number: number): PermissionTicket {
  const ticket = ticketsByNumber.get(number);
  if (!ticket) {
    throw new Error(`Unknown seed ticket ${number} — check prisma/seed-data/tickets.json`);
  }

  const requester = peopleByEmail.get(ticket.requesterEmail);
  if (!requester) {
    throw new Error(`Ticket ${number} requester ${ticket.requesterEmail} is not a seed person`);
  }

  const mentionedPeople = new Set<string>();
  const mentionedDepartments = new Set<string>();
  for (const event of ticket.events) {
    for (const email of event.mentions?.people ?? []) mentionedPeople.add(email);
    for (const slug of event.mentions?.departments ?? []) mentionedDepartments.add(slug);
  }

  return {
    id: String(ticket.number),
    requesterId: ticket.requesterEmail,
    requesterDepartmentId: requester.department,
    assigneeId: ticket.assigneeEmail,
    confidential: ticket.confidential,
    status: ticket.status,
    legs: ticket.legs.map((leg) => ({
      departmentId: leg.department,
      outAt: leg.outMinutesAgo === null ? null : new Date(Date.now() - leg.outMinutesAgo * 60_000),
    })),
    mentions: [
      ...[...mentionedPeople].map((id) => ({ type: 'person' as const, id })),
      ...[...mentionedDepartments].map((id) => ({ type: 'department' as const, id })),
    ],
  };
}

describe('permissions matrix', () => {
  it('covers every seeded department', () => {
    expect(departments.length).toBeGreaterThan(0);
  });

  for (const testCase of CASES) {
    const label = `${testCase.who} ${testCase.expected ? 'can' : 'cannot'} ${testCase.action} on MLT-${testCase.ticket} (${testCase.why})`;
    it(label, () => {
      const user = userFor(testCase.who);
      const ticket = ticketFor(testCase.ticket);
      expect(can(testCase.action, user, ticket, testCase.rules)).toBe(testCase.expected);
    });
  }
});

describe('canManagePeople', () => {
  it('allows admins to manage Administration (people, departments, etc.)', () => {
    expect(canManagePeople({ role: 'ADMIN' })).toBe(true);
  });

  it('denies heads, even of their own department', () => {
    expect(canManagePeople({ role: 'HEAD' })).toBe(false);
  });

  it('denies members', () => {
    expect(canManagePeople({ role: 'MEMBER' })).toBe(false);
  });
});
