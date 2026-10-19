'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { lookupPolicyForTicket } from './actions';
import type { PolicyLookupResult } from '@/lib/services/policy';

interface PolicyLookupPanelProps {
  initialResult: PolicyLookupResult | null;
}

export function PolicyLookupPanel({ initialResult }: PolicyLookupPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<PolicyLookupResult | null>(initialResult);
  const [searched, setSearched] = useState(initialResult !== null);
  const [error, setError] = useState<string | null>(null);

  function handleSearch() {
    if (!query.trim()) return;
    setError(null);
    startTransition(async () => {
      const response = await lookupPolicyForTicket({ query: query.trim() });
      if (!response.ok) {
        setError(response.fieldErrors._form?.[0] ?? 'Could not look that up.');
        return;
      }
      setResult(response.data);
      setSearched(true);
    });
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <h2 className="mb-2 text-label font-mono uppercase tracking-wide text-faint">
        Policy lookup
      </h2>

      <div className="flex gap-2">
        <Input
          className="h-9"
          placeholder="Policy or claim number"
          value={query}
          disabled={isPending}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSearch();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          disabled={isPending || !query.trim()}
          onClick={handleSearch}
        >
          Look up
        </Button>
      </div>

      {error ? <p className="mt-2 text-small text-danger-fg">{error}</p> : null}

      {result ? (
        <div className="mt-3 flex flex-col gap-0.5 text-small">
          <div className="font-mono text-ink">{result.number}</div>
          <div className="text-ink-2">{result.product}</div>
          <div className="text-muted">
            {result.holder} · {result.premium} · {result.payMethod}
          </div>
          <div className="text-muted">Since {result.since}</div>
          {result.claimNumber ? (
            <div className="mt-1 text-faint">Matched via claim {result.claimNumber}</div>
          ) : null}
        </div>
      ) : searched ? (
        <p className="mt-3 text-small text-muted">No policy or claim found for that number.</p>
      ) : null}
    </div>
  );
}
