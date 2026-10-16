'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { acknowledgeEscalation as acknowledgeEscalationService } from '@/lib/services/escalations';
import { loadPermissionTicket } from '@/lib/services/tickets';
import { formError, type ActionResult } from '@/lib/validation/action-result';
import { acknowledgeEscalationSchema } from '@/lib/validation/tickets';

const FORBIDDEN = "You don't have permission to do that.";

export async function acknowledgeEscalationAction(input: unknown): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);

  const parsed = acknowledgeEscalationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const escalation = await prisma.escalation.findUnique({
    where: { id: parsed.data.escalationId },
    select: { ticketId: true, level: true },
  });
  if (!escalation) return formError(FORBIDDEN);

  const ticket = await loadPermissionTicket(escalation.ticketId);
  const action = escalation.level >= 2 ? 'acknowledgeL2' : 'acknowledgeL1';
  if (!ticket || !can(action, session.user, ticket)) return formError(FORBIDDEN);

  await acknowledgeEscalationService({
    escalationId: parsed.data.escalationId,
    byUserId: session.user.id,
  });

  revalidatePath('/escalations');
  revalidatePath(`/tickets/${escalation.ticketId}`);
  return { ok: true, data: null };
}
