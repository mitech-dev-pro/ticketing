import Link from 'next/link';
import { StatusBadge } from '@/components/ui/badge';
import { formatTicketId } from '@/lib/ids';
import type { SubTicketItem } from './types';

const CLOSED_STATUSES = new Set(['RESOLVED', 'CLOSED']);

export function SubTicketsList({ subTickets }: { subTickets: SubTicketItem[] }) {
  const done = subTickets.filter((t) => CLOSED_STATUSES.has(t.status)).length;
  const percent = Math.round((done / subTickets.length) * 100);

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-label font-mono uppercase tracking-wide text-faint">Sub-tickets</h2>
        <span className="font-mono text-label text-muted">
          {done}/{subTickets.length}
        </span>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-subtle">
        <div className="h-full rounded-full bg-teal-deep" style={{ width: `${percent}%` }} />
      </div>
      <ul className="flex flex-col gap-2 text-small">
        {subTickets.map((subTicket) => (
          <li key={subTicket.number} className="flex items-center gap-2">
            <Link
              href={`/tickets/${subTicket.number}`}
              className="min-w-0 flex-1 truncate text-ink-2 hover:underline"
            >
              {formatTicketId(subTicket.number)} · {subTicket.subject}
            </Link>
            <StatusBadge status={subTicket.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}
