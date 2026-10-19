// Inbox filter-row "Views" chips (Phase 5). filters is opaque JSON to this layer —
// it's whatever components/inbox's filter state was at save time (tab, priority,
// due4h), read back verbatim by the client to re-apply the same query params.

import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';

export interface SavedViewInput {
  userId: string;
  name: string;
  filters: Record<string, unknown>;
}

/** Saving a view with a name you already used replaces it (matches the "+ Save
 * current view" chip reading as a single save slot per name, not an error). */
export async function saveView(input: SavedViewInput): Promise<{ id: string }> {
  const view = await prisma.savedView.upsert({
    where: { userId_name: { userId: input.userId, name: input.name } },
    create: {
      userId: input.userId,
      name: input.name,
      filters: input.filters as unknown as Prisma.InputJsonValue,
    },
    update: { filters: input.filters as unknown as Prisma.InputJsonValue },
  });
  return { id: view.id };
}

export async function deleteSavedView(params: { id: string; userId: string }): Promise<void> {
  await prisma.savedView.deleteMany({ where: { id: params.id, userId: params.userId } });
}
