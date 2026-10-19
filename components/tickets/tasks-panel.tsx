'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { addTicketTask, removeTicketTask, toggleTicketTask } from './actions';
import type { TaskItem } from './types';

interface TasksPanelProps {
  ticketNumber: number;
  tasks: TaskItem[];
  canManage: boolean;
}

export function TasksPanel({ ticketNumber, tasks, canManage }: TasksPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState('');

  const done = tasks.filter((task) => task.done).length;
  const percent = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

  function handleAdd() {
    const trimmed = text.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await addTicketTask({ ticketNumber, text: trimmed });
      setText('');
      router.refresh();
    });
  }

  function handleToggle(taskId: string) {
    startTransition(async () => {
      await toggleTicketTask({ ticketNumber, taskId });
      router.refresh();
    });
  }

  function handleRemove(taskId: string) {
    startTransition(async () => {
      await removeTicketTask({ ticketNumber, taskId });
      router.refresh();
    });
  }

  if (!canManage && tasks.length === 0) return null;

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-label font-mono uppercase tracking-wide text-faint">Tasks</h2>
        {tasks.length > 0 ? (
          <span className="font-mono text-label text-muted">
            {done}/{tasks.length}
          </span>
        ) : null}
      </div>

      {tasks.length > 0 ? (
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-subtle">
          <div className="h-full rounded-full bg-teal-deep" style={{ width: `${percent}%` }} />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <div key={task.id} className="group flex items-center gap-2 text-small">
            <Checkbox
              checked={task.done}
              disabled={!canManage || isPending}
              onChange={() => handleToggle(task.id)}
            />
            <span className={cn('flex-1', task.done && 'text-muted line-through')}>
              {task.text}
            </span>
            {canManage ? (
              <button
                type="button"
                className="text-faint opacity-0 hover:text-danger-fg group-hover:opacity-100"
                disabled={isPending}
                onClick={() => handleRemove(task.id)}
                aria-label={`Remove task "${task.text}"`}
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {canManage ? (
        <div className="mt-3 flex gap-2">
          <Input
            className="h-9"
            value={text}
            placeholder="Add a task…"
            disabled={isPending}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button type="button" size="sm" disabled={isPending || !text.trim()} onClick={handleAdd}>
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}
