'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useUndoToast } from '@/components/ui/undo-toast';
import { addNoteToTicket, replyToTicket, uploadTicketAttachment } from './actions';
import { MentionPicker, type Mention } from './mention-picker';
import type { CannedReplyOption } from './types';

type Tab = 'reply' | 'note';

interface PendingAttachment {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
}

interface DraftState {
  tab: Tab;
  body: string;
}

interface ComposerProps {
  ticketNumber: number;
  requesterName: string;
  canReply: boolean;
  canAddNote: boolean;
  cannedReplies: CannedReplyOption[];
  signature: string | null;
}

function draftKey(ticketNumber: number): string {
  return `milife:ticket-draft-${ticketNumber}`;
}

function loadDraft(ticketNumber: number, defaultTab: Tab): DraftState {
  if (typeof window === 'undefined') return { tab: defaultTab, body: '' };
  const saved = window.localStorage.getItem(draftKey(ticketNumber));
  if (!saved) return { tab: defaultTab, body: '' };
  try {
    return JSON.parse(saved) as DraftState;
  } catch {
    return { tab: defaultTab, body: '' };
  }
}

export function Composer({
  ticketNumber,
  requesterName,
  canReply,
  canAddNote,
  cannedReplies,
  signature,
}: ComposerProps) {
  const router = useRouter();
  const { runWithUndo } = useUndoToast();
  const defaultTab: Tab = canReply ? 'reply' : 'note';
  const [draft, setDraft] = useState<DraftState>(() => loadDraft(ticketNumber, defaultTab));
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.localStorage.setItem(draftKey(ticketNumber), JSON.stringify(draft));
  }, [draft, ticketNumber]);

  if (!canReply && !canAddNote) return null;

  async function handleAttach(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.set('ticketNumber', String(ticketNumber));
    formData.set('file', file);
    const result = await uploadTicketAttachment(formData);
    setUploading(false);

    if (!result.ok) {
      setError(result.fieldErrors._form?.[0] ?? 'Could not attach that file.');
      return;
    }
    setAttachments((current) => [...current, result.data]);
  }

  function removeAttachment(storageKey: string) {
    setAttachments((current) => current.filter((a) => a.storageKey !== storageKey));
  }

  function handleSend() {
    const body = draft.tab === 'reply' && signature ? `${draft.body}\n\n${signature}` : draft.body;
    if (!body.trim()) {
      setError(
        draft.tab === 'reply' ? 'Write a reply before sending' : 'Write a note before sending',
      );
      return;
    }

    const payload = {
      ticketNumber,
      body,
      mentions: {
        people: mentions.filter((m) => m.type === 'person').map((m) => m.id),
        departments: mentions.filter((m) => m.type === 'department').map((m) => m.id),
      },
      attachments,
    };

    setSent(true);
    setDraft({ tab: draft.tab, body: '' });
    setMentions([]);
    setAttachments([]);
    window.localStorage.removeItem(draftKey(ticketNumber));

    runWithUndo({
      label: draft.tab === 'reply' ? 'Reply sent' : 'Note added',
      kind: draft.tab === 'reply' ? 'reply' : 'note',
      payload,
      commit: () => (draft.tab === 'reply' ? replyToTicket(payload) : addNoteToTicket(payload)),
      onSettled: () => {
        setSent(false);
        router.refresh();
      },
    });
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3">
      <div className="flex w-fit gap-1 rounded-control bg-subtle p-1">
        {canReply ? (
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, tab: 'reply' }))}
            className={cn(
              'rounded-chip px-3 py-1.5 text-small font-medium transition-colors',
              draft.tab === 'reply' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            Reply
          </button>
        ) : null}
        {canAddNote ? (
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, tab: 'note' }))}
            className={cn(
              'rounded-chip px-3 py-1.5 text-small font-medium transition-colors',
              draft.tab === 'note' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            Internal note
          </button>
        ) : null}
      </div>

      {cannedReplies.length > 0 ? (
        <Select
          className="h-9 w-fit"
          value=""
          onChange={(event) => {
            const reply = cannedReplies.find((r) => r.id === event.target.value);
            if (reply)
              setDraft((d) => ({ ...d, body: d.body ? `${d.body}\n\n${reply.body}` : reply.body }));
          }}
        >
          <option value="">Canned replies…</option>
          {cannedReplies.map((reply) => (
            <option key={reply.id} value={reply.id}>
              {reply.title}
            </option>
          ))}
        </Select>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip size={14} />
          {uploading ? 'Uploading…' : 'Attach'}
        </Button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleAttach} />
        <MentionPicker ticketNumber={ticketNumber} selected={mentions} onChange={setMentions} />
      </div>

      {mentions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {mentions.map((mention) => (
            <span
              key={`${mention.type}-${mention.id}`}
              className="flex items-center gap-1 rounded-chip bg-subtle px-2 py-1 text-label text-ink-2"
            >
              @{mention.label}
              <button
                type="button"
                onClick={() => setMentions(mentions.filter((m) => m !== mention))}
                aria-label={`Remove mention of ${mention.label}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((attachment) => (
            <span
              key={attachment.storageKey}
              className="flex items-center gap-1 rounded-chip bg-subtle px-2 py-1 text-label text-ink-2"
            >
              {attachment.filename}
              <button
                type="button"
                onClick={() => removeAttachment(attachment.storageKey)}
                aria-label={`Remove ${attachment.filename}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <Textarea
        value={draft.body}
        onChange={(event) => setDraft((d) => ({ ...d, body: event.target.value }))}
        placeholder={
          draft.tab === 'reply' ? `Reply to ${requesterName}…` : 'Write an internal note…'
        }
        rows={4}
        disabled={sent}
        aria-invalid={error ? true : undefined}
      />

      {error ? <p className="text-small text-danger-fg">{error}</p> : null}

      <div className="flex items-center justify-between">
        <span className="text-label text-faint">
          {draft.tab === 'reply' ? `Notifies ${requesterName}` : 'Draft saved'}
        </span>
        <Button type="button" size="sm" disabled={sent || uploading} onClick={handleSend}>
          Send
        </Button>
      </div>
    </div>
  );
}
