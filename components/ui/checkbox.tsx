import * as React from 'react';
import { cn } from '@/lib/utils';

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'h-4 w-4 shrink-0 rounded-[4px] border border-control bg-surface accent-teal',
        'focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
