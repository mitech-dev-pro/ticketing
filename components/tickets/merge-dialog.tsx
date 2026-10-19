'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitMerge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { mergeTicketIntoAnother } from './actions';

export function MergeDialog({ ticketNumber }: { ticketNumber: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const intoTicketNumber = Number(target.trim().replace(/^MLT-/i, ''));
    if (!Number.isInteger(intoTicketNumber) || intoTicketNumber <= 0) {
      setError('Enter a valid ticket number');
      return;
    }
    setSubmitting(true);
    const result = await mergeTicketIntoAnother({ ticketNumber, intoTicketNumber });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.fieldErrors._form?.[0] ?? 'Could not merge this ticket.');
      return;
    }
    setOpen(false);
    setTarget('');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" className="w-full justify-start">
          <GitMerge size={16} />
          Merge into another ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[420px] p-5">
        <DialogTitle className="text-subject font-semibold text-ink">
          Merge into another ticket
        </DialogTitle>
        <DialogDescription className="mt-1 text-small text-muted">
          This ticket will close and point to the one you choose.
        </DialogDescription>

        <div className="mt-4">
          <label className="mb-1 block text-small font-medium text-ink">Ticket number</label>
          <Input
            value={target}
            placeholder="e.g. 24827 or MLT-24827"
            onChange={(e) => setTarget(e.target.value)}
          />
          {error ? <p className="mt-1.5 text-small text-danger-fg">{error}</p> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" disabled={submitting || !target.trim()} onClick={handleSubmit}>
            Merge
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
