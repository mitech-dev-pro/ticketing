'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { escalateTicket } from './actions';

export function EscalateDialog({ ticketNumber }: { ticketNumber: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!reason.trim()) {
      setError('A reason is required to escalate a ticket');
      return;
    }
    setSubmitting(true);
    const result = await escalateTicket({ ticketNumber, reason: reason.trim() });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.fieldErrors._form?.[0] ?? 'Could not escalate this ticket.');
      return;
    }
    setOpen(false);
    setReason('');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          className="w-full justify-start border border-urgent/30 bg-urgent/10 text-urgent hover:bg-urgent/15"
        >
          <AlertTriangle size={16} />
          Escalate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[420px] p-5">
        <DialogTitle className="text-subject font-semibold text-ink">Escalate ticket</DialogTitle>
        <DialogDescription className="mt-1 text-small text-muted">
          Sends this to the next escalation level with a reason.
        </DialogDescription>

        <div className="mt-4">
          <label className="mb-1 block text-small font-medium text-ink">Reason</label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why does this need to be escalated?"
          />
          {error ? <p className="mt-1.5 text-small text-danger-fg">{error}</p> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" disabled={submitting} onClick={handleSubmit}>
            Escalate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
