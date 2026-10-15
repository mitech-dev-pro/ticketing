// Phase 1 seed: departments, people, service types and settings from prisma/seed-data/*.json.
// Phase 2 adds the 22 sample tickets with their legs and events (D-13): every deadline is
// recomputed with lib/sla.ts from createdMinutesAgo, never copied from the JSON, so seed
// data obeys the same rules as real data. No prisma/seed-data/holidays.json exists yet,
// so the business calendar (unused while every priority defaults to 24x7, D-01) seeds with
// an empty Holiday table.
//
// Run with `npx prisma db seed` (wired via prisma.config.ts) or `npm run prisma:seed`.
// Requires SEED_PASSWORD (one shared password, hashed, for every seeded user — this is
// fixture data for @milife.test addresses only, never real accounts).
// Refuses to run against NODE_ENV=production unless ALLOW_PROD_SEED=1 is set.

import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { prisma } from '@/lib/db';
import {
  Prisma,
  type Branch,
  type Channel,
  type Priority,
  type Role,
  type TicketEventType,
  type TicketStatus,
} from '@/generated/prisma/client';
import { computeDueAt, computeFirstResponseDueAt } from '@/lib/sla';
import { getSlaSettings, getHolidays, calendarForPriority } from '@/lib/settings';
import departmentsData from './seed-data/departments.json';
import peopleData from './seed-data/people.json';
import serviceTypesData from './seed-data/service-types.json';
import settingsData from './seed-data/settings.json';
import ticketsData from './seed-data/tickets.json';

interface SeedDepartment {
  slug: string;
  name: string;
  hue: number;
  headEmail: string;
  emailAlias: string;
  confidentialByDefault: boolean;
}

interface SeedPerson {
  name: string;
  email: string;
  role: Role;
  department: string;
  branch: Branch;
}

interface SeedServiceTypeField {
  label: string;
  type: string;
  required: boolean;
  options?: string[];
}

interface SeedServiceType {
  department: string;
  name: string;
  description: string;
  defaultPriority: Priority;
  needsApproval: boolean;
  attachmentRequired: boolean;
  fields: SeedServiceTypeField[];
}

interface SeedTicketLeg {
  department: string;
  inMinutesAgo: number;
  outMinutesAgo: number | null;
  byEmail: string;
  reason: string | null;
}

interface SeedTicketEvent {
  type: TicketEventType;
  minutesAgo: number;
  byEmail: string | null;
  body?: string;
  meta?: Record<string, unknown>;
  mentions?: { people: string[]; departments: string[] };
  attachments?: unknown[];
}

interface SeedTicket {
  number: number;
  subject: string;
  description: string;
  requesterEmail: string;
  department: string;
  assigneeEmail: string | null;
  serviceType: string;
  priority: Priority;
  status: TicketStatus;
  channel: Channel;
  confidential: boolean;
  fields: Record<string, unknown>;
  createdMinutesAgo: number;
  resolvedMinutesAgo: number | null;
  legs: SeedTicketLeg[];
  events: SeedTicketEvent[];
  // assetCode, policyNumber, parentNumber, csat, links, tasks, time: deferred to the
  // phases that model them (assets, merge/sub-tickets, rating) — not seeded yet.
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === null || value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== '1') {
    throw new Error('Refusing to seed a production database. Set ALLOW_PROD_SEED=1 to override.');
  }

  const seedPassword = process.env.SEED_PASSWORD;
  if (!seedPassword) {
    throw new Error('SEED_PASSWORD is required to seed users.');
  }
  const passwordHash = await hash(seedPassword);

  const now = new Date();
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  const departments = departmentsData as SeedDepartment[];
  const people = peopleData as SeedPerson[];
  const serviceTypes = serviceTypesData as SeedServiceType[];
  const settings = settingsData as Record<string, unknown>;

  const departmentIdBySlug = new Map<string, string>();
  for (const dept of departments) {
    const record = await prisma.department.upsert({
      where: { slug: dept.slug },
      create: {
        slug: dept.slug,
        name: dept.name,
        hue: dept.hue,
        emailAlias: dept.emailAlias,
        confidentialByDefault: dept.confidentialByDefault,
      },
      update: {
        name: dept.name,
        hue: dept.hue,
        emailAlias: dept.emailAlias,
        confidentialByDefault: dept.confidentialByDefault,
      },
    });
    departmentIdBySlug.set(dept.slug, record.id);
  }

  const userIdByEmail = new Map<string, string>();
  const departmentIdByUserEmail = new Map<string, string>();
  for (const person of people) {
    const departmentId = departmentIdBySlug.get(person.department);
    if (!departmentId) {
      throw new Error(
        `Person ${person.email} references unknown department "${person.department}"`,
      );
    }
    departmentIdByUserEmail.set(person.email, departmentId);
    const record = await prisma.user.upsert({
      where: { email: person.email },
      create: {
        name: person.name,
        email: person.email,
        passwordHash,
        role: person.role,
        departmentId,
        branch: person.branch,
      },
      update: {
        name: person.name,
        role: person.role,
        departmentId,
        branch: person.branch,
      },
    });
    userIdByEmail.set(person.email, record.id);
  }

  for (const dept of departments) {
    const headUserId = userIdByEmail.get(dept.headEmail);
    if (!headUserId) {
      throw new Error(`Department ${dept.slug} references unknown head "${dept.headEmail}"`);
    }
    await prisma.department.update({
      where: { slug: dept.slug },
      data: { headUserId },
    });
  }

  const serviceTypeIdByKey = new Map<string, string>();
  for (const serviceType of serviceTypes) {
    const departmentId = departmentIdBySlug.get(serviceType.department);
    if (!departmentId) {
      throw new Error(
        `Service type "${serviceType.name}" references unknown department "${serviceType.department}"`,
      );
    }
    const data = {
      departmentId,
      name: serviceType.name,
      description: serviceType.description,
      defaultPriority: serviceType.defaultPriority,
      needsApproval: serviceType.needsApproval,
      attachmentRequired: serviceType.attachmentRequired,
      fields: serviceType.fields as unknown as Prisma.InputJsonValue,
    };
    const existing = await prisma.serviceType.findFirst({
      where: { departmentId, name: serviceType.name },
      select: { id: true },
    });
    const record = existing
      ? await prisma.serviceType.update({ where: { id: existing.id }, data })
      : await prisma.serviceType.create({ data });
    serviceTypeIdByKey.set(`${serviceType.department}::${serviceType.name}`, record.id);
  }

  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
  }

  const tickets = ticketsData as SeedTicket[];
  const [slaSettings, holidays] = await Promise.all([getSlaSettings(), getHolidays()]);

  let legCount = 0;
  let eventCount = 0;
  let mentionCount = 0;

  for (const seedTicket of tickets) {
    const requesterId = userIdByEmail.get(seedTicket.requesterEmail);
    if (!requesterId) {
      throw new Error(
        `Ticket ${seedTicket.number} references unknown requester "${seedTicket.requesterEmail}"`,
      );
    }
    const requesterDepartmentId = departmentIdByUserEmail.get(seedTicket.requesterEmail);
    if (!requesterDepartmentId) {
      throw new Error(
        `Ticket ${seedTicket.number} requester "${seedTicket.requesterEmail}" has no department`,
      );
    }
    const serviceTypeId = serviceTypeIdByKey.get(
      `${seedTicket.department}::${seedTicket.serviceType}`,
    );
    if (!serviceTypeId) {
      throw new Error(
        `Ticket ${seedTicket.number} references unknown service type "${seedTicket.serviceType}" in department "${seedTicket.department}"`,
      );
    }
    const assigneeId = seedTicket.assigneeEmail
      ? userIdByEmail.get(seedTicket.assigneeEmail)
      : null;
    if (seedTicket.assigneeEmail && !assigneeId) {
      throw new Error(
        `Ticket ${seedTicket.number} references unknown assignee "${seedTicket.assigneeEmail}"`,
      );
    }

    const createdAt = minutesAgo(seedTicket.createdMinutesAgo);
    const target = slaSettings.targets[seedTicket.priority];
    const calendar = calendarForPriority(seedTicket.priority, slaSettings, holidays);
    const dueAt = computeDueAt({ createdAt, resolveMinutes: target.resolveMinutes, calendar });
    const firstResponseDueAt = computeFirstResponseDueAt({
      createdAt,
      firstResponseMinutes: target.firstResponseMinutes,
      calendar,
    });

    const firstResponseEvent = seedTicket.events.find(
      (event) => event.type === 'MESSAGE' && event.byEmail !== seedTicket.requesterEmail,
    );
    const firstResponseAt = firstResponseEvent ? minutesAgo(firstResponseEvent.minutesAgo) : null;
    const resolvedAt =
      seedTicket.resolvedMinutesAgo !== null ? minutesAgo(seedTicket.resolvedMinutesAgo) : null;
    const pausedAt = seedTicket.status === 'AWAITING_REQUESTER' ? now : null;
    const pausedMs = 0;

    await prisma.ticket.upsert({
      where: { number: seedTicket.number },
      create: {
        number: seedTicket.number,
        subject: seedTicket.subject,
        description: seedTicket.description,
        fields: seedTicket.fields as unknown as Prisma.InputJsonValue,
        requesterId,
        requesterDepartmentId,
        assigneeId,
        serviceTypeId,
        priority: seedTicket.priority,
        status: seedTicket.status,
        channel: seedTicket.channel,
        confidential: seedTicket.confidential,
        createdAt,
        dueAt,
        firstResponseDueAt,
        firstResponseAt,
        resolvedAt,
        pausedAt,
        pausedMs,
      },
      update: {
        subject: seedTicket.subject,
        description: seedTicket.description,
        fields: seedTicket.fields as unknown as Prisma.InputJsonValue,
        requesterId,
        requesterDepartmentId,
        assigneeId,
        serviceTypeId,
        priority: seedTicket.priority,
        status: seedTicket.status,
        channel: seedTicket.channel,
        confidential: seedTicket.confidential,
        createdAt,
        dueAt,
        firstResponseDueAt,
        firstResponseAt,
        resolvedAt,
        pausedAt,
        pausedMs,
      },
    });

    await prisma.ticketLeg.deleteMany({ where: { ticketId: seedTicket.number } });
    for (const leg of seedTicket.legs) {
      const legDepartmentId = departmentIdBySlug.get(leg.department);
      if (!legDepartmentId) {
        throw new Error(
          `Ticket ${seedTicket.number} leg references unknown department "${leg.department}"`,
        );
      }
      const legByUserId = userIdByEmail.get(leg.byEmail);
      if (!legByUserId) {
        throw new Error(`Ticket ${seedTicket.number} leg references unknown user "${leg.byEmail}"`);
      }
      await prisma.ticketLeg.create({
        data: {
          ticketId: seedTicket.number,
          departmentId: legDepartmentId,
          byUserId: legByUserId,
          inAt: minutesAgo(leg.inMinutesAgo),
          outAt: leg.outMinutesAgo !== null ? minutesAgo(leg.outMinutesAgo) : null,
          reason: leg.reason,
        },
      });
      legCount++;
    }

    await prisma.ticketEvent.deleteMany({ where: { ticketId: seedTicket.number } });
    await prisma.ticketMention.deleteMany({ where: { ticketId: seedTicket.number } });
    for (const event of seedTicket.events) {
      const byUserId = event.byEmail ? userIdByEmail.get(event.byEmail) : null;
      if (event.byEmail && !byUserId) {
        throw new Error(
          `Ticket ${seedTicket.number} event references unknown user "${event.byEmail}"`,
        );
      }
      const meta =
        event.type === 'MESSAGE' || event.type === 'NOTE'
          ? toJson({ mentions: event.mentions, attachments: event.attachments })
          : toJson(event.meta);

      await prisma.ticketEvent.create({
        data: {
          ticketId: seedTicket.number,
          type: event.type,
          byUserId,
          body: event.body ?? null,
          meta,
          createdAt: minutesAgo(event.minutesAgo),
        },
      });
      eventCount++;

      if (event.mentions) {
        for (const personEmail of event.mentions.people) {
          const mentionedUserId = userIdByEmail.get(personEmail);
          if (!mentionedUserId) {
            throw new Error(
              `Ticket ${seedTicket.number} event mentions unknown person "${personEmail}"`,
            );
          }
          await prisma.ticketMention.create({
            data: {
              ticketId: seedTicket.number,
              type: 'PERSON',
              userId: mentionedUserId,
            },
          });
          mentionCount++;
        }
        for (const departmentSlug of event.mentions.departments) {
          const mentionedDepartmentId = departmentIdBySlug.get(departmentSlug);
          if (!mentionedDepartmentId) {
            throw new Error(
              `Ticket ${seedTicket.number} event mentions unknown department "${departmentSlug}"`,
            );
          }
          await prisma.ticketMention.create({
            data: {
              ticketId: seedTicket.number,
              type: 'DEPARTMENT',
              departmentId: mentionedDepartmentId,
            },
          });
          mentionCount++;
        }
      }
    }
  }

  console.log(
    `Seeded ${departments.length} departments, ${people.length} people, ${serviceTypes.length} service types, ${Object.keys(settings).length} settings, ${tickets.length} tickets, ${legCount} legs, ${eventCount} events, ${mentionCount} mentions.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
