import { cn } from '@/lib/utils';

// README: "load bar (5-ticket guide; amber >=3, red >=5)".
const GUIDE = 5;

export function LoadBar({ count }: { count: number }) {
  const percent = Math.min(100, (count / GUIDE) * 100);
  const tone = count >= 5 ? 'bg-urgent' : count >= 3 ? 'bg-high' : 'bg-teal-deep';

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
      <div className={cn('h-full rounded-full', tone)} style={{ width: `${percent}%` }} />
    </div>
  );
}
