import { z } from 'zod';

// Matches components/inbox/types.ts's InboxTab and the priority/due4h filter-row
// state (app/(app)/inbox/page.tsx) — the only things a saved view remembers.
export const savedViewFiltersSchema = z.object({
  tab: z.enum(['unassigned', 'assigned-to-me', 'all-open', 'resolved']),
  priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  due4h: z.boolean(),
});
export type SavedViewFilters = z.infer<typeof savedViewFiltersSchema>;

export const saveViewSchema = z.object({
  name: z.string().trim().min(1, 'Name this view').max(40),
  filters: savedViewFiltersSchema,
});
export type SaveViewInput = z.infer<typeof saveViewSchema>;

export const deleteSavedViewSchema = z.object({ id: z.string().min(1) });
export type DeleteSavedViewInput = z.infer<typeof deleteSavedViewSchema>;
