import { z } from 'zod';

const priorityTargetSchema = z.object({
  firstResponseMinutes: z.coerce.number().int().positive(),
  resolveMinutes: z.coerce.number().int().positive(),
});

const calendarTypeEnum = z.enum(['24x7', 'business']);

export const updateAdminSettingsSchema = z.object({
  targets: z.object({
    URGENT: priorityTargetSchema,
    HIGH: priorityTargetSchema,
    MEDIUM: priorityTargetSchema,
    LOW: priorityTargetSchema,
  }),
  calendarByPriority: z.object({
    URGENT: calendarTypeEnum,
    HIGH: calendarTypeEnum,
    MEDIUM: calendarTypeEnum,
    LOW: calendarTypeEnum,
  }),
  businessHours: z.object({
    timezone: z.string().min(1),
    days: z.array(z.coerce.number().int().min(1).max(7)),
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  }),
  warningPercent: z.coerce.number().int().min(1).max(100),
  pauseWhileAwaitingRequester: z.boolean(),
  level2AfterMinutesMode: z.enum(['RESOLVE_TARGET', 'CUSTOM']),
  level2AfterMinutesCustom: z.coerce.number().int().positive().optional(),
  autoCloseEnabled: z.boolean(),
  autoCloseResolvedAfterDays: z.coerce.number().int().positive(),
});

export type UpdateAdminSettingsInput = z.infer<typeof updateAdminSettingsSchema>;
