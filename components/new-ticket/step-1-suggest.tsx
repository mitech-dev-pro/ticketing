'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { DialogClose } from '@/components/ui/dialog';
import classifierData from '@/prisma/seed-data/classifier.json';
import { classify } from './classify';
import type { NewTicketData, NewTicketServiceType } from './types';

interface Step1SuggestProps {
  data: NewTicketData;
  description: string;
  onChangeDescription: (value: string) => void;
  onSelectServiceType: (serviceType: NewTicketServiceType) => void;
  onContinue: () => void;
}

export function Step1Suggest({
  data,
  description,
  onChangeDescription,
  onSelectServiceType,
  onContinue,
}: Step1SuggestProps) {
  const result = useMemo(() => classify(description, classifierData), [description]);

  const departmentsBySlug = useMemo(
    () => new Map(data.departments.map((department) => [department.slug, department])),
    [data.departments],
  );
  const suggestedDepartment = result.departmentSlugs[0]
    ? departmentsBySlug.get(result.departmentSlugs[0])
    : undefined;
  const alternativeDepartments = result.departmentSlugs
    .slice(1, 3)
    .map((slug) => departmentsBySlug.get(slug))
    .filter((department): department is NonNullable<typeof department> => Boolean(department));

  const matchingServiceTypes = useMemo(
    () => data.serviceTypes.filter((serviceType) => result.categories.includes(serviceType.name)),
    [data.serviceTypes, result.categories],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-ticket-description" className="text-small font-semibold text-ink-2">
          What do you need help with?
        </label>
        <Textarea
          id="new-ticket-description"
          rows={4}
          autoFocus
          placeholder="e.g. My laptop screen is flickering and I can't log in"
          value={description}
          onChange={(event) => onChangeDescription(event.target.value)}
        />
      </div>

      {suggestedDepartment ? (
        <div className="rounded-control bg-teal/10 px-3 py-2 text-small text-ink">
          Looks like <span className="font-semibold">{suggestedDepartment.name}</span>
          {alternativeDepartments.length > 0 ? (
            <>
              {' '}
              (or possibly {alternativeDepartments.map((department) => department.name).join(', ')})
            </>
          ) : null}
          .
        </div>
      ) : null}

      {matchingServiceTypes.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-label font-mono uppercase tracking-wide text-muted">Suggested</p>
          <div className="flex flex-wrap gap-2">
            {matchingServiceTypes.map((serviceType) => (
              <button
                key={serviceType.id}
                type="button"
                onClick={() => onSelectServiceType(serviceType)}
                className="rounded-chip border border-control bg-surface px-3 py-1.5 text-small text-ink transition-colors hover:border-teal hover:text-teal-deep"
              >
                {serviceType.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-2 flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </DialogClose>
        <Button type="button" disabled={description.trim().length === 0} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
