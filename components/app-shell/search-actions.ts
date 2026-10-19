'use server';

import { getSession } from '@/lib/auth';
import { searchTickets, type TicketSearchResult } from '@/lib/services/search';
import { formError, type ActionResult } from '@/lib/validation/action-result';
import { searchTicketsSchema } from '@/lib/validation/search';

export async function searchTicketsAction(
  input: unknown,
): Promise<ActionResult<TicketSearchResult[]>> {
  const session = await getSession();
  if (!session) return formError("You don't have permission to do that.");

  const parsed = searchTicketsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const results = await searchTickets(session.user, parsed.data.query);
  return { ok: true, data: results };
}
