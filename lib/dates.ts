// Deadlines are computed and stored in UTC; CLAUDE.md requires display in Africa/Accra.
// Keep this the only file that touches TZDate for ticket deadlines.

import { format, formatDistanceToNowStrict } from 'date-fns';
import { TZDate } from '@date-fns/tz';

const DISPLAY_TIME_ZONE = 'Africa/Accra';
const WARNING_THRESHOLD = 0.75; // README: amber once 75% of the SLA window has elapsed.

export type DeadlineTone = 'normal' | 'warning' | 'danger';

export interface DeadlineDisplay {
  label: string;
  absolute: string;
  tone: DeadlineTone;
}

/** `createdAt`/`dueAt` give the SLA window so we know when to turn amber at 75% elapsed. */
export function formatDeadline(
  dueAt: Date,
  createdAt: Date,
  now: Date = new Date(),
): DeadlineDisplay {
  const totalMs = dueAt.getTime() - createdAt.getTime();
  const elapsedMs = now.getTime() - createdAt.getTime();
  const overdue = now.getTime() >= dueAt.getTime();
  const warning = !overdue && totalMs > 0 && elapsedMs / totalMs >= WARNING_THRESHOLD;
  const tone: DeadlineTone = overdue ? 'danger' : warning ? 'warning' : 'normal';

  const distance = formatDistanceToNowStrict(dueAt, { unit: dayOrSmaller(dueAt, now) });
  const label = overdue ? `${distance} overdue` : `${distance} left`;

  return {
    label,
    absolute: format(new TZDate(dueAt, DISPLAY_TIME_ZONE), 'd MMM, h:mmaaa'),
    tone,
  };
}

function dayOrSmaller(a: Date, b: Date): 'minute' | 'hour' | 'day' {
  const diffMs = Math.abs(a.getTime() - b.getTime());
  if (diffMs < 60 * 60 * 1000) return 'minute';
  if (diffMs < 24 * 60 * 60 * 1000) return 'hour';
  return 'day';
}
