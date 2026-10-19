'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatTicketId } from '@/lib/ids';
import { mergeTicketIntoAnother } from './actions';
import type { PossibleDuplicateItem } from './types';

interface DuplicatePanelProps {
  ticketNumber: number;
  duplicates: PossibleDuplicateItem[];
}

export function DuplicatePanel({ ticketNumber, duplicates }: DuplicatePanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleMerge(intoTicketNumber: number) {
    startTransition(async () => {
      const result = await mergeTicketIntoAnother({ ticketNumber, intoTicketNumber });
      if (!result.ok) {
        setError(result.fieldErrors._form?.[0] ?? 'Could not merge this ticket.');
        return;
      }
      router.refresh();
    });
  }

  if (dismissed) return null;

  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-subtle p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-small font-medium text-ink">
          <Copy size={14} className="text-muted" />
          Possible duplicate
        </h2>
        <button
          type="button"
          className="text-small text-muted hover:text-ink"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {duplicates.map((duplicate) => (
          <li key={duplicate.number} className="flex items-center justify-between gap-2 text-small">
            <span className="min-w-0 truncate text-ink-2">
              {formatTicketId(duplicate.number)} · {duplicate.subject}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0 border border-merge-fg/30 bg-merge text-merge-fg hover:bg-merge"
              disabled={isPending}
              onClick={() => handleMerge(duplicate.number)}
            >
              Merge into it
            </Button>
          </li>
        ))}
      </ul>
      {error ? <p className="text-small text-danger-fg">{error}</p> : null}
    </div>
  );
}
