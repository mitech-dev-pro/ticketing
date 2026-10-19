// lib/services/assets.ts and policy.ts (BUILD_PLAN.md Phase 6): the asset register
// (list + detail with ticket history) and the policy/claim lookup stub.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { create } from '@/lib/services/tickets';
import { getAsset, listAssets } from '@/lib/services/assets';
import { lookupPolicy } from '@/lib/services/policy';

let departmentId: string;
let serviceTypeId: string;
let requesterId: string;
let holderId: string;
let assetId: string;

beforeAll(async () => {
  const department = await prisma.department.create({
    data: {
      slug: 'phase6-assets-test-it',
      name: 'Phase 6 Assets Test IT',
      hue: 220,
      emailAlias: 'phase6-assets-test-it@milife.test',
    },
  });
  departmentId = department.id;

  const serviceType = await prisma.serviceType.create({
    data: {
      departmentId,
      name: 'Phase 6 assets test type',
      description: 'placeholder',
      defaultPriority: 'MEDIUM',
      needsApproval: false,
      attachmentRequired: false,
      fields: [],
    },
  });
  serviceTypeId = serviceType.id;

  const [requester, holder] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Phase 6 Assets Requester',
        email: 'phase6-assets-requester@milife.test',
        passwordHash: 'unused-in-this-test',
        role: 'MEMBER',
        departmentId,
        branch: 'ACHIMOTA_HQ',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Phase 6 Assets Holder',
        email: 'phase6-assets-holder@milife.test',
        passwordHash: 'unused-in-this-test',
        role: 'MEMBER',
        departmentId,
        branch: 'ACHIMOTA_HQ',
      },
    }),
  ]);
  requesterId = requester.id;
  holderId = holder.id;

  const asset = await prisma.asset.create({
    data: {
      id: 'MLA-TEST-0001',
      type: 'Laptop',
      model: 'Test Laptop 9000',
      ownerDepartmentId: departmentId,
      holderUserId: holderId,
      location: 'Test lab',
      status: 'IN_USE',
      warranty: 'Dec 2030',
    },
  });
  assetId = asset.id;
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
  await prisma.asset.deleteMany({ where: { id: assetId } });
  await prisma.serviceType.deleteMany({ where: { departmentId } });
  await prisma.user.deleteMany({ where: { id: { in: [requesterId, holderId] } } });
  await prisma.department.deleteMany({ where: { id: departmentId } });
});

async function createTicketForAsset() {
  return create({
    requesterId,
    requesterDepartmentId: departmentId,
    serviceTypeId,
    subject: 'Phase 6 assets test ticket',
    description: 'A ticket created for lib/services/assets.ts integration tests.',
    priority: 'MEDIUM',
    channel: 'PORTAL',
    confidential: false,
    fields: {},
  }).then(({ number }) => prisma.ticket.update({ where: { number }, data: { assetId } }));
}

describe('listAssets / getAsset', () => {
  it('lists the asset with its owner department and holder name', async () => {
    const assets = await listAssets();
    const found = assets.find((a) => a.id === assetId);
    expect(found).toMatchObject({
      type: 'Laptop',
      ownerDepartmentName: 'Phase 6 Assets Test IT',
      holderName: 'Phase 6 Assets Holder',
      status: 'IN_USE',
    });
  });

  it('getAsset includes ticket history, newest first', async () => {
    const first = await createTicketForAsset();
    const second = await createTicketForAsset();

    const detail = await getAsset(assetId);
    expect(detail).not.toBeNull();
    expect(detail?.tickets.map((t) => t.number)).toEqual([second.number, first.number]);
    expect(detail?.openTicketCount).toBe(2);
  });

  it('getAsset returns null for an unknown id', async () => {
    expect(await getAsset('MLA-DOES-NOT-EXIST')).toBeNull();
  });
});

describe('lookupPolicy', () => {
  const policyNumber = 'MLF-TEST-000001';
  const claimNumber = 'CLM-TEST-01';

  beforeAll(async () => {
    await prisma.policy.create({
      data: {
        number: policyNumber,
        product: 'miTest — Test plan',
        holder: 'Test Holder',
        premium: 'GHS 10 / month',
        payMethod: 'MTN MoMo',
        since: 'Jan 2020',
      },
    });
    await prisma.claim.create({ data: { number: claimNumber, policyNumber } });
  });

  afterAll(async () => {
    await prisma.claim.deleteMany({ where: { number: claimNumber } });
    await prisma.policy.deleteMany({ where: { number: policyNumber } });
  });

  it('matches directly by policy number', async () => {
    const result = await lookupPolicy(policyNumber);
    expect(result).toMatchObject({ number: policyNumber, matchedBy: 'policy', claimNumber: null });
  });

  it('matches by claim number, resolving to its policy', async () => {
    const result = await lookupPolicy(claimNumber);
    expect(result).toMatchObject({ number: policyNumber, matchedBy: 'claim', claimNumber });
  });

  it('returns null for a number that matches neither', async () => {
    expect(await lookupPolicy('NOT-A-REAL-NUMBER')).toBeNull();
  });
});
