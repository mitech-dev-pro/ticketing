'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { INBOX_TABS, type InboxTab } from './types';

const PRIORITY_OPTIONS = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const;

interface InboxTabsProps {
  activeTab: InboxTab;
  counts: { id: InboxTab; count: number }[];
  priority?: string;
  /** Hours from now a ticket must be due within to match the "Due within" chip, or
   * null when the filter isn't active. Home's "Due in 24h" card links here with 24. */
  dueHours: number | null;
}

export function InboxTabs({ activeTab, counts, priority, dueHours }: InboxTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(mutate: (params: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams.toString());
    mutate(next);
    router.push(`/inbox?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex w-fit gap-1 rounded-control bg-subtle p-1">
        {INBOX_TABS.map((tab) => {
          const count = counts.find((c) => c.id === tab.id)?.count ?? 0;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate((params) => params.set('tab', tab.id))}
              className={cn(
                'rounded-chip px-3 py-1.5 text-small font-medium transition-colors',
                active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              {tab.label} <span className="font-mono text-label text-faint">{count}</span>
            </button>
          );
        })}
      </div>

      <select
        className="h-9 rounded-control border border-control bg-surface px-2 text-small text-ink"
        value={priority ?? ''}
        onChange={(event) =>
          navigate((params) => {
            if (event.target.value) params.set('priority', event.target.value);
            else params.delete('priority');
          })
        }
      >
        <option value="">All priorities</option>
        {PRIORITY_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() =>
          navigate((params) => {
            if (dueHours !== null) params.delete('due');
            else params.set('due', '4h');
          })
        }
        className={cn(
          'rounded-chip border px-3 py-1.5 text-small font-medium transition-colors',
          dueHours !== null
            ? 'border-teal-deep bg-teal-deep/10 text-teal-deep'
            : 'border-line text-muted hover:text-ink',
        )}
      >
        Due within {dueHours ?? 4}h
      </button>
    </div>
  );
}
