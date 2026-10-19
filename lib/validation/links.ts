import { z } from 'zod';

const ticketNumber = z.number().int().positive();
const linkType = z.enum(['BLOCKED_BY', 'BLOCKS', 'RELATED_TO']);

export const addLinkSchema = z.object({
  ticketNumber,
  targetTicketNumber: ticketNumber,
  type: linkType,
});
export type AddLinkInput = z.infer<typeof addLinkSchema>;

export const removeLinkSchema = z.object({
  ticketNumber,
  targetTicketNumber: ticketNumber,
  type: linkType,
});
export type RemoveLinkInput = z.infer<typeof removeLinkSchema>;
