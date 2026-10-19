import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge, PriorityBadge, StatusBadge } from '@/components/ui/badge';
import { formatTicketId } from '@/lib/ids';
import { cn } from '@/lib/utils';
import type { TicketDetail } from './types';

function RelatedTicketLinks({ ticket }: { ticket: TicketDetail }) {
  if (!ticket.parent && !ticket.mergedInto) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 text-small text-muted">
      {ticket.parent ? (
        <Link href={`/tickets/${ticket.parent.number}`} className="hover:underline">
          Part of {formatTicketId(ticket.parent.number)} · {ticket.parent.subject}
        </Link>
      ) : null}
      {ticket.mergedInto ? (
        <Link href={`/tickets/${ticket.mergedInto.number}`} className="hover:underline">
          Merged into {formatTicketId(ticket.mergedInto.number)} · {ticket.mergedInto.subject}
        </Link>
      ) : null}
    </div>
  );
}

const DEADLINE_RING_COLOR: Record<TicketDetail['deadline']['tone'], string> = {
  normal: 'var(--color-teal-deep)',
  warning: 'var(--color-high)',
  danger: 'var(--color-urgent)',
};

function DeadlineRing({ ticket }: { ticket: TicketDetail }) {
  const percent = ticket.deadlinePercentElapsed;
  const color = DEADLINE_RING_COLOR[ticket.deadline.tone];

  return (
    <div className="flex items-center gap-3">
      <div
        className="relative flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(${color} ${percent}%, var(--color-line) ${percent}%)`,
        }}
      >
        <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-surface text-label font-mono font-semibold text-ink">
          {Math.round(percent)}%
        </div>
      </div>
      <div className="text-small">
        <div className="font-mono font-medium" style={{ color }}>
          {ticket.deadline.label}
        </div>
        <div className="text-muted">Due {ticket.deadline.absolute}</div>
      </div>
    </div>
  );
}

function JourneyStepper({ ticket }: { ticket: TicketDetail }) {
  const isResolved = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ticket.legs.map((leg, index) => {
        const isCurrent = leg.outAt === null && !isResolved;
        return (
          <div key={leg.id} className="flex items-center gap-1.5">
            {index > 0 ? <span className="h-px w-4 bg-line" /> : null}
            <div
              className="flex items-center gap-1.5 rounded-chip border border-line bg-surface px-2 py-1 text-small"
              title={leg.outAt ? `${leg.inAt} – ${leg.outAt}` : `Since ${leg.inAt}`}
            >
              <span
                className={cn('h-2 w-2 rounded-full', isCurrent && 'animate-pulse')}
                style={{ background: `oklch(0.6 0.11 ${leg.hue})` }}
              />
              <span className="text-ink-2">{leg.departmentName}</span>
            </div>
          </div>
        );
      })}
      {isResolved ? (
        <>
          <span className="h-px w-4 bg-line" />
          <div className="flex items-center gap-1.5 rounded-chip border border-status-resolved bg-status-resolved px-2 py-1 text-small text-status-resolved-fg">
            <span className="h-2 w-2 rounded-full bg-status-resolved-fg" />
            Resolved
          </div>
        </>
      ) : null}
    </div>
  );
}

function CustomFields({ ticket }: { ticket: TicketDetail }) {
  const entries = ticket.serviceType.fields.filter((field) => {
    const value = ticket.fields[field.label];
    return value !== undefined && value !== null && value !== '';
  });
  if (entries.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-card border border-line bg-surface p-4 text-small sm:grid-cols-3">
      {entries.map((field) => {
        const value = ticket.fields[field.label];
        const display = field.type === 'checkbox' ? (value ? 'Yes' : 'No') : String(value);
        return (
          <div key={field.label}>
            <div className="text-label font-mono uppercase tracking-wide text-faint">
              {field.label}
            </div>
            <div className="mt-0.5 text-ink">{display}</div>
          </div>
        );
      })}
    </div>
  );
}

export function TicketHeader({ ticket }: { ticket: TicketDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/inbox"
        className="flex w-fit items-center gap-1.5 text-small text-muted hover:text-ink"
      >
        <ArrowLeft size={14} />
        Back
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-label text-muted">{formatTicketId(ticket.number)}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            {ticket.confidential ? (
              <Badge className="bg-danger-fg/15 text-danger-fg">Confidential</Badge>
            ) : null}
            {ticket.openEscalationLevel ? (
              <Badge className="bg-urgent/15 text-urgent">
                Escalated L{ticket.openEscalationLevel}
              </Badge>
            ) : null}
            {ticket.blocked ? <Badge className="bg-high/15 text-high">Blocked</Badge> : null}
            {ticket.parent ? <Badge>Sub-ticket</Badge> : null}
          </div>
          <h1 className="text-title font-bold text-ink">{ticket.subject}</h1>
          <p className="text-small text-muted">
            {ticket.requester.name} · {ticket.requester.departmentName}
            {ticket.assignee ? ` · Assigned to ${ticket.assignee.name}` : ' · Unassigned'}
          </p>
          <RelatedTicketLinks ticket={ticket} />
        </div>

        {!(ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') ? (
          <DeadlineRing ticket={ticket} />
        ) : null}
      </div>

      <JourneyStepper ticket={ticket} />

      <p className="whitespace-pre-wrap text-small text-ink-2">{ticket.description}</p>

      <CustomFields ticket={ticket} />
    </div>
  );
}
