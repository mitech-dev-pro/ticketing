import Link from 'next/link';
import type { AssetSummary } from './types';

const STATUS_LABEL: Record<string, string> = {
  IN_USE: 'In use',
  FAULTY: 'Faulty',
  UNDER_REPAIR: 'Under repair',
  RETIRED: 'Retired',
};

export function AssetPanel({ asset }: { asset: AssetSummary }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <h2 className="mb-2 text-label font-mono uppercase tracking-wide text-faint">Asset</h2>
      <Link href="/assets" className="font-mono text-small text-teal-deep hover:underline">
        {asset.id}
      </Link>
      <p className="mt-1 text-small text-ink-2">
        {asset.type} · {asset.model}
      </p>
      <p className="text-small text-muted">{asset.location}</p>
      <p className="mt-1 text-small text-muted">{STATUS_LABEL[asset.status] ?? asset.status}</p>
    </div>
  );
}
