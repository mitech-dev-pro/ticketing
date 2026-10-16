'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/select';
import type { EscalationSettings, RuleSettings, SlaSettings } from '@/lib/settings';
import type { Priority } from '@/generated/prisma/client';
import { updateAdminSettings } from './actions';

const PRIORITIES: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

interface SettingsFormProps {
  slaSettings: SlaSettings;
  escalationSettings: EscalationSettings;
  ruleSettings: RuleSettings;
}

export function SettingsForm({ slaSettings, escalationSettings, ruleSettings }: SettingsFormProps) {
  const router = useRouter();
  const [targets, setTargets] = useState(slaSettings.targets);
  const [calendarByPriority, setCalendarByPriority] = useState(slaSettings.calendarByPriority);
  const [businessHours, setBusinessHours] = useState(slaSettings.businessHours);
  const [warningPercent, setWarningPercent] = useState(slaSettings.warningPercent);
  const [pauseWhileAwaitingRequester, setPauseWhileAwaitingRequester] = useState(
    slaSettings.pauseWhileAwaitingRequester,
  );
  const [level2Mode, setLevel2Mode] = useState<'RESOLVE_TARGET' | 'CUSTOM'>(
    escalationSettings.level2AfterMinutes === 'RESOLVE_TARGET' ? 'RESOLVE_TARGET' : 'CUSTOM',
  );
  const [level2Custom, setLevel2Custom] = useState(
    escalationSettings.level2AfterMinutes === 'RESOLVE_TARGET'
      ? 240
      : escalationSettings.level2AfterMinutes,
  );
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(ruleSettings.autoCloseEnabled);
  const [autoCloseResolvedAfterDays, setAutoCloseResolvedAfterDays] = useState(
    ruleSettings.autoCloseResolvedAfterDays,
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function toggleDay(day: number) {
    setBusinessHours((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((d) => d !== day)
        : [...current.days, day].sort(),
    }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setSaved(false);

    const result = await updateAdminSettings({
      targets,
      calendarByPriority,
      businessHours,
      warningPercent,
      pauseWhileAwaitingRequester,
      level2AfterMinutesMode: level2Mode,
      level2AfterMinutesCustom: level2Custom,
      autoCloseEnabled,
      autoCloseResolvedAfterDays,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(Object.values(result.fieldErrors)[0]?.[0] ?? 'Could not save settings.');
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="mb-3 text-label font-mono uppercase tracking-wide text-faint">
          SLA targets
        </h2>
        <div className="flex flex-col gap-3">
          {PRIORITIES.map((priority) => (
            <div key={priority} className="grid grid-cols-[80px_1fr_1fr_1fr] items-center gap-2">
              <span className="text-small font-medium text-ink">{priority}</span>
              <label className="flex flex-col gap-1">
                <span className="text-label text-faint">First response (min)</span>
                <input
                  type="number"
                  min={1}
                  value={targets[priority].firstResponseMinutes}
                  onChange={(e) =>
                    setTargets((t) => ({
                      ...t,
                      [priority]: { ...t[priority], firstResponseMinutes: Number(e.target.value) },
                    }))
                  }
                  className="h-9 rounded-control border border-control bg-surface px-2 text-small text-ink"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-label text-faint">Resolve (min)</span>
                <input
                  type="number"
                  min={1}
                  value={targets[priority].resolveMinutes}
                  onChange={(e) =>
                    setTargets((t) => ({
                      ...t,
                      [priority]: { ...t[priority], resolveMinutes: Number(e.target.value) },
                    }))
                  }
                  className="h-9 rounded-control border border-control bg-surface px-2 text-small text-ink"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-label text-faint">Calendar</span>
                <Select
                  className="h-9"
                  value={calendarByPriority[priority]}
                  onChange={(e) =>
                    setCalendarByPriority((c) => ({
                      ...c,
                      [priority]: e.target.value as 'business' | '24x7',
                    }))
                  }
                >
                  <option value="24x7">24/7</option>
                  <option value="business">Business hours</option>
                </Select>
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="mb-3 text-label font-mono uppercase tracking-wide text-faint">
          Business hours calendar
        </h2>
        <p className="mb-2 text-small text-muted">{businessHours.timezone}</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {WEEKDAYS.map((day) => (
            <button
              key={day.value}
              type="button"
              onClick={() => toggleDay(day.value)}
              className={`rounded-chip border px-2.5 py-1 text-small ${
                businessHours.days.includes(day.value)
                  ? 'border-teal-deep bg-teal-deep/10 text-teal-deep'
                  : 'border-line text-muted hover:text-ink'
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-label text-faint">Start</span>
            <input
              type="time"
              value={businessHours.start}
              onChange={(e) => setBusinessHours((c) => ({ ...c, start: e.target.value }))}
              className="h-9 rounded-control border border-control bg-surface px-2 text-small text-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label text-faint">End</span>
            <input
              type="time"
              value={businessHours.end}
              onChange={(e) => setBusinessHours((c) => ({ ...c, end: e.target.value }))}
              className="h-9 rounded-control border border-control bg-surface px-2 text-small text-ink"
            />
          </label>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="mb-3 text-label font-mono uppercase tracking-wide text-faint">Rules</h2>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-small font-medium text-ink">Warning threshold (%)</span>
            <input
              type="number"
              min={1}
              max={100}
              value={warningPercent}
              onChange={(e) => setWarningPercent(Number(e.target.value))}
              className="h-9 w-24 rounded-control border border-control bg-surface px-2 text-small text-ink"
            />
          </label>

          <label className="flex items-center gap-2 text-small text-ink-2">
            <Checkbox
              checked={pauseWhileAwaitingRequester}
              onChange={(e) => setPauseWhileAwaitingRequester(e.target.checked)}
            />
            Pause the deadline while Awaiting requester (D-03)
          </label>

          <div>
            <span className="text-small font-medium text-ink">Level-2 escalation window</span>
            <div className="mt-1 flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-small text-ink-2">
                <input
                  type="radio"
                  checked={level2Mode === 'RESOLVE_TARGET'}
                  onChange={() => setLevel2Mode('RESOLVE_TARGET')}
                />
                Another full resolution target after breach
              </label>
              <label className="flex items-center gap-1.5 text-small text-ink-2">
                <input
                  type="radio"
                  checked={level2Mode === 'CUSTOM'}
                  onChange={() => setLevel2Mode('CUSTOM')}
                />
                Custom
                <input
                  type="number"
                  min={1}
                  disabled={level2Mode !== 'CUSTOM'}
                  value={level2Custom}
                  onChange={(e) => setLevel2Custom(Number(e.target.value))}
                  className="h-8 w-20 rounded-control border border-control bg-surface px-2 text-small text-ink disabled:opacity-50"
                />
                min
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 text-small text-ink-2">
            <Checkbox
              checked={autoCloseEnabled}
              onChange={(e) => setAutoCloseEnabled(e.target.checked)}
            />
            Auto-close resolved tickets after
            <input
              type="number"
              min={1}
              disabled={!autoCloseEnabled}
              value={autoCloseResolvedAfterDays}
              onChange={(e) => setAutoCloseResolvedAfterDays(Number(e.target.value))}
              className="h-8 w-16 rounded-control border border-control bg-surface px-2 text-small text-ink disabled:opacity-50"
            />
            days (skipped if rated or reopened)
          </label>
        </div>
      </section>

      {error ? <p className="text-small text-danger-fg">{error}</p> : null}
      {saved ? <p className="text-small text-teal-deep">Saved.</p> : null}

      <Button type="button" disabled={submitting} onClick={handleSubmit} className="w-fit">
        Save settings
      </Button>
    </div>
  );
}
