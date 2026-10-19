import Link from 'next/link';
import { formatTicketId } from '@/lib/ids';
import { PriorityBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Priority, TicketStatus } from '@/generated/prisma/client';

export interface SplitListRow {
  number: number;
  subject: string;
  priority: Priority;
  status: TicketStatus;
}

// README: "On wide screens (>=1180px) opening a ticket from the inbox shows a 310px
// list on the left (split view)." `wide:` is the project's 1180px breakpoint token
// (app/globals.css), so this stays hidden below it rather than needing JS detection.
export function SplitList({ rows, activeNumber }: { rows: SplitListRow[]; activeNumber: number }) {
  return (
    <aside className="hidden w-[310px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-line pr-3 wide:flex">
      {rows.map((row) => (
        <Link
          key={row.number}
          href={`/tickets/${row.number}?from=inbox`}
          className={cn(
            'flex items-center justify-between gap-2 rounded-control px-2 py-2 text-small',
            row.number === activeNumber ? 'bg-subtle' : 'hover:bg-hover',
          )}
        >
          <span className="min-w-0 flex-1">
            <span className="block font-mono text-label text-muted">
              {formatTicketId(row.number)}
            </span>
            <span className="block truncate text-ink-2">{row.subject}</span>
          </span>
          <PriorityBadge priority={row.priority} />
        </Link>
      ))}
    </aside>
  );
}
