import { z } from 'zod';

const ticketNumber = z.number().int().positive();

export const mergeTicketSchema = z.object({
  ticketNumber,
  intoTicketNumber: ticketNumber,
});
export type MergeTicketInput = z.infer<typeof mergeTicketSchema>;
