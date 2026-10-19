import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatTicketId } from '@/lib/ids';
import { PriorityBadge } from '@/components/ui/badge';
import type { Priority } from '@/generated/prisma/client';

export interface HomeTicketRow {
  number: number;
  subject: string;
  priority: Priority;
  meta: string;
}

interface ListCardProps {
  title: string;
  viewAllHref?: string;
  emptyText: string;
  rows: HomeTicketRow[];
  children?: ReactNode;
}

export function ListCard({ title, viewAllHref, emptyText, rows, children }: ListCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-small font-semibold text-ink">{title}</h2>
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="text-label font-medium text-teal-deep hover:underline"
          >
            View all
          </Link>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-small text-muted">{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <Link
              key={row.number}
              href={`/tickets/${row.number}`}
              className="flex items-start justify-between gap-2 rounded-control px-1 py-1 text-small hover:bg-hover"
            >
              <span className="min-w-0">
                <span className="font-mono text-label text-muted">
                  {formatTicketId(row.number)}
                </span>{' '}
                <span className="text-ink-2">{row.subject}</span>
                <span className="block text-label text-faint">{row.meta}</span>
              </span>
              <PriorityBadge priority={row.priority} />
            </Link>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
