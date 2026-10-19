'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/badge';
import { formatTicketId } from '@/lib/ids';
import { addTicketLink, removeTicketLink } from './actions';
import type { LinkedTicketItem } from './types';

const LINK_TYPE_OPTIONS = [
  { value: 'BLOCKED_BY', label: 'Blocked by' },
  { value: 'BLOCKS', label: 'Blocks' },
  { value: 'RELATED_TO', label: 'Related to' },
] as const;

const LINK_TYPE_LABEL: Record<LinkedTicketItem['type'], string> = {
  BLOCKED_BY: 'Blocked by',
  BLOCKS: 'Blocks',
  RELATED_TO: 'Related to',
};

interface LinkedTicketsPanelProps {
  ticketNumber: number;
  links: LinkedTicketItem[];
  canLink: boolean;
}

export function LinkedTicketsPanel({ ticketNumber, links, canLink }: LinkedTicketsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [targetInput, setTargetInput] = useState('');
  const [type, setType] = useState<(typeof LINK_TYPE_OPTIONS)[number]['value']>('RELATED_TO');
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const targetTicketNumber = Number(targetInput.trim().replace(/^MLT-/i, ''));
    if (!Number.isInteger(targetTicketNumber) || targetTicketNumber <= 0) {
      setError('Enter a valid ticket number');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addTicketLink({ ticketNumber, targetTicketNumber, type });
      if (!result.ok) {
        setError(result.fieldErrors._form?.[0] ?? 'Could not link that ticket.');
        return;
      }
      setTargetInput('');
      router.refresh();
    });
  }

  function handleRemove(link: LinkedTicketItem) {
    startTransition(async () => {
      await removeTicketLink({
        ticketNumber,
        targetTicketNumber: link.ticket.number,
        type: link.type,
      });
      router.refresh();
    });
  }

  if (!canLink && links.length === 0) return null;

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <h2 className="mb-2 text-label font-mono uppercase tracking-wide text-faint">
        Linked tickets
      </h2>

      {links.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {links.map((link) => (
            <li
              key={`${link.type}-${link.ticket.number}`}
              className="group flex items-center gap-2 text-small"
            >
              <span className="w-[82px] shrink-0 text-label font-mono uppercase text-muted">
                {LINK_TYPE_LABEL[link.type]}
              </span>
              <Link
                href={`/tickets/${link.ticket.number}`}
                className="min-w-0 flex-1 truncate text-ink-2 hover:underline"
              >
                {formatTicketId(link.ticket.number)} · {link.ticket.subject}
              </Link>
              <StatusBadge status={link.ticket.status} />
              {canLink ? (
                <button
                  type="button"
                  className="text-faint opacity-0 hover:text-danger-fg group-hover:opacity-100"
                  disabled={isPending}
                  onClick={() => handleRemove(link)}
                  aria-label={`Remove link to ${formatTicketId(link.ticket.number)}`}
                >
                  <X size={14} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {canLink ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <Select
              className="w-[130px]"
              value={type}
              disabled={isPending}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              {LINK_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input
              className="h-9 flex-1"
              placeholder="Ticket number"
              value={targetInput}
              disabled={isPending}
              onChange={(e) => setTargetInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              disabled={isPending || !targetInput.trim()}
              onClick={handleAdd}
            >
              Link
            </Button>
          </div>
          {error ? <p className="text-small text-danger-fg">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
