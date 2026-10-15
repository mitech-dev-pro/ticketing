// Typed accessors over the generic Setting key/value store (prisma/seed-data/settings.json).
// Keeps `lib/sla.ts` pure: this is the only place that turns stored settings into the
// Calendar shape it expects.

import { prisma } from '@/lib/db';
import type { Priority } from '@/generated/prisma/client';
import type { BusinessHours, Calendar, CalendarType } from '@/lib/sla';

export interface SlaTarget {
  firstResponseMinutes: number;
  resolveMinutes: number;
}

export interface SlaSettings {
  targets: Record<Priority, SlaTarget>;
  calendarByPriority: Record<Priority, CalendarType>;
  businessHours: BusinessHours;
  warningPercent: number;
  pauseWhileAwaitingRequester: boolean;
}

async function getSetting<T>(key: string): Promise<T> {
  const row = await prisma.setting.findUniqueOrThrow({ where: { key } });
  return row.value as T;
}

export async function getSlaSettings(): Promise<SlaSettings> {
  const [targets, calendarByPriority, businessHours, warningPercent, pauseWhileAwaitingRequester] =
    await Promise.all([
      getSetting<Record<Priority, SlaTarget>>('sla.targets'),
      getSetting<Record<Priority, CalendarType>>('sla.calendar'),
      getSetting<BusinessHours>('sla.businessHours'),
      getSetting<number>('sla.warningPercent'),
      getSetting<boolean>('sla.pauseWhileAwaitingRequester'),
    ]);
  return {
    targets,
    calendarByPriority,
    businessHours,
    warningPercent,
    pauseWhileAwaitingRequester,
  };
}

export async function getHolidays(): Promise<Date[]> {
  const rows = await prisma.holiday.findMany();
  return rows.map((row) => row.date);
}

export function calendarForPriority(
  priority: Priority,
  settings: Pick<SlaSettings, 'calendarByPriority' | 'businessHours'>,
  holidays: Date[],
): Calendar {
  const type = settings.calendarByPriority[priority];
  return type === 'business'
    ? { type: 'business', businessHours: settings.businessHours, holidays }
    : { type: '24x7' };
}
