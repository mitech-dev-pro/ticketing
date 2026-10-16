import { format } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { FileText } from 'lucide-react';
import { formatTicketId } from '@/lib/ids';
import { cn } from '@/lib/utils';
import type { ConversationEvent } from './types';

const DISPLAY_TIME_ZONE = 'Africa/Accra';
const GROUPING_WINDOW_MS = 15 * 60 * 1000;

function timeLabel(iso: string): string {
  return format(new TZDate(new Date(iso), DISPLAY_TIME_ZONE), 'h:mmaaa');
}

function dateLabel(iso: string): string {
  return format(new TZDate(new Date(iso), DISPLAY_TIME_ZONE), 'd MMM yyyy');
}

function systemEventText(event: ConversationEvent): string {
  const meta = event.meta ?? {};
  const by = event.byName ?? 'System';
  switch (event.type) {
    case 'CREATED':
      return `${by} raised this ticket`;
    case 'ASSIGNED':
      return meta.via === 'pickup' ? `${by} picked this ticket up` : `${by} assigned this ticket`;
    case 'FORWARDED':
      return `${by} forwarded this ticket`;
    case 'PRIORITY_CHANGED':
      return `${by} changed priority from ${String(meta.from)} to ${String(meta.to)}`;
    case 'STATUS_CHANGED':
      return `${by} changed status from ${String(meta.from)} to ${String(meta.to)}`;
    case 'RESOLVED':
      return `${by} marked this ticket resolved`;
    case 'REOPENED':
      return `${by} reopened this ticket`;
    case 'CONFIDENTIAL_CHANGED':
      return `${by} turned confidentiality ${meta.to ? 'on' : 'off'}`;
    case 'ESCALATED':
      return `${by} escalated this ticket`;
    case 'RATED':
      return `${by} rated this ${String(meta.stars)}/5`;
    case 'RATING_FOLLOWED_UP':
      return `${by} marked the low rating followed up`;
    case 'BLOCKED_BY':
    case 'BLOCKS':
    case 'RELATED_TO':
      return `${by} linked this ticket`;
    case 'MESSAGE':
    case 'NOTE':
      return '';
  }
}

function AttachmentCard({ attachment }: { attachment: ConversationEvent['attachments'][number] }) {
  const isImage = attachment.mimeType.startsWith('image/');
  const href = `/api/attachments/${attachment.id}`;

  // README: "attachments as cards (image thumbnail 112px or file icon)". PDFs preview
  // natively when opened in the new tab — the download route serves them with
  // Content-Disposition: inline (lib/storage.ts), so no separate embed is needed.
  if (isImage) {
    return (
      <a
        key={attachment.id}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-control border border-line"
        title={attachment.filename}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- same-origin API route, not a static asset */}
        <img src={href} alt={attachment.filename} className="h-[112px] w-[112px] object-cover" />
      </a>
    );
  }

  return (
    <a
      key={attachment.id}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-control border border-line bg-surface px-2.5 py-2 text-small text-ink-2 hover:bg-hover"
    >
      <FileText size={16} className="text-muted" />
      <span className="truncate">{attachment.filename}</span>
    </a>
  );
}

function MessageBubble({ event }: { event: ConversationEvent }) {
  const isNote = event.type === 'NOTE';
  return (
    <div
      className={cn(
        'max-w-[640px] rounded-card border px-4 py-3',
        isNote ? 'border-medium/30 bg-medium/10' : 'border-line bg-surface',
      )}
    >
      {isNote ? (
        <div className="mb-1 text-label font-mono uppercase tracking-wide text-medium">
          Internal note
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-ink">{event.byName ?? 'Unknown'}</span>
        <span className="text-label text-faint">{timeLabel(event.createdAt)}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-small text-ink-2">{event.body}</p>
      {event.attachments.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {event.attachments.map((attachment) => (
            <AttachmentCard key={attachment.id} attachment={attachment} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface ConversationGroup {
  kind: 'messages' | 'system';
  events: ConversationEvent[];
}

function groupEvents(events: ConversationEvent[]): ConversationGroup[] {
  const groups: ConversationGroup[] = [];
  for (const event of events) {
    const isMessage = event.type === 'MESSAGE' || event.type === 'NOTE';
    const last = groups.at(-1);
    if (!isMessage) {
      groups.push({ kind: 'system', events: [event] });
      continue;
    }
    const lastEvent = last?.events.at(-1);
    const withinWindow =
      lastEvent &&
      new Date(event.createdAt).getTime() - new Date(lastEvent.createdAt).getTime() <=
        GROUPING_WINDOW_MS;
    if (last?.kind === 'messages' && lastEvent?.byName === event.byName && withinWindow) {
      last.events.push(event);
    } else {
      groups.push({ kind: 'messages', events: [event] });
    }
  }
  return groups;
}

export function Conversation({
  ticketNumber,
  events,
}: {
  ticketNumber: number;
  events: ConversationEvent[];
}) {
  if (events.length === 0) {
    return (
      <p className="text-small text-muted">No activity yet on {formatTicketId(ticketNumber)}.</p>
    );
  }

  const groups = groupEvents(events);
  const dayLabels = groups.map((group) => dateLabel(group.events[0]!.createdAt));
  const withSeparators = groups.map((group, index) => ({
    group,
    day: dayLabels[index]!,
    showDaySeparator: dayLabels[index] !== dayLabels[index - 1],
  }));

  return (
    <div className="flex flex-col gap-4">
      {withSeparators.map(({ group, day, showDaySeparator }, index) => {
        const firstEvent = group.events[0]!;

        return (
          <div key={`${group.kind}-${firstEvent.id}-${index}`} className="flex flex-col gap-2">
            {showDaySeparator ? (
              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-line" />
                <span className="text-label font-mono uppercase tracking-wide text-faint">
                  {day}
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>
            ) : null}

            {group.kind === 'system' ? (
              <div className="flex items-center gap-2 text-label text-faint">
                <span className="rounded-chip bg-subtle px-2 py-1 font-mono">
                  {systemEventText(firstEvent)} · {timeLabel(firstEvent.createdAt)}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {group.events.map((event) => (
                  <MessageBubble key={event.id} event={event} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
