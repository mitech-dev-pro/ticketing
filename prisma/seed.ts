// Phase 1 seed: departments, people, service types and settings from prisma/seed-data/*.json.
// Tickets (prisma/seed-data/tickets.json and friends) arrive in Phase 2 once those models exist.
//
// Run with `npx prisma db seed` (wired via prisma.config.ts) or `npm run prisma:seed`.
// Requires SEED_PASSWORD (one shared password, hashed, for every seeded user — this is
// fixture data for @milife.test addresses only, never real accounts).
// Refuses to run against NODE_ENV=production unless ALLOW_PROD_SEED=1 is set.

import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { prisma } from '@/lib/db';
import { Prisma, type Branch, type Priority, type Role } from '@/generated/prisma/client';
import departmentsData from './seed-data/departments.json';
import peopleData from './seed-data/people.json';
import serviceTypesData from './seed-data/service-types.json';
import settingsData from './seed-data/settings.json';

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

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== '1') {
    throw new Error('Refusing to seed a production database. Set ALLOW_PROD_SEED=1 to override.');
  }

  const seedPassword = process.env.SEED_PASSWORD;
  if (!seedPassword) {
    throw new Error('SEED_PASSWORD is required to seed users.');
  }
  const passwordHash = await hash(seedPassword);

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
  for (const person of people) {
    const departmentId = departmentIdBySlug.get(person.department);
    if (!departmentId) {
      throw new Error(
        `Person ${person.email} references unknown department "${person.department}"`,
      );
    }
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
    if (existing) {
      await prisma.serviceType.update({ where: { id: existing.id }, data });
    } else {
      await prisma.serviceType.create({ data });
    }
  }

  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
  }

  console.log(
    `Seeded ${departments.length} departments, ${people.length} people, ${serviceTypes.length} service types, ${Object.keys(settings).length} settings.`,
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
