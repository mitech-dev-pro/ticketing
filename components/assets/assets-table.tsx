'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatTicketId } from '@/lib/ids';
import { NewTicketDialog } from '@/components/new-ticket/new-ticket-dialog';
import type { NewTicketData } from '@/components/new-ticket/types';
import type { AssetDetail } from '@/lib/services/assets';

const STATUS_LABEL: Record<string, string> = {
  IN_USE: 'In use',
  FAULTY: 'Faulty',
  UNDER_REPAIR: 'Under repair',
  RETIRED: 'Retired',
};

function matches(asset: AssetDetail, query: string): boolean {
  const haystack =
    `${asset.id} ${asset.type} ${asset.model} ${asset.holderName ?? ''} ${asset.location}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function AssetsTable({
  assets,
  newTicketData,
}: {
  assets: AssetDetail[];
  newTicketData: NewTicketData;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () => (query.trim() ? assets.filter((asset) => matches(asset, query)) : assets),
    [assets, query],
  );

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Search by asset tag, type, person or location"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-small">
          <thead>
            <tr className="border-b border-line text-label font-mono uppercase tracking-wide text-faint">
              <th className="w-8 px-3 py-2.5" />
              <th className="px-3 py-2.5 text-left">Asset</th>
              <th className="px-3 py-2.5 text-left">Holder / Location</th>
              <th className="px-3 py-2.5 text-left">Managed by</th>
              <th className="px-3 py-2.5 text-left">Status</th>
              <th className="px-3 py-2.5 text-left">Open tickets</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((asset) => {
              const isOpen = expanded.has(asset.id);
              return (
                <Fragment key={asset.id}>
                  <tr
                    className="cursor-pointer border-b border-line-2 last:border-0 hover:bg-hover"
                    onClick={() => toggle(asset.id)}
                  >
                    <td className="px-3 py-2.5 align-top text-muted">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="font-mono text-label text-muted">{asset.id}</div>
                      <div className="font-medium text-ink">
                        {asset.type} · {asset.model}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-ink-2">
                      {asset.holderName ?? '—'} · {asset.location}
                    </td>
                    <td className="px-3 py-2.5 align-top text-ink-2">
                      {asset.ownerDepartmentName}
                    </td>
                    <td className="px-3 py-2.5 align-top text-ink-2">
                      {STATUS_LABEL[asset.status] ?? asset.status}
                    </td>
                    <td className="px-3 py-2.5 align-top font-mono text-ink-2">
                      {asset.openTicketCount}
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="border-b border-line-2 last:border-0">
                      <td />
                      <td colSpan={5} className="px-3 py-3">
                        <div className="flex flex-col gap-3">
                          {asset.tickets.length > 0 ? (
                            <ul className="flex flex-col gap-1.5">
                              {asset.tickets.map((ticket) => (
                                <li key={ticket.number} className="flex items-center gap-2">
                                  <Link
                                    href={`/tickets/${ticket.number}`}
                                    className="min-w-0 flex-1 truncate text-ink-2 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {formatTicketId(ticket.number)} · {ticket.subject}
                                  </Link>
                                  <StatusBadge status={ticket.status} />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-small text-muted">
                              No tickets raised against this asset yet.
                            </p>
                          )}
                          <div onClick={(e) => e.stopPropagation()} className="w-fit">
                            <NewTicketDialog
                              data={newTicketData}
                              initialDepartmentId={asset.ownerDepartmentId}
                              trigger={
                                <Button type="button" variant="secondary" size="sm">
                                  Report a fault
                                </Button>
                              }
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-small text-muted">
            No assets match that search.
          </p>
        ) : null}
      </div>
    </div>
  );
}
