'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createTicket } from './actions';
import type { NewTicketData, NewTicketDraft, NewTicketField, Priority } from './types';

interface Step2FormProps {
  data: NewTicketData;
  draft: NewTicketDraft;
  onChange: (patch: Partial<NewTicketDraft>) => void;
  onBack: () => void;
  onSubmitted: () => void;
}

const PRIORITY_OPTIONS: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

function fieldValueAsString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function Step2Form({ data, draft, onChange, onBack, onSubmitted }: Step2FormProps) {
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const selectedServiceType = data.serviceTypes.find((st) => st.id === draft.serviceTypeId);
  const selectedDepartmentId = selectedServiceType?.departmentId ?? data.departments[0]?.id ?? '';
  const serviceTypesInDepartment = data.serviceTypes.filter(
    (st) => st.departmentId === selectedDepartmentId,
  );

  function handleDepartmentChange(departmentId: string) {
    const department = data.departments.find((d) => d.id === departmentId);
    const firstServiceType = data.serviceTypes.find((st) => st.departmentId === departmentId);
    onChange({
      serviceTypeId: firstServiceType?.id ?? '',
      priority: firstServiceType?.defaultPriority ?? draft.priority,
      confidential: department?.confidentialByDefault ?? draft.confidential,
      fields: {},
    });
  }

  function handleServiceTypeChange(serviceTypeId: string) {
    const serviceType = data.serviceTypes.find((st) => st.id === serviceTypeId);
    onChange({
      serviceTypeId,
      priority: serviceType?.defaultPriority ?? draft.priority,
      fields: {},
    });
  }

  function setFieldValue(label: string, value: unknown) {
    onChange({ fields: { ...draft.fields, [label]: value } });
  }

  function renderField(field: NewTicketField) {
    const error = fieldErrors[`fields.${field.label}`]?.[0];

    if (field.type === 'checkbox') {
      return (
        <div key={field.label} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`field-${field.label}`}
              checked={Boolean(draft.fields[field.label])}
              onChange={(event) => setFieldValue(field.label, event.target.checked)}
            />
            <Label htmlFor={`field-${field.label}`}>
              {field.label}
              {field.required ? ' *' : ''}
            </Label>
          </div>
          {error ? <p className="text-small text-danger-fg">{error}</p> : null}
        </div>
      );
    }

    return (
      <div key={field.label} className="flex flex-col gap-1.5">
        <Label htmlFor={`field-${field.label}`}>
          {field.label}
          {field.required ? ' *' : ''}
        </Label>
        {field.type === 'select' ? (
          <Select
            id={`field-${field.label}`}
            aria-invalid={error ? true : undefined}
            value={fieldValueAsString(draft.fields[field.label])}
            onChange={(event) => setFieldValue(field.label, event.target.value)}
          >
            <option value="">Select…</option>
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        ) : field.type === 'textarea' ? (
          <Textarea
            id={`field-${field.label}`}
            aria-invalid={error ? true : undefined}
            value={fieldValueAsString(draft.fields[field.label])}
            onChange={(event) => setFieldValue(field.label, event.target.value)}
          />
        ) : (
          <Input
            id={`field-${field.label}`}
            aria-invalid={error ? true : undefined}
            value={fieldValueAsString(draft.fields[field.label])}
            onChange={(event) => setFieldValue(field.label, event.target.value)}
          />
        )}
        {error ? <p className="text-small text-danger-fg">{error}</p> : null}
      </div>
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createTicket({
        serviceTypeId: draft.serviceTypeId,
        subject: draft.subject,
        description: draft.description,
        priority: draft.priority,
        confidential: draft.confidential,
        fields: draft.fields,
      });
      if (result.ok) {
        onSubmitted();
        return;
      }
      setFieldErrors(result.fieldErrors);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {fieldErrors._form ? (
        <p className="rounded-control bg-danger px-3 py-2 text-small text-danger-fg">
          {fieldErrors._form[0]}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="department">Department</Label>
          <Select
            id="department"
            value={selectedDepartmentId}
            onChange={(event) => handleDepartmentChange(event.target.value)}
          >
            {data.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="serviceTypeId">Category</Label>
          <Select
            id="serviceTypeId"
            aria-invalid={fieldErrors.serviceTypeId ? true : undefined}
            value={draft.serviceTypeId}
            onChange={(event) => handleServiceTypeChange(event.target.value)}
          >
            {serviceTypesInDepartment.map((serviceType) => (
              <option key={serviceType.id} value={serviceType.id}>
                {serviceType.name}
              </option>
            ))}
          </Select>
          {fieldErrors.serviceTypeId ? (
            <p className="text-small text-danger-fg">{fieldErrors.serviceTypeId[0]}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          aria-invalid={fieldErrors.subject ? true : undefined}
          value={draft.subject}
          onChange={(event) => onChange({ subject: event.target.value })}
        />
        {fieldErrors.subject ? (
          <p className="text-small text-danger-fg">{fieldErrors.subject[0]}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          rows={4}
          aria-invalid={fieldErrors.description ? true : undefined}
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
        {fieldErrors.description ? (
          <p className="text-small text-danger-fg">{fieldErrors.description[0]}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="priority">Priority</Label>
        <Select
          id="priority"
          value={draft.priority}
          onChange={(event) => onChange({ priority: event.target.value as Priority })}
        >
          {PRIORITY_OPTIONS.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </Select>
      </div>

      {selectedServiceType?.fields.map(renderField)}

      <div className="flex items-center gap-2">
        <Checkbox
          id="confidential"
          checked={draft.confidential}
          onChange={(event) => onChange({ confidential: event.target.checked })}
        />
        <Label htmlFor="confidential">Confidential</Label>
      </div>

      <div className="mt-2 flex justify-between gap-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Submitting…' : 'Submit ticket'}
        </Button>
      </div>
    </form>
  );
}
