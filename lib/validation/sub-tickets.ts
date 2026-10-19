import { z } from 'zod';

export const addSubTicketSchema = z.object({
  parentTicketNumber: z.number().int().positive(),
  serviceTypeId: z.string().min(1, 'Select what this is about'),
  subject: z
    .string()
    .trim()
    .min(1, 'Enter a subject')
    .max(200, 'Keep the subject under 200 characters'),
  description: z.string().trim().min(1, 'Describe what you need help with'),
  priority: z.enum(['URGENT', 'HIGH', 'MEDIUM', 'LOW']),
  fields: z.record(z.string(), z.unknown()),
});
export type AddSubTicketInput = z.infer<typeof addSubTicketSchema>;
