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

async function getSettingOrDefault<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? (row.value as T) : fallback;
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

export interface EscalationSettings {
  /** D-04: window = another full resolution target after breach, or an explicit override. */
  level2AfterMinutes: number | 'RESOLVE_TARGET';
  /** D-04: "Open" until miLife names the COO. Empty means notify every admin. */
  level2UserIds: string[];
}

export async function getEscalationSettings(): Promise<EscalationSettings> {
  const [level2AfterMinutes, level2UserIds] = await Promise.all([
    getSetting<number | 'RESOLVE_TARGET'>('escalation.level2AfterMinutes'),
    getSettingOrDefault<string[]>('escalation.level2UserIds', []),
  ]);
  return { level2AfterMinutes, level2UserIds };
}

export interface RuleSettings {
  autoCloseResolvedAfterDays: number;
  autoCloseEnabled: boolean;
}

export async function getRuleSettings(): Promise<RuleSettings> {
  const [autoCloseResolvedAfterDays, autoCloseEnabled] = await Promise.all([
    getSetting<number>('rules.autoCloseResolvedAfterDays'),
    getSetting<boolean>('rules.autoCloseEnabled'),
  ]);
  return { autoCloseResolvedAfterDays, autoCloseEnabled };
}

export interface DigestSettings {
  /** "HH:MM", Africa/Accra. Ghana has no DST, so this maps to a fixed UTC cron time. */
  sendAtLocalTime: string;
}

export async function getDigestSettings(): Promise<DigestSettings> {
  return { sendAtLocalTime: await getSetting<string>('digest.sendAtLocalTime') };
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
