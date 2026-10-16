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

// ---------------------------------------------------------------------------------
// Phase 3: conversation, forwarding, resolve/reopen, rating.
// ---------------------------------------------------------------------------------

const mentionsSchema = z.object({
  people: z.array(z.string().min(1)).max(50),
  departments: z.array(z.string().min(1)).max(50),
});

const attachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  storageKey: z.string().min(1),
});

export const replyTicketSchema = z.object({
  ticketNumber,
  body: z.string().trim().min(1, 'Write a reply before sending').max(10_000),
  mentions: mentionsSchema,
  attachments: z.array(attachmentSchema).max(10),
});
export type ReplyTicketInput = z.infer<typeof replyTicketSchema>;

export const addNoteTicketSchema = z.object({
  ticketNumber,
  body: z.string().trim().min(1, 'Write a note before sending').max(10_000),
  mentions: mentionsSchema,
  attachments: z.array(attachmentSchema).max(10),
});
export type AddNoteTicketInput = z.infer<typeof addNoteTicketSchema>;

export const forwardTicketSchema = z.object({
  ticketNumber,
  targetDepartmentId: z.string().min(1, 'Choose a department'),
  reason: z.string().trim().min(1, 'A reason is required to forward a ticket').max(2_000),
  confidential: z.boolean(),
});
export type ForwardTicketInput = z.infer<typeof forwardTicketSchema>;

export const resolveTicketSchema = z.object({ ticketNumber });
export type ResolveTicketInput = z.infer<typeof resolveTicketSchema>;

export const reopenTicketSchema = z.object({ ticketNumber });
export type ReopenTicketInput = z.infer<typeof reopenTicketSchema>;

export const rateTicketSchema = z.object({
  ticketNumber,
  stars: z.number().int().min(1).max(5),
  reasons: z.array(z.string().min(1)).max(10).default([]),
  note: z.string().trim().max(1_000).nullable().default(null),
});
export type RateTicketInput = z.infer<typeof rateTicketSchema>;

export const markRatingFollowedUpSchema = z.object({ ticketNumber });
export type MarkRatingFollowedUpInput = z.infer<typeof markRatingFollowedUpSchema>;

// ---------------------------------------------------------------------------------
// Phase 4: manual escalation (D-15) and acknowledgement.
// ---------------------------------------------------------------------------------

export const escalateTicketSchema = z.object({
  ticketNumber,
  reason: z.string().trim().min(1, 'A reason is required to escalate a ticket').max(2_000),
});
export type EscalateTicketInput = z.infer<typeof escalateTicketSchema>;

export const acknowledgeEscalationSchema = z.object({ escalationId: z.string().min(1) });
export type AcknowledgeEscalationInput = z.infer<typeof acknowledgeEscalationSchema>;
