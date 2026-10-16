'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { Button } from '@/components/ui/button';
import { PriorityBadge, StatusBadge } from '@/components/ui/badge';
import { formatTicketId } from '@/lib/ids';
import { cn } from '@/lib/utils';
import { acknowledgeEscalationAction } from './actions';
import type { EscalationRow } from './types';

const DISPLAY_TIME_ZONE = 'Africa/Accra';

function timeLabel(iso: string): string {
  return format(new TZDate(new Date(iso), DISPLAY_TIME_ZONE), 'd MMM, h:mmaaa');
}

function AcknowledgeButton({ escalationId }: { escalationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await acknowledgeEscalationAction({ escalationId });
          router.refresh();
        })
      }
    >
      Acknowledge
    </Button>
  );
}

export function EscalationList({ rows }: { rows: EscalationRow[] }) {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const visible = onlyOpen ? rows.filter((row) => !row.acknowledgedAt) : rows;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOnlyOpen((v) => !v)}
        className={cn(
          'w-fit rounded-chip border px-3 py-1.5 text-small font-medium transition-colors',
          onlyOpen
            ? 'border-teal-deep bg-teal-deep/10 text-teal-deep'
            : 'border-line text-muted hover:text-ink',
        )}
      >
        {onlyOpen ? 'Showing open only' : 'Showing all'}
      </button>

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[760px] border-collapse text-small">
          <thead>
            <tr className="border-b border-line text-label font-mono uppercase tracking-wide text-faint">
              <th className="px-3 py-2.5 text-left">Ticket</th>
              <th className="px-3 py-2.5 text-left">Level</th>
              <th className="px-3 py-2.5 text-left">Priority</th>
              <th className="px-3 py-2.5 text-left">Status</th>
              <th className="px-3 py-2.5 text-left">Raised</th>
              <th className="px-3 py-2.5 text-left">Acknowledged</th>
              <th className="px-3 py-2.5 text-left" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="border-b border-line-2 last:border-0 hover:bg-hover">
                <td className="px-3 py-2.5 align-top">
                  <Link href={`/tickets/${row.ticketNumber}`} className="hover:underline">
                    <div className="font-mono text-label text-muted">
                      {formatTicketId(row.ticketNumber)}
                    </div>
                    <div className="font-medium text-ink">{row.ticketSubject}</div>
                  </Link>
                  {row.reason ? (
                    <div className="mt-0.5 text-small text-muted">{row.reason}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <span className="rounded-chip bg-urgent/15 px-2 py-0.5 text-label font-mono uppercase text-urgent">
                    L{row.level}
                  </span>
                </td>
                <td className="px-3 py-2.5 align-top">
                  <PriorityBadge priority={row.ticketPriority} />
                </td>
                <td className="px-3 py-2.5 align-top">
                  <StatusBadge status={row.ticketStatus} />
                </td>
                <td className="px-3 py-2.5 align-top text-ink-2">
                  {timeLabel(row.at)}
                  <div className="text-label text-faint">{row.byName ?? 'System (breach)'}</div>
                </td>
                <td className="px-3 py-2.5 align-top text-ink-2">
                  {row.acknowledgedAt ? (
                    <>
                      {timeLabel(row.acknowledgedAt)}
                      <div className="text-label text-faint">{row.acknowledgedByName}</div>
                    </>
                  ) : (
                    <span className="text-muted">Open</span>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top">
                  {!row.acknowledgedAt && row.canAcknowledge ? (
                    <AcknowledgeButton escalationId={row.id} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
