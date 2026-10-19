// Asset register (BUILD_PLAN.md Phase 6). Read-only in this phase — admin CRUD for
// the register is Administration scope (Phase 8), same deferral CannedReply's own
// admin CRUD got in Phase 3.

import { prisma } from '@/lib/db';
import type { TicketStatus } from '@/generated/prisma/client';

export interface AssetListRow {
  id: string;
  type: string;
  model: string;
  ownerDepartmentName: string;
  holderName: string | null;
  location: string;
  status: string;
  warranty: string;
  openTicketCount: number;
}

export async function listAssets(): Promise<AssetListRow[]> {
  const assets = await prisma.asset.findMany({
    select: {
      id: true,
      type: true,
      model: true,
      location: true,
      status: true,
      warranty: true,
      ownerDepartment: { select: { name: true } },
      holder: { select: { name: true } },
      _count: { select: { tickets: { where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } } } },
    },
    orderBy: [{ type: 'asc' }, { id: 'asc' }],
  });

  return assets.map((asset) => ({
    id: asset.id,
    type: asset.type,
    model: asset.model,
    ownerDepartmentName: asset.ownerDepartment.name,
    holderName: asset.holder?.name ?? null,
    location: asset.location,
    status: asset.status,
    warranty: asset.warranty,
    openTicketCount: asset._count.tickets,
  }));
}

export interface AssetDetail extends AssetListRow {
  ownerDepartmentId: string;
  tickets: { number: number; subject: string; status: TicketStatus; createdAt: Date }[];
}

export async function getAsset(id: string): Promise<AssetDetail | null> {
  const asset = await prisma.asset.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      model: true,
      location: true,
      status: true,
      warranty: true,
      ownerDepartmentId: true,
      ownerDepartment: { select: { name: true } },
      holder: { select: { name: true } },
      tickets: {
        select: { number: true, subject: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!asset) return null;

  return {
    id: asset.id,
    type: asset.type,
    model: asset.model,
    ownerDepartmentId: asset.ownerDepartmentId,
    ownerDepartmentName: asset.ownerDepartment.name,
    holderName: asset.holder?.name ?? null,
    location: asset.location,
    status: asset.status,
    warranty: asset.warranty,
    openTicketCount: asset.tickets.filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED')
      .length,
    tickets: asset.tickets,
  };
}
