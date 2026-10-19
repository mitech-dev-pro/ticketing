'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ListPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { addTicketSubTicket } from './actions';

export interface SubTicketServiceTypeOption {
  id: string;
  name: string;
  defaultPriority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
}

const PRIORITY_OPTIONS = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const;

export function SubTicketDialog({
  parentTicketNumber,
  serviceTypes,
}: {
  parentTicketNumber: number;
  serviceTypes: SubTicketServiceTypeOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serviceTypeId, setServiceTypeId] = useState(serviceTypes[0]?.id ?? '');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITY_OPTIONS)[number]>(
    serviceTypes[0]?.defaultPriority ?? 'MEDIUM',
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, setPending] = useState(false);

  function handleServiceTypeChange(id: string) {
    setServiceTypeId(id);
    const serviceType = serviceTypes.find((st) => st.id === id);
    if (serviceType) setPriority(serviceType.defaultPriority);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    void (async () => {
      const result = await addTicketSubTicket({
        parentTicketNumber,
        serviceTypeId,
        subject,
        description,
        priority,
        fields: {},
      });
      setPending(false);
      if (!result.ok) {
        setFieldErrors(result.fieldErrors);
        return;
      }
      setOpen(false);
      setSubject('');
      setDescription('');
      router.push(`/tickets/${result.data.number}`);
    })();
  }

  if (serviceTypes.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" className="w-full justify-start">
          <ListPlus size={16} />
          Add sub-ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[480px] p-5">
        <DialogTitle className="text-subject font-semibold text-ink">Add sub-ticket</DialogTitle>
        <DialogDescription className="mt-1 text-small text-muted">
          Creates a new ticket in the same department, linked as a part of this one.
        </DialogDescription>

        <form onSubmit={handleSubmit} noValidate className="mt-4 flex flex-col gap-3">
          {fieldErrors._form ? (
            <p className="rounded-control bg-danger px-3 py-2 text-small text-danger-fg">
              {fieldErrors._form[0]}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sub-ticket-service-type">Category</Label>
            <Select
              id="sub-ticket-service-type"
              value={serviceTypeId}
              onChange={(e) => handleServiceTypeChange(e.target.value)}
            >
              {serviceTypes.map((serviceType) => (
                <option key={serviceType.id} value={serviceType.id}>
                  {serviceType.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sub-ticket-subject">Subject</Label>
            <Input
              id="sub-ticket-subject"
              aria-invalid={fieldErrors.subject ? true : undefined}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            {fieldErrors.subject ? (
              <p className="text-small text-danger-fg">{fieldErrors.subject[0]}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sub-ticket-description">Description</Label>
            <Textarea
              id="sub-ticket-description"
              rows={3}
              aria-invalid={fieldErrors.description ? true : undefined}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {fieldErrors.description ? (
              <p className="text-small text-danger-fg">{fieldErrors.description[0]}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sub-ticket-priority">Priority</Label>
            <Select
              id="sub-ticket-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as (typeof PRIORITY_OPTIONS)[number])}
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Creating…' : 'Create sub-ticket'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
