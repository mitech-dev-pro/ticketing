'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, GitMerge, ListPlus, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useUndoToast } from '@/components/ui/undo-toast';
import { assignTicket, setTicketPriority } from '@/components/inbox/actions';
import { resolveTicket } from './actions';
import { ForwardDialog } from './forward-dialog';
import type { DepartmentOption, MemberOption, TicketDetail, TicketPermissions } from './types';

const PRIORITY_OPTIONS = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const;
const PRIORITY_SELECT_CLASSES: Record<string, string> = {
  URGENT: 'bg-urgent/15 text-urgent',
  HIGH: 'bg-high/15 text-high',
  MEDIUM: 'bg-medium/15 text-medium',
  LOW: 'bg-low/15 text-low',
};

interface ActionsPanelProps {
  ticket: TicketDetail;
  permissions: TicketPermissions;
  members: MemberOption[];
  departments: DepartmentOption[];
}

export function ActionsPanel({ ticket, permissions, members, departments }: ActionsPanelProps) {
  const router = useRouter();
  const { runWithUndo } = useUndoToast();
  const [isPending, startTransition] = useTransition();

  function handleAssigneeChange(assigneeId: string) {
    if (!assigneeId) return;
    startTransition(async () => {
      await assignTicket({ ticketNumber: ticket.number, assigneeId });
      router.refresh();
    });
  }

  function handlePriorityChange(priority: string) {
    startTransition(async () => {
      await setTicketPriority({ ticketNumber: ticket.number, priority });
      router.refresh();
    });
  }

  function handleResolve() {
    const payload = { ticketNumber: ticket.number };
    runWithUndo({
      label: 'Marked resolved',
      kind: 'resolve',
      payload,
      commit: () => resolveTicket(payload),
      onSettled: () => router.refresh(),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-line bg-surface p-4">
        <h2 className="mb-3 text-label font-mono uppercase tracking-wide text-faint">Actions</h2>
        <div className="flex flex-col gap-2.5">
          {permissions.assign ? (
            <div>
              <label className="mb-1 block text-small font-medium text-ink">Assignee</label>
              <Select
                value={ticket.assignee?.id ?? ''}
                disabled={isPending || ticket.locked}
                onChange={(e) => handleAssigneeChange(e.target.value)}
              >
                <option value="" disabled>
                  {ticket.assignee?.name ?? 'Unassigned'}
                </option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {permissions.setPriority ? (
            <div>
              <label className="mb-1 block text-small font-medium text-ink">Priority</label>
              <Select
                className={PRIORITY_SELECT_CLASSES[ticket.priority]}
                value={ticket.priority}
                disabled={isPending || ticket.locked}
                onChange={(e) => handlePriorityChange(e.target.value)}
              >
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          {permissions.forward ? (
            <ForwardDialog
              ticketNumber={ticket.number}
              currentDepartmentId={ticket.currentDepartmentId}
              confidential={ticket.confidential}
              departments={departments}
            />
          ) : null}

          {permissions.resolve ? (
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-start border border-status-resolved bg-status-resolved text-status-resolved-fg hover:bg-status-resolved"
              onClick={handleResolve}
            >
              <CheckCircle2 size={16} />
              Mark resolved
            </Button>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start"
            disabled
            title="Coming in Phase 6"
          >
            <GitMerge size={16} />
            Merge into another ticket
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start"
            disabled
            title="Coming in Phase 6"
          >
            <ListPlus size={16} />
            Add sub-ticket
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start"
            disabled
            title="Coming in Phase 7"
          >
            <Printer size={16} />
            Print or save as PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
