import Link from 'next/link';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number;
  href: string;
  danger?: boolean;
}

export function StatCard({ label, value, href, danger }: StatCardProps) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4 transition-colors hover:bg-hover"
    >
      <span className={cn('text-title font-bold', danger ? 'text-urgent' : 'text-ink')}>
        {value}
      </span>
      <span className="text-small text-muted">{label}</span>
    </Link>
  );
}
