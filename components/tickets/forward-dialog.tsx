'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useUndoToast } from '@/components/ui/undo-toast';
import { forwardTicket } from './actions';
import type { DepartmentOption } from './types';

interface ForwardDialogProps {
  ticketNumber: number;
  currentDepartmentId: string;
  confidential: boolean;
  departments: DepartmentOption[];
}

export function ForwardDialog({
  ticketNumber,
  currentDepartmentId,
  confidential,
  departments,
}: ForwardDialogProps) {
  const router = useRouter();
  const { runWithUndo } = useUndoToast();
  const [open, setOpen] = useState(false);
  const [targetDepartmentId, setTargetDepartmentId] = useState('');
  const [reason, setReason] = useState('');
  const [makeConfidential, setMakeConfidential] = useState(confidential);
  const [error, setError] = useState<string | null>(null);

  const targets = departments.filter((d) => d.id !== currentDepartmentId);

  function handleTargetChange(id: string) {
    setTargetDepartmentId(id);
    const department = departments.find((d) => d.id === id);
    if (department?.confidentialByDefault) setMakeConfidential(true);
  }

  function handleSubmit() {
    if (!targetDepartmentId) {
      setError('Choose a department');
      return;
    }
    if (!reason.trim()) {
      setError('A reason is required to forward a ticket');
      return;
    }

    const payload = {
      ticketNumber,
      targetDepartmentId,
      reason: reason.trim(),
      confidential: makeConfidential,
    };

    setOpen(false);
    setTargetDepartmentId('');
    setReason('');

    runWithUndo({
      label: 'Ticket forwarded',
      kind: 'forward',
      payload,
      commit: () => forwardTicket(payload),
      onSettled: () => router.refresh(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" className="w-full justify-start">
          <ArrowRightLeft size={16} />
          Forward to another department
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[420px] p-5">
        <DialogTitle className="text-subject font-semibold text-ink">Forward ticket</DialogTitle>
        <DialogDescription className="mt-1 text-small text-muted">
          Closes this department&apos;s leg and opens a new one. A reason is required.
        </DialogDescription>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-small font-medium text-ink">Department</label>
            <Select value={targetDepartmentId} onChange={(e) => handleTargetChange(e.target.value)}>
              <option value="">Choose a department…</option>
              {targets.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-small font-medium text-ink">Reason</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this moving departments?"
            />
          </div>

          <label className="flex items-center gap-2 text-small text-ink-2">
            <Checkbox
              checked={makeConfidential}
              onChange={(e) => setMakeConfidential(e.target.checked)}
            />
            Keep this ticket confidential
          </label>

          {error ? <p className="text-small text-danger-fg">{error}</p> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleSubmit}>
            Forward
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
