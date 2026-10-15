// Pure-function tests for lib/sla.ts (BUILD_PLAN.md Phase 2): deadlines for each
// priority on both calendars, pause/resume, and the warning/breach boundaries.

import { describe, expect, it } from 'vitest';
import {
  computeDueAt,
  computeFirstResponseDueAt,
  percentElapsed,
  slaState,
  type Calendar,
} from '@/lib/sla';

const CALENDAR_24X7: Calendar = { type: '24x7' };

const BUSINESS_CALENDAR: Calendar = {
  type: 'business',
  businessHours: {
    timezone: 'Africa/Accra',
    days: [1, 2, 3, 4, 5],
    start: '08:00',
    end: '17:00',
  },
  holidays: [],
};

describe('computeDueAt — 24x7 calendar', () => {
  it('adds resolve minutes straight across priorities', () => {
    const createdAt = new Date('2026-01-05T10:00:00.000Z'); // a Monday
    expect(computeDueAt({ createdAt, resolveMinutes: 240, calendar: CALENDAR_24X7 })).toEqual(
      new Date('2026-01-05T14:00:00.000Z'),
    ); // Urgent: 4h
    expect(computeDueAt({ createdAt, resolveMinutes: 480, calendar: CALENDAR_24X7 })).toEqual(
      new Date('2026-01-05T18:00:00.000Z'),
    ); // High: 8h
    expect(computeDueAt({ createdAt, resolveMinutes: 1440, calendar: CALENDAR_24X7 })).toEqual(
      new Date('2026-01-06T10:00:00.000Z'),
    ); // Medium: 1 day
    expect(computeDueAt({ createdAt, resolveMinutes: 4320, calendar: CALENDAR_24X7 })).toEqual(
      new Date('2026-01-08T10:00:00.000Z'),
    ); // Low: 3 days
  });

  it('adds accumulated pausedMs on top of the calendar result', () => {
    const createdAt = new Date('2026-01-05T10:00:00.000Z');
    const dueAt = computeDueAt({
      createdAt,
      resolveMinutes: 240,
      calendar: CALENDAR_24X7,
      pausedMs: 30 * 60_000,
    });
    expect(dueAt).toEqual(new Date('2026-01-05T14:30:00.000Z'));
  });

  it('never skips weekends or holidays — always wall-clock minutes', () => {
    const createdAt = new Date('2026-01-09T10:00:00.000Z'); // Friday
    const dueAt = computeDueAt({ createdAt, resolveMinutes: 4320, calendar: CALENDAR_24X7 }); // 3 days
    expect(dueAt).toEqual(new Date('2026-01-12T10:00:00.000Z')); // straight through the weekend
  });
});

describe('computeDueAt — business hours calendar', () => {
  it('starts counting from the next working window when created outside hours', () => {
    // Friday 18:00 Accra (UTC, no offset) is after close; next window is Monday 08:00.
    const createdAt = new Date('2026-01-09T18:00:00.000Z');
    const dueAt = computeDueAt({ createdAt, resolveMinutes: 60, calendar: BUSINESS_CALENDAR });
    expect(dueAt).toEqual(new Date('2026-01-12T09:00:00.000Z'));
  });

  it('rolls over to the next working day when minutes exceed the remaining window', () => {
    // Monday 16:00–17:00 is 1h left in the window; 90 minutes rolls into Tuesday 08:00.
    const createdAt = new Date('2026-01-05T16:00:00.000Z');
    const dueAt = computeDueAt({ createdAt, resolveMinutes: 90, calendar: BUSINESS_CALENDAR });
    expect(dueAt).toEqual(new Date('2026-01-06T08:30:00.000Z'));
  });

  it('skips weekends entirely', () => {
    // Friday 16:30, 2 hours of work remaining: 30 min Friday + rest rolls to Monday.
    const createdAt = new Date('2026-01-09T16:30:00.000Z');
    const dueAt = computeDueAt({ createdAt, resolveMinutes: 120, calendar: BUSINESS_CALENDAR });
    expect(dueAt).toEqual(new Date('2026-01-12T09:30:00.000Z'));
  });

  it('skips a holiday that falls on a working day', () => {
    const createdAt = new Date('2026-01-05T08:00:00.000Z'); // Monday
    const calendarWithHoliday: Calendar = {
      ...BUSINESS_CALENDAR,
      holidays: [new Date('2026-01-06T00:00:00.000Z')], // Tuesday is a holiday
    };
    // 9 working hours (the whole of Monday) + 1 more hour rolls to Wednesday 09:00
    // (Tuesday skipped entirely).
    const dueAt = computeDueAt({
      createdAt,
      resolveMinutes: 9 * 60 + 60,
      calendar: calendarWithHoliday,
    });
    expect(dueAt).toEqual(new Date('2026-01-07T09:00:00.000Z'));
  });
});

describe('computeFirstResponseDueAt', () => {
  it('matches computeDueAt for the same minutes and calendar', () => {
    const createdAt = new Date('2026-01-05T10:00:00.000Z');
    expect(
      computeFirstResponseDueAt({ createdAt, firstResponseMinutes: 30, calendar: CALENDAR_24X7 }),
    ).toEqual(computeDueAt({ createdAt, resolveMinutes: 30, calendar: CALENDAR_24X7 }));
  });
});

describe('percentElapsed', () => {
  const createdAt = new Date('2026-01-05T10:00:00.000Z');
  const dueAt = new Date('2026-01-05T14:00:00.000Z'); // 4h window

  it('is 0% at creation and 100% at the deadline', () => {
    expect(percentElapsed({ now: createdAt, createdAt, dueAt })).toBe(0);
    expect(percentElapsed({ now: dueAt, createdAt, dueAt })).toBe(100);
  });

  it('can exceed 100% once overdue', () => {
    const now = new Date('2026-01-05T16:00:00.000Z'); // 2h past due
    expect(percentElapsed({ now, createdAt, dueAt })).toBe(150);
  });

  it('freezes at the pausedAt instant while paused', () => {
    const pausedAt = new Date('2026-01-05T11:00:00.000Z'); // 25% elapsed
    const now = new Date('2026-01-05T20:00:00.000Z'); // long after, but paused
    expect(percentElapsed({ now, createdAt, dueAt, pausedAt })).toBe(25);
  });
});

describe('slaState', () => {
  const createdAt = new Date('2026-01-05T10:00:00.000Z');
  const dueAt = new Date('2026-01-05T14:00:00.000Z'); // 4h window, warning at 75% = 11:00+3h=13:00

  it('is PAUSED whenever pausedAt is set, regardless of elapsed time', () => {
    expect(
      slaState({ now: dueAt, createdAt, dueAt, pausedAt: createdAt, warningPercent: 75 }),
    ).toBe('PAUSED');
  });

  it('is ON_TRACK below the warning threshold', () => {
    const now = new Date('2026-01-05T11:00:00.000Z'); // 25% elapsed
    expect(slaState({ now, createdAt, dueAt, warningPercent: 75 })).toBe('ON_TRACK');
  });

  it('is WARNING at or above the warning threshold but before the deadline', () => {
    const now = new Date('2026-01-05T13:00:00.000Z'); // exactly 75% elapsed
    expect(slaState({ now, createdAt, dueAt, warningPercent: 75 })).toBe('WARNING');
  });

  it('is BREACHED at or after the deadline', () => {
    expect(slaState({ now: dueAt, createdAt, dueAt, warningPercent: 75 })).toBe('BREACHED');
    const after = new Date('2026-01-05T15:00:00.000Z');
    expect(slaState({ now: after, createdAt, dueAt, warningPercent: 75 })).toBe('BREACHED');
  });
});
