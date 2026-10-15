import { z } from 'zod';

export const createTicketSchema = z.object({
  serviceTypeId: z.string().min(1, 'Select what this is about'),
  subject: z
    .string()
    .trim()
    .min(1, 'Enter a subject')
    .max(200, 'Keep the subject under 200 characters'),
  description: z.string().trim().min(1, 'Describe what you need help with'),
  priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW']),
  confidential: z.boolean(),
  fields: z.record(z.string(), z.unknown()),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

const priorityEnum = z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW']);
const statusEnum = z.enum(['OPEN', 'IN_PROGRESS', 'AWAITING_REQUESTER', 'RESOLVED', 'CLOSED']);
const ticketNumber = z.number().int().positive();

export const assignTicketSchema = z.object({
  ticketNumber,
  assigneeId: z.string().min(1),
});
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;

export const pickUpTicketSchema = z.object({ ticketNumber });
export type PickUpTicketInput = z.infer<typeof pickUpTicketSchema>;

export const setTicketPrioritySchema = z.object({
  ticketNumber,
  priority: priorityEnum,
});
export type SetTicketPriorityInput = z.infer<typeof setTicketPrioritySchema>;

export const setTicketStatusSchema = z.object({
  ticketNumber,
  status: statusEnum,
});
export type SetTicketStatusInput = z.infer<typeof setTicketStatusSchema>;

export const bulkAssignTicketsSchema = z.object({
  ticketNumbers: z.array(ticketNumber).min(1),
  assigneeId: z.string().min(1),
});
export type BulkAssignTicketsInput = z.infer<typeof bulkAssignTicketsSchema>;

export const bulkResolveTicketsSchema = z.object({
  ticketNumbers: z.array(ticketNumber).min(1),
});
export type BulkResolveTicketsInput = z.infer<typeof bulkResolveTicketsSchema>;
