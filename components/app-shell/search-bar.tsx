'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { formatTicketId } from '@/lib/ids';
import { Badge, PriorityBadge, StatusBadge } from '@/components/ui/badge';
import { searchTicketsAction } from './search-actions';
import type { TicketSearchResult } from '@/lib/services/search';

const DEBOUNCE_MS = 250;

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TicketSearchResult[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function handleChange(value: string) {
    setQuery(value);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (!trimmed) {
      setResults(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      searchTicketsAction({ query: trimmed }).then((result) => {
        setLoading(false);
        setResults(result.ok ? result.data : []);
      });
    }, DEBOUNCE_MS);
  }

  return (
    <div className="relative flex-1" ref={containerRef}>
      <div className="flex flex-1 items-center gap-2 rounded-control bg-subtle px-3 text-ink-2">
        <Search size={16} />
        <input
          type="search"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search by ticket number, subject…"
          className="h-9 w-full bg-transparent text-small text-ink placeholder:text-faint outline-none"
        />
      </div>

      {open && query.trim() ? (
        <div className="absolute top-full left-0 z-20 mt-2 max-h-96 w-full min-w-[320px] overflow-y-auto rounded-card border border-line bg-surface shadow-modal">
          {loading ? (
            <p className="px-3 py-4 text-small text-muted">Searching…</p>
          ) : !results || results.length === 0 ? (
            <p className="px-3 py-4 text-small text-muted">
              No tickets match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            results.map((result) => (
              <Link
                key={result.number}
                href={`/tickets/${result.number}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 border-b border-line-2 px-3 py-2.5 text-small last:border-0 hover:bg-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-label text-muted">
                    {formatTicketId(result.number)}
                  </span>{' '}
                  <span className="text-ink-2">{result.subject}</span>
                  <span className="block text-label text-faint">{result.requesterName}</span>
                </span>
                {result.confidential ? (
                  <Badge className="bg-danger-fg/15 text-danger-fg">Confidential</Badge>
                ) : null}
                <PriorityBadge priority={result.priority} />
                <StatusBadge status={result.status} />
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
