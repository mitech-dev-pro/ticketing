'use client';

import { useEffect, useRef, useState } from 'react';
import { AtSign, Building2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mentionCandidatesForTicket, type MentionCandidate } from './actions';

export interface Mention {
  type: 'person' | 'department';
  id: string;
  label: string;
}

interface MentionPickerProps {
  ticketNumber: number;
  selected: Mention[];
  onChange: (mentions: Mention[]) => void;
}

export function MentionPicker({ ticketNumber, selected, onChange }: MentionPickerProps) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<MentionCandidate | null>(null);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || candidates) return;
    mentionCandidatesForTicket(ticketNumber).then((result) => {
      if (result.ok) setCandidates(result.data);
    });
  }, [open, candidates, ticketNumber]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function toggle(mention: Mention) {
    const exists = selected.some((m) => m.type === mention.type && m.id === mention.id);
    onChange(
      exists
        ? selected.filter((m) => !(m.type === mention.type && m.id === mention.id))
        : [...selected, mention],
    );
  }

  const lowerQuery = query.trim().toLowerCase();
  const people = (candidates?.people ?? []).filter((p) =>
    p.name.toLowerCase().includes(lowerQuery),
  );
  const departments = (candidates?.departments ?? []).filter((d) =>
    d.name.toLowerCase().includes(lowerQuery),
  );

  return (
    <div className="relative" ref={containerRef}>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        <AtSign size={14} />
        Mention
      </Button>

      {open ? (
        <div className="absolute bottom-full left-0 z-10 mb-2 w-64 rounded-card border border-line bg-surface p-2 shadow-modal">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people or departments…"
            className="mb-2 h-9 w-full rounded-control border border-control bg-surface px-2 text-small text-ink"
          />
          <div className="max-h-56 overflow-y-auto">
            {!candidates ? <p className="px-2 py-1.5 text-small text-muted">Loading…</p> : null}
            {candidates && people.length === 0 && departments.length === 0 ? (
              <p className="px-2 py-1.5 text-small text-muted">No matches.</p>
            ) : null}
            {people.map((person) => {
              const isSelected = selected.some((m) => m.type === 'person' && m.id === person.id);
              return (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => toggle({ type: 'person', id: person.id, label: person.name })}
                  className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-small hover:bg-hover"
                >
                  <User size={14} className="text-muted" />
                  <span className="flex-1 text-ink-2">{person.name}</span>
                  {isSelected ? <span className="text-teal-deep">✓</span> : null}
                </button>
              );
            })}
            {departments.map((department) => {
              const isSelected = selected.some(
                (m) => m.type === 'department' && m.id === department.id,
              );
              return (
                <button
                  key={department.id}
                  type="button"
                  onClick={() =>
                    toggle({ type: 'department', id: department.id, label: department.name })
                  }
                  className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-small hover:bg-hover"
                >
                  <Building2 size={14} className="text-muted" />
                  <span className="flex-1 text-ink-2">{department.name}</span>
                  {isSelected ? <span className="text-teal-deep">✓</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
