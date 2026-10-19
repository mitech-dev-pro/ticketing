'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QUICK_TIME_MINUTES } from '@/lib/validation/time';
import { logTicketQuickTime, startTicketTimer, stopTicketTimer } from './actions';
import type { TimeEntryItem } from './types';

interface TimePanelProps {
  ticketNumber: number;
  entries: TimeEntryItem[];
  runningTimerStartedAt: string | null;
  canLog: boolean;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function totalMinutesLabel(entries: TimeEntryItem[]): string {
  const total = entries.reduce((sum, entry) => sum + entry.minutes, 0);
  if (total < 60) return `${total}m`;
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

export function TimePanel({
  ticketNumber,
  entries,
  runningTimerStartedAt,
  canLog,
}: TimePanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!runningTimerStartedAt) return;
    const startedAt = new Date(runningTimerStartedAt).getTime();
    const tick = () => setElapsedMs(Date.now() - startedAt);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [runningTimerStartedAt]);

  function handleStart() {
    startTransition(async () => {
      await startTicketTimer({ ticketNumber });
      router.refresh();
    });
  }

  function handleStop() {
    startTransition(async () => {
      await stopTicketTimer({ ticketNumber });
      router.refresh();
    });
  }

  function handleQuick(minutes: number) {
    startTransition(async () => {
      await logTicketQuickTime({ ticketNumber, minutes });
      router.refresh();
    });
  }

  if (!canLog && entries.length === 0) return null;

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-label font-mono uppercase tracking-wide text-faint">Time logged</h2>
        {entries.length > 0 ? (
          <span className="font-mono text-label text-muted">{totalMinutesLabel(entries)}</span>
        ) : null}
      </div>

      {canLog ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            {runningTimerStartedAt ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="border border-urgent/30 bg-urgent/10 text-urgent hover:bg-urgent/15"
                disabled={isPending}
                onClick={handleStop}
              >
                <Pause size={14} />
                Stop
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isPending}
                onClick={handleStart}
              >
                <Play size={14} />
                Start timer
              </Button>
            )}
            {runningTimerStartedAt ? (
              <span className="font-mono text-small text-urgent">{formatElapsed(elapsedMs)}</span>
            ) : null}
          </div>

          <div className="flex gap-1.5">
            {QUICK_TIME_MINUTES.map((minutes) => (
              <Button
                key={minutes}
                type="button"
                variant="ghost"
                size="sm"
                className="border border-line"
                disabled={isPending}
                onClick={() => handleQuick(minutes)}
              >
                +{minutes < 60 ? `${minutes}m` : '1h'}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {entries.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5 text-small">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between text-ink-2">
              <span>{entry.userName}</span>
              <span className="font-mono text-muted">{entry.minutes}m</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
