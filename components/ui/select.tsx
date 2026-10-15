import * as React from 'react';
import { cn } from '@/lib/utils';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'h-11 w-full rounded-control border border-control bg-surface px-3 text-base text-ink',
        'focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-0 focus-visible:border-teal',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-danger-fg',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
