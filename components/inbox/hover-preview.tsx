'use client';

import { useRef, useState, type ReactNode } from 'react';
import { StatusBadge } from '@/components/ui/badge';
import { getTicketPreview, type TicketPreview } from './actions';
import type { TicketStatus } from '@/generated/prisma/client';

const HOVER_DELAY_MS = 450;

interface HoverPreviewProps {
  ticketNumber: number;
  status: TicketStatus;
  children: ReactNode;
}

export function HoverPreview({ ticketNumber, status, children }: HoverPreviewProps) {
  const [preview, setPreview] = useState<TicketPreview | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleEnter() {
    timerRef.current = setTimeout(() => {
      setVisible(true);
      if (!preview) {
        getTicketPreview(ticketNumber).then((result) => {
          if (result.ok) setPreview(result.data);
        });
      }
    }, HOVER_DELAY_MS);
  }

  function handleLeave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {visible && preview ? (
        <div className="absolute top-full left-0 z-20 mt-1 w-72 rounded-card border border-line bg-surface p-3 text-small shadow-modal">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-medium text-ink">{preview.departmentName}</span>
            <StatusBadge status={status} />
          </div>
          <p className="line-clamp-3 text-ink-2">{preview.lastMessage ?? 'No messages yet.'}</p>
          <p className="mt-1.5 font-mono text-label text-muted">{preview.deadlineLabel}</p>
        </div>
      ) : null}
    </div>
  );
}
