'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatTicketId } from '@/lib/ids';
import { PriorityBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { setTicketStatus } from './actions';
import type { InboxRow } from './types';
import type { TicketStatus } from '@/generated/prisma/client';

// README: "Board: 4 columns Open / In progress / Awaiting requester / Resolved (last
// 7 days), drag to change status". The query already caps the Resolved bucket to the
// last 7 days (app/(app)/inbox/page.tsx), so this just groups by status.
const COLUMNS: { status: TicketStatus; label: string }[] = [
  { status: 'OPEN', label: 'Open' },
  { status: 'IN_PROGRESS', label: 'In progress' },
  { status: 'AWAITING_REQUESTER', label: 'Awaiting requester' },
  { status: 'RESOLVED', label: 'Resolved' },
];

function columnFor(row: InboxRow): TicketStatus {
  return row.status === 'CLOSED' ? 'RESOLVED' : row.status;
}

export function BoardView({ rows, canManageDept }: { rows: InboxRow[]; canManageDept: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<TicketStatus | null>(null);

  function handleDrop(status: TicketStatus, ticketNumber: number) {
    setDragOver(null);
    startTransition(async () => {
      await setTicketStatus({ ticketNumber, status });
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((column) => {
        const columnRows = rows.filter((row) => columnFor(row) === column.status);
        return (
          <div
            key={column.status}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(column.status);
            }}
            onDragLeave={() =>
              setDragOver((current) => (current === column.status ? null : current))
            }
            onDrop={(e) => {
              e.preventDefault();
              const ticketNumber = Number(e.dataTransfer.getData('text/plain'));
              if (Number.isInteger(ticketNumber)) handleDrop(column.status, ticketNumber);
            }}
            className={cn(
              'flex flex-col gap-2 rounded-card border p-2',
              dragOver === column.status
                ? 'border-2 border-dashed border-teal-deep bg-teal-deep/10'
                : 'border-line bg-subtle',
            )}
          >
            <div className="flex items-center justify-between px-1 py-1">
              <span className="text-small font-semibold text-ink">{column.label}</span>
              <span className="font-mono text-label text-faint">{columnRows.length}</span>
            </div>

            <div className="flex flex-col gap-2">
              {columnRows.map((row) => (
                <Link
                  key={row.number}
                  href={`/tickets/${row.number}?from=inbox`}
                  draggable={canManageDept && !row.locked}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', String(row.number));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-control border border-line bg-surface p-2.5 text-small',
                    canManageDept && !row.locked ? 'cursor-grab active:cursor-grabbing' : '',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-label text-muted">
                      {formatTicketId(row.number)}
                    </span>
                    <PriorityBadge priority={row.priority} />
                  </div>
                  <span className="text-ink-2">{row.subject}</span>
                  <span className="text-label text-faint">{row.assigneeName ?? 'Unassigned'}</span>
                </Link>
              ))}
              {columnRows.length === 0 ? (
                <p className="px-1 py-2 text-label text-faint">Nothing here.</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
