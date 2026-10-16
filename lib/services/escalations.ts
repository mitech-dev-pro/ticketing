// Breach escalations (BUILD_PLAN.md Phase 4; D-04, D-15). byUserId is set for a
// human's manual escalate() and null for one app/api/cron/escalate raised. The
// Escalation.(ticketId, level) unique constraint is what keeps a human and the cron
// from ever double-escalating the same ticket to the same level — this file never
// needs to check "has this already happened" itself, the database does.

import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';

export class AlreadyEscalatedError extends Error {
  constructor(ticketNumber: number, level: number) {
    super(`Ticket ${ticketNumber} is already escalated to level ${level}.`);
  }
}

export interface EscalateInput {
  ticketNumber: number;
  level: number;
  byUserId: string | null;
  reason: string | null;
}

export async function escalate(input: EscalateInput): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.escalation.create({
        data: {
          ticketId: input.ticketNumber,
          level: input.level,
          byUserId: input.byUserId,
          reason: input.reason,
          at: now,
        },
      });
      await tx.ticketEvent.create({
        data: {
          ticketId: input.ticketNumber,
          type: 'ESCALATED',
          byUserId: input.byUserId,
          body: input.reason,
          meta: { level: input.level, manual: input.byUserId !== null },
          createdAt: now,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AlreadyEscalatedError(input.ticketNumber, input.level);
    }
    throw error;
  }
}

export async function acknowledgeEscalation(params: {
  escalationId: string;
  byUserId: string;
}): Promise<void> {
  await prisma.escalation.update({
    where: { id: params.escalationId },
    data: { acknowledgedAt: new Date(), acknowledgedById: params.byUserId },
  });
}
