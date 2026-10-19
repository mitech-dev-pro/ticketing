'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { removeSavedView, saveCurrentView } from './actions';
import type { InboxTab } from './types';

export interface SavedViewItem {
  id: string;
  name: string;
  filters: { tab: InboxTab; priority?: string; due4h: boolean };
}

interface SavedViewsProps {
  views: SavedViewItem[];
  currentTab: InboxTab;
  currentPriority?: string;
  currentDueHours: number | null;
}

export function SavedViews({
  views,
  currentTab,
  currentPriority,
  currentDueHours,
}: SavedViewsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  function applyView(view: SavedViewItem) {
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', view.filters.tab);
    if (view.filters.priority) next.set('priority', view.filters.priority);
    else next.delete('priority');
    if (view.filters.due4h) next.set('due', '4h');
    else next.delete('due');
    router.push(`/inbox?${next.toString()}`);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    await saveCurrentView({
      name: name.trim(),
      filters: {
        tab: currentTab,
        priority: currentPriority,
        due4h: currentDueHours !== null,
      },
    });
    setSaving(false);
    setNaming(false);
    setName('');
    router.refresh();
  }

  async function handleDelete(id: string) {
    await removeSavedView({ id });
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((view) => {
        const isActive =
          view.filters.tab === currentTab &&
          (view.filters.priority ?? '') === (currentPriority ?? '') &&
          view.filters.due4h === (currentDueHours !== null);
        return (
          <span
            key={view.id}
            className={cn(
              'flex items-center gap-1 rounded-chip border px-2.5 py-1 text-small',
              isActive
                ? 'border-teal-deep bg-teal-deep/10 text-teal-deep'
                : 'border-line text-muted',
            )}
          >
            <button type="button" onClick={() => applyView(view)} className="hover:text-ink">
              {view.name}
            </button>
            <button
              type="button"
              onClick={() => handleDelete(view.id)}
              aria-label={`Delete view ${view.name}`}
              className="text-faint hover:text-danger-fg"
            >
              <X size={12} />
            </button>
          </span>
        );
      })}

      {naming ? (
        <span className="flex items-center gap-1 rounded-chip border border-line px-2 py-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSave();
              if (e.key === 'Escape') setNaming(false);
            }}
            placeholder="View name"
            className="h-6 w-28 bg-transparent text-small text-ink outline-none"
          />
          <button
            type="button"
            disabled={saving || !name.trim()}
            onClick={handleSave}
            className="text-label font-medium text-teal-deep disabled:opacity-50"
          >
            Save
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="flex items-center gap-1 rounded-chip border border-line px-2.5 py-1 text-small text-muted hover:text-ink"
        >
          <Plus size={12} />
          Save current view
        </button>
      )}
    </div>
  );
}
