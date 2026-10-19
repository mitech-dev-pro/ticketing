'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { formatTicketId } from '@/lib/ids';
import {
  assignTicket,
  bulkAssignTickets,
  bulkResolveTickets,
  pickUpTicket,
  setTicketPriority,
  setTicketStatus,
} from './actions';
import { HoverPreview } from './hover-preview';
import type { DepartmentMember, InboxRow } from './types';

const PRIORITY_OPTIONS = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const;
const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'AWAITING_REQUESTER', 'RESOLVED', 'CLOSED'] as const;

const PRIORITY_SELECT_CLASSES: Record<string, string> = {
  URGENT: 'bg-urgent/15 text-urgent',
  HIGH: 'bg-high/15 text-high',
  MEDIUM: 'bg-medium/15 text-medium',
  LOW: 'bg-low/15 text-low',
};

const STATUS_SELECT_CLASSES: Record<string, string> = {
  OPEN: 'bg-status-open text-status-open-fg',
  IN_PROGRESS: 'bg-status-progress text-status-progress-fg',
  AWAITING_REQUESTER: 'bg-status-pending text-status-pending-fg',
  RESOLVED: 'bg-status-resolved text-status-resolved-fg',
  CLOSED: 'bg-status-closed text-status-closed-fg',
};

const DEADLINE_TONE_CLASSES: Record<string, string> = {
  normal: 'text-muted',
  warning: 'text-high',
  danger: 'text-urgent',
};

const POLL_INTERVAL_MS = 20_000; // D-10: polling refresh, no websockets.

interface InboxTableProps {
  rows: InboxRow[];
  members: DepartmentMember[];
  canManageDept: boolean;
  canBulkActions: boolean;
}

export function InboxTable({ rows, members, canManageDept, canBulkActions }: InboxTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState('');

  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  // Rows change on every refresh (resolved tickets drop off, etc.) — derive the
  // still-visible selection instead of pruning `selected` in an effect.
  const selectedVisible = useMemo(
    () => new Set([...selected].filter((number) => rows.some((row) => row.number === number))),
    [selected, rows],
  );

  function toggleRow(number: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  }

  function toggleAll() {
    setSelected(
      selectedVisible.size === rows.length ? new Set() : new Set(rows.map((row) => row.number)),
    );
  }

  function handlePriorityChange(ticketNumber: number, priority: string) {
    startTransition(async () => {
      await setTicketPriority({ ticketNumber, priority });
      router.refresh();
    });
  }

  function handleStatusChange(ticketNumber: number, status: string) {
    startTransition(async () => {
      await setTicketStatus({ ticketNumber, status });
      router.refresh();
    });
  }

  function handleAssigneeChange(ticketNumber: number, assigneeId: string) {
    if (!assigneeId) return;
    startTransition(async () => {
      await assignTicket({ ticketNumber, assigneeId });
      router.refresh();
    });
  }

  function handlePickUp(ticketNumber: number) {
    startTransition(async () => {
      await pickUpTicket({ ticketNumber });
      router.refresh();
    });
  }

  function handleBulkAssign() {
    if (!bulkAssignee || selectedVisible.size === 0) return;
    startTransition(async () => {
      await bulkAssignTickets({ ticketNumbers: [...selectedVisible], assigneeId: bulkAssignee });
      setSelected(new Set());
      setBulkAssignee('');
      router.refresh();
    });
  }

  function handleBulkResolve() {
    if (selectedVisible.size === 0) return;
    startTransition(async () => {
      await bulkResolveTickets({ ticketNumbers: [...selectedVisible] });
      setSelected(new Set());
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface py-16 text-center">
        <p className="text-subject font-semibold text-ink">Inbox zero. Nice work.</p>
        <p className="text-small text-muted">Nothing here for this view.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canBulkActions && selectedVisible.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-control bg-navy px-4 py-2.5 text-small text-white">
          <span className="font-medium">{selectedVisible.size} selected</span>
          <div className="flex items-center gap-1.5">
            <Select
              className="h-8 w-40 bg-white text-ink"
              value={bulkAssignee}
              onChange={(event) => setBulkAssignee(event.target.value)}
            >
              <option value="">Assign to…</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!bulkAssignee || isPending}
              onClick={handleBulkAssign}
            >
              Apply
            </Button>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isPending}
            onClick={handleBulkResolve}
          >
            Mark resolved
          </Button>
          <button
            type="button"
            className="ml-auto text-small text-white/70 hover:text-white"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[760px] border-collapse text-small">
          <thead>
            <tr className="border-b border-line text-label font-mono uppercase tracking-wide text-faint">
              {canBulkActions ? (
                <th className="w-[34px] px-3 py-2.5 text-left">
                  <input
                    type="checkbox"
                    checked={selectedVisible.size === rows.length && rows.length > 0}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
              ) : null}
              <th className="px-3 py-2.5 text-left">Ticket</th>
              <th className="px-3 py-2.5 text-left">Priority</th>
              <th className="px-3 py-2.5 text-left">Status</th>
              <th className="px-3 py-2.5 text-left">Assignee</th>
              <th className="px-3 py-2.5 text-left">Deadline</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.number} className="border-b border-line-2 last:border-0 hover:bg-hover">
                {canBulkActions ? (
                  <td className="px-3 py-2.5 align-top">
                    {!row.locked ? (
                      <input
                        type="checkbox"
                        checked={selectedVisible.has(row.number)}
                        onChange={() => toggleRow(row.number)}
                        aria-label={`Select ${formatTicketId(row.number)}`}
                      />
                    ) : null}
                  </td>
                ) : null}
                <td className="px-3 py-2.5 align-top">
                  <HoverPreview ticketNumber={row.number} status={row.status}>
                    <Link
                      href={`/tickets/${row.number}?from=inbox`}
                      className="block hover:underline"
                    >
                      <div className="font-mono text-label text-muted">
                        {formatTicketId(row.number)}
                      </div>
                      <div className="font-medium text-ink">
                        {row.subject}
                        {row.confidential ? (
                          <span className="ml-1.5 rounded-chip bg-line px-1.5 py-0.5 text-label font-mono uppercase text-muted">
                            Confidential
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </HoverPreview>
                  <div className="text-small text-muted">
                    {row.requesterName} · {row.requesterDepartmentName}
                  </div>
                </td>
                <td className="px-3 py-2.5 align-top">
                  <Select
                    className={`h-8 w-[110px] border-0 text-label font-mono uppercase ${PRIORITY_SELECT_CLASSES[row.priority]}`}
                    value={row.priority}
                    disabled={!canManageDept || row.locked || isPending}
                    onChange={(event) => handlePriorityChange(row.number, event.target.value)}
                  >
                    {PRIORITY_OPTIONS.map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-3 py-2.5 align-top">
                  <Select
                    className={`h-8 w-[150px] border-0 text-label font-mono uppercase ${STATUS_SELECT_CLASSES[row.status]}`}
                    value={row.status}
                    disabled={!canManageDept || row.locked || isPending}
                    onChange={(event) => handleStatusChange(row.number, event.target.value)}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status.replace('_', ' ')}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-3 py-2.5 align-top">
                  {canBulkActions ? (
                    <Select
                      className="h-8 w-[130px]"
                      value={row.assigneeId ?? ''}
                      disabled={row.locked || isPending}
                      onChange={(event) => handleAssigneeChange(row.number, event.target.value)}
                    >
                      <option value="" disabled>
                        {row.assigneeName ?? 'Unassigned'}
                      </option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </Select>
                  ) : row.canPickUp ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handlePickUp(row.number)}
                    >
                      Pick up
                    </Button>
                  ) : (
                    <span className="text-ink-2">{row.assigneeName ?? 'Unassigned'}</span>
                  )}
                </td>
                <td
                  className={`px-3 py-2.5 align-top font-mono ${DEADLINE_TONE_CLASSES[row.deadlineTone]}`}
                  title={row.deadlineAbsolute}
                >
                  {row.deadlineLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
