'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

export type InboxViewMode = 'list' | 'board' | 'calendar';

const MODES: { id: InboxViewMode; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'board', label: 'Board' },
  { id: 'calendar', label: 'Calendar' },
];

export function ViewModeSwitch({ active }: { active: InboxViewMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div className="flex w-fit gap-1 rounded-control bg-navy p-1">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => {
            const next = new URLSearchParams(searchParams.toString());
            if (mode.id === 'list') next.delete('view');
            else next.set('view', mode.id);
            router.push(`/inbox?${next.toString()}`);
          }}
          className={cn(
            'rounded-chip px-3 py-1.5 text-small font-medium transition-colors',
            mode.id === active ? 'bg-teal-deep text-white' : 'text-white/70 hover:text-white',
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
