// SLA maths (D-01 to D-04). Pure functions that take `now` and a calendar (24x7 or
// business hours + holidays) as arguments — nothing here reads Settings or Holiday
// rows itself; the caller (ticketService) loads those and builds the Calendar.
//
// Deadlines are createdAt + target + pausedMs on the ticket's calendar (D-03), so a
// priority change still recomputes from createdAt: call computeDueAt again with the
// new target and the ticket's existing pausedMs.
//
// Ghana has no DST (Africa/Accra is UTC+0 year-round), but business-hours maths still
// goes through @date-fns/tz's TZDate so the calendar's declared timezone, not the
// server's, decides what "8am" and "a working day" mean.

import { TZDate } from '@date-fns/tz';

export type CalendarType = '24x7' | 'business';

export interface BusinessHours {
  timezone: string;
  /** ISO weekday numbers that are working days: 1 = Monday ... 7 = Sunday. */
  days: number[];
  /** "HH:mm" in `timezone`. */
  start: string;
  /** "HH:mm" in `timezone`. */
  end: string;
}

export interface Calendar {
  type: CalendarType;
  /** Required when type is 'business'. */
  businessHours?: BusinessHours;
  /** Dates excluded from the business calendar, regardless of weekday. */
  holidays?: Date[];
}

export type SlaState = 'PAUSED' | 'BREACHED' | 'WARNING' | 'ON_TRACK';

function parseHHMM(value: string): { hours: number; minutes: number } {
  const [h, m] = value.split(':').map(Number);
  return { hours: h ?? 0, minutes: m ?? 0 };
}

function dateKey(zoned: TZDate): string {
  const y = zoned.getFullYear();
  const m = String(zoned.getMonth() + 1).padStart(2, '0');
  const d = String(zoned.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isoWeekday(zoned: TZDate): number {
  const day = zoned.getDay(); // 0 = Sunday ... 6 = Saturday
  return day === 0 ? 7 : day;
}

function isWorkingDay(zoned: TZDate, hours: BusinessHours, holidays: ReadonlySet<string>): boolean {
  return hours.days.includes(isoWeekday(zoned)) && !holidays.has(dateKey(zoned));
}

function windowBoundsForDay(zoned: TZDate, hours: BusinessHours): { start: Date; end: Date } {
  const start = parseHHMM(hours.start);
  const end = parseHHMM(hours.end);
  const y = zoned.getFullYear();
  const mo = zoned.getMonth();
  const d = zoned.getDate();
  return {
    start: new Date(
      new TZDate(y, mo, d, start.hours, start.minutes, 0, 0, hours.timezone).getTime(),
    ),
    end: new Date(new TZDate(y, mo, d, end.hours, end.minutes, 0, 0, hours.timezone).getTime()),
  };
}

function startOfNextDay(instant: Date, timezone: string): Date {
  const zoned = new TZDate(instant, timezone);
  const next = new TZDate(
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate() + 1,
    0,
    0,
    0,
    0,
    timezone,
  );
  return new Date(next.getTime());
}

/** The instant, at or after `instant`, that falls inside a working window. */
function nextWindowStart(instant: Date, hours: BusinessHours, holidays: ReadonlySet<string>): Date {
  let probe = instant;
  for (let i = 0; i < 400; i++) {
    const zoned = new TZDate(probe, hours.timezone);
    if (isWorkingDay(zoned, hours, holidays)) {
      const { start, end } = windowBoundsForDay(zoned, hours);
      if (probe.getTime() < start.getTime()) return start;
      if (probe.getTime() < end.getTime()) return probe;
    }
    probe = startOfNextDay(probe, hours.timezone);
  }
  throw new Error('lib/sla: no working day found within 400 days of ' + instant.toISOString());
}

function windowEndOfDay(instant: Date, hours: BusinessHours): Date {
  return windowBoundsForDay(new TZDate(instant, hours.timezone), hours).end;
}

function addCalendarMinutes(start: Date, minutes: number, calendar: Calendar): Date {
  if (calendar.type === '24x7') {
    return new Date(start.getTime() + minutes * 60_000);
  }

  const hours = calendar.businessHours;
  if (!hours) {
    throw new Error('lib/sla: business calendar requires businessHours');
  }
  const holidays = new Set(
    (calendar.holidays ?? []).map((date) => dateKey(new TZDate(date, hours.timezone))),
  );

  let remainingMinutes = minutes;
  let cursor = nextWindowStart(start, hours, holidays);

  while (remainingMinutes > 0) {
    const windowEnd = windowEndOfDay(cursor, hours);
    const availableMinutes = (windowEnd.getTime() - cursor.getTime()) / 60_000;
    if (remainingMinutes <= availableMinutes) {
      return new Date(cursor.getTime() + remainingMinutes * 60_000);
    }
    remainingMinutes -= availableMinutes;
    cursor = nextWindowStart(windowEnd, hours, holidays);
  }
  return cursor;
}

export function computeDueAt(params: {
  createdAt: Date;
  resolveMinutes: number;
  calendar: Calendar;
  pausedMs?: number;
}): Date {
  const base = addCalendarMinutes(params.createdAt, params.resolveMinutes, params.calendar);
  return new Date(base.getTime() + (params.pausedMs ?? 0));
}

export function computeFirstResponseDueAt(params: {
  createdAt: Date;
  firstResponseMinutes: number;
  calendar: Calendar;
}): Date {
  return addCalendarMinutes(params.createdAt, params.firstResponseMinutes, params.calendar);
}

/**
 * How far through its window a ticket is, as a percentage. Can exceed 100 once
 * overdue. Freezes at the moment it was paused while `pausedAt` is set, since a
 * paused ticket isn't using up any more of its deadline.
 */
export function percentElapsed(params: {
  now: Date;
  createdAt: Date;
  dueAt: Date;
  pausedAt?: Date | null;
}): number {
  const effectiveNow = params.pausedAt ?? params.now;
  const total = params.dueAt.getTime() - params.createdAt.getTime();
  if (total <= 0) return 100;
  const elapsed = effectiveNow.getTime() - params.createdAt.getTime();
  return Math.max(0, (elapsed / total) * 100);
}

export function slaState(params: {
  now: Date;
  createdAt: Date;
  dueAt: Date;
  pausedAt?: Date | null;
  warningPercent: number;
}): SlaState {
  if (params.pausedAt) return 'PAUSED';
  if (params.now.getTime() >= params.dueAt.getTime()) return 'BREACHED';
  const percent = percentElapsed(params);
  return percent >= params.warningPercent ? 'WARNING' : 'ON_TRACK';
}
