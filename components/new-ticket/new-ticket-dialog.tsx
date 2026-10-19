'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Step1Suggest } from './step-1-suggest';
import { Step2Form } from './step-2-form';
import {
  EMPTY_DRAFT,
  type NewTicketData,
  type NewTicketDraft,
  type NewTicketServiceType,
} from './types';

const DRAFT_STORAGE_KEY = 'milife:new-ticket-draft';

function loadDraft(): NewTicketDraft {
  if (typeof window === 'undefined') return EMPTY_DRAFT;
  const saved = window.localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!saved) return EMPTY_DRAFT;
  try {
    return JSON.parse(saved) as NewTicketDraft;
  } catch {
    return EMPTY_DRAFT;
  }
}

interface NewTicketDialogProps {
  data: NewTicketData;
  /** Department pages' "New request to X" reuses this dialog with its own trigger
   * button and jumps straight to Step 2 pre-scoped to that department, instead of the
   * default "+ New ticket" button and Step 1 classifier. */
  trigger?: ReactNode;
  initialDepartmentId?: string;
}

export function NewTicketDialog({ data, trigger, initialDepartmentId }: NewTicketDialogProps) {
  const [open, setOpen] = useState(false);
  // README: "Unsent draft restored on reopen" — loaded once, lazily, from localStorage
  // (the dialog's content isn't in the DOM while closed, so there's no hydration
  // mismatch) and persisted on every change. Only cleared on a successful submit
  // (see handleSubmitted).
  const [draft, setDraft] = useState<NewTicketDraft>(loadDraft);
  const [step, setStep] = useState<'suggest' | 'form'>(() =>
    initialDepartmentId || draft.serviceTypeId ? 'form' : 'suggest',
  );

  useEffect(() => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    if (initialDepartmentId && !draft.serviceTypeId) goToStep2();
    // Only ever want this on mount, with whatever draft/initialDepartmentId came in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patchDraft(patch: Partial<NewTicketDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function goToStep2(withServiceType?: NewTicketServiceType) {
    setDraft((current) => {
      const fallbackDepartmentId = initialDepartmentId ?? data.departments[0]?.id;
      const serviceType =
        withServiceType ??
        (current.serviceTypeId
          ? data.serviceTypes.find((st) => st.id === current.serviceTypeId)
          : data.serviceTypes.find((st) => st.departmentId === fallbackDepartmentId));
      const department = serviceType
        ? data.departments.find((d) => d.id === serviceType.departmentId)
        : undefined;

      return {
        ...current,
        serviceTypeId: serviceType?.id ?? current.serviceTypeId,
        priority: serviceType?.defaultPriority ?? current.priority,
        confidential: department?.confidentialByDefault ?? current.confidential,
        subject: current.subject || current.description.slice(0, 80),
        fields: withServiceType ? {} : current.fields,
      };
    });
    setStep('form');
  }

  function handleSubmitted() {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    setDraft(EMPTY_DRAFT);
    setStep('suggest');
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="mx-3 mt-3 mb-1 justify-start gap-2">
            <Plus size={18} />
            New ticket
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <DialogTitle className="text-subject font-semibold text-ink">New ticket</DialogTitle>
            <DialogDescription className="text-small text-muted">
              Step {step === 'suggest' ? 1 : 2} of 2
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Close"
              className="rounded-control p-2 text-ink-2 hover:bg-hover"
            >
              <X size={18} />
            </button>
          </DialogClose>
        </div>

        <div className="h-1 w-full bg-line">
          <div
            className="h-full bg-teal-deep transition-[width] duration-300"
            style={{ width: step === 'suggest' ? '50%' : '100%' }}
          />
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {step === 'suggest' ? (
            <Step1Suggest
              data={data}
              description={draft.description}
              onChangeDescription={(description) => patchDraft({ description })}
              onSelectServiceType={(serviceType) => goToStep2(serviceType)}
              onContinue={() => goToStep2()}
            />
          ) : (
            <Step2Form
              data={data}
              draft={draft}
              onChange={patchDraft}
              onBack={() => setStep('suggest')}
              onSubmitted={handleSubmitted}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
