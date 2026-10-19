import Link from 'next/link';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { cn } from '@/lib/utils';
import type { InboxRow } from './types';
import type { Priority } from '@/generated/prisma/client';

const DISPLAY_TIME_ZONE = 'Africa/Accra';
const MAX_PER_DAY = 3;
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PRIORITY_BORDER_COLOR: Record<Priority, string> = {
  URGENT: 'var(--color-urgent)',
  HIGH: 'var(--color-high)',
  MEDIUM: 'var(--color-medium)',
  LOW: 'var(--color-low)',
};

function monthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}

export function CalendarView({ rows, monthParam }: { rows: InboxRow[]; monthParam?: string }) {
  const now = new Date();
  const [yearStr, monthStr] = (monthParam ?? monthKey(new TZDate(now, DISPLAY_TIME_ZONE))).split(
    '-',
  );
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const monthStart = startOfMonth(new TZDate(year, monthIndex, 1, DISPLAY_TIME_ZONE));
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });

  const days: Date[] = [];
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }

  function itemsForDay(day: Date): InboxRow[] {
    return rows.filter((row) => isSameDay(new TZDate(new Date(row.dueAt), DISPLAY_TIME_ZONE), day));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-small font-semibold text-ink">{format(monthStart, 'MMMM yyyy')}</h2>
        <div className="flex gap-1.5">
          <Link
            href={`/inbox?view=calendar&month=${monthKey(subMonths(monthStart, 1))}`}
            className="rounded-chip border border-line px-2.5 py-1 text-small text-muted hover:text-ink"
          >
            Prev
          </Link>
          <Link
            href={`/inbox?view=calendar&month=${monthKey(now)}`}
            className="rounded-chip border border-line px-2.5 py-1 text-small text-muted hover:text-ink"
          >
            Today
          </Link>
          <Link
            href={`/inbox?view=calendar&month=${monthKey(addMonths(monthStart, 1))}`}
            className="rounded-chip border border-line px-2.5 py-1 text-small text-muted hover:text-ink"
          >
            Next
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t-card border border-b-0 border-line bg-line text-label font-mono uppercase text-faint">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="bg-subtle px-2 py-1.5 text-center">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-card border border-line bg-line">
        {days.map((day) => {
          const items = itemsForDay(day);
          const inMonth = isSameMonth(day, monthStart);
          return (
            <div
              key={day.toISOString()}
              className={cn('min-h-[92px] bg-surface p-1.5', !inMonth && 'bg-subtle')}
            >
              <div
                className={cn('mb-1 font-mono text-label', inMonth ? 'text-muted' : 'text-faint')}
              >
                {day.getDate()}
              </div>
              <div className="flex flex-col gap-0.5">
                {items.slice(0, MAX_PER_DAY).map((item) => {
                  const overdue =
                    new Date(item.dueAt).getTime() < now.getTime() &&
                    item.status !== 'RESOLVED' &&
                    item.status !== 'CLOSED';
                  return (
                    <Link
                      key={item.number}
                      href={`/tickets/${item.number}?from=inbox`}
                      className={cn(
                        'block truncate rounded-[2px] border-l-2 bg-subtle px-1 py-0.5 text-label',
                        overdue ? 'bg-urgent/15 text-urgent' : 'text-ink-2',
                      )}
                      style={{ borderColor: PRIORITY_BORDER_COLOR[item.priority] }}
                      title={item.subject}
                    >
                      {item.subject}
                    </Link>
                  );
                })}
                {items.length > MAX_PER_DAY ? (
                  <span className="text-label text-faint">+{items.length - MAX_PER_DAY} more</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
