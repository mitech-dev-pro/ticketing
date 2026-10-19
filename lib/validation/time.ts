import { z } from 'zod';

const ticketNumber = z.number().int().positive();

export const startTimerSchema = z.object({ ticketNumber });
export type StartTimerInput = z.infer<typeof startTimerSchema>;

export const stopTimerSchema = z.object({ ticketNumber });
export type StopTimerInput = z.infer<typeof stopTimerSchema>;

export const QUICK_TIME_MINUTES = [15, 30, 60] as const;

export const logQuickTimeSchema = z.object({
  ticketNumber,
  minutes: z
    .number()
    .int()
    .refine((m) => (QUICK_TIME_MINUTES as readonly number[]).includes(m), 'Invalid amount'),
});
export type LogQuickTimeInput = z.infer<typeof logQuickTimeSchema>;
