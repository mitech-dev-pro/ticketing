import { z } from 'zod';

export const searchTicketsSchema = z.object({
  query: z.string().trim().min(1).max(200),
});
export type SearchTicketsInput = z.infer<typeof searchTicketsSchema>;
