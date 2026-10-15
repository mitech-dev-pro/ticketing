import * as React from 'react';
import { cn } from '@/lib/utils';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-control border border-control bg-surface px-3 py-2.5 text-base text-ink placeholder:text-faint',
        'focus-visible:outline-2 focus-visible:outline-teal focus-visible:outline-offset-0 focus-visible:border-teal',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-danger-fg',
        className,
      )}
      {...props}
    />
  );
});
