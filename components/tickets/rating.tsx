'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { markTicketRatingFollowedUp, rateTicket, reopenTicket } from './actions';

const LOW_RATING_REASONS = [
  'Took too long',
  'Needed more follow-up',
  'Problem not fully solved',
  'Other',
];

function Stars({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(star)}
          className={cn('text-high', onChange && 'cursor-pointer')}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
        >
          <Star size={20} fill={star <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  );
}

export function RatingBanner({
  ticketNumber,
  csat,
  canRate,
  canReopen,
}: {
  ticketNumber: number;
  csat: number | null;
  canRate: boolean;
  canReopen: boolean;
}) {
  const router = useRouter();
  const [stars, setStars] = useState(0);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // canRate and canReopen are both requester-only (lib/permissions.ts), so this also
  // keeps "You rated this" from being shown to anyone but the requester themselves.
  if (!canRate && !canReopen) return null;

  if (csat !== null) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-4">
        <Stars value={csat} />
        <span className="text-small text-muted">You rated this {csat}/5</span>
        {canReopen ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => {
              void reopenTicket({ ticketNumber }).then(() => router.refresh());
            }}
          >
            Reopen
          </Button>
        ) : null}
      </div>
    );
  }

  if (!canRate) return null;

  async function submit(selectedStars: number) {
    setSubmitting(true);
    await rateTicket({ ticketNumber, stars: selectedStars, reasons, note: note.trim() || null });
    setSubmitting(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-teal-deep/30 bg-teal-deep/5 p-4">
      <div className="flex items-center gap-3">
        <span className="text-small font-medium text-ink">How did we do?</span>
        <Stars value={stars} onChange={setStars} />
      </div>

      {stars > 0 && stars <= 2 ? (
        <div className="flex flex-col gap-2">
          <p className="text-small text-ink-2">Sorry it wasn&apos;t better. What went wrong?</p>
          <div className="flex flex-wrap gap-1.5">
            {LOW_RATING_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() =>
                  setReasons((current) =>
                    current.includes(reason)
                      ? current.filter((r) => r !== reason)
                      : [...current, reason],
                  )
                }
                className={cn(
                  'rounded-chip border px-2.5 py-1 text-small',
                  reasons.includes(reason)
                    ? 'border-teal-deep bg-teal-deep/10 text-teal-deep'
                    : 'border-line text-muted hover:text-ink',
                )}
              >
                {reason}
              </button>
            ))}
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Anything else we should know? (optional)"
          />
        </div>
      ) : null}

      {stars > 0 ? (
        <Button
          type="button"
          size="sm"
          className="w-fit"
          disabled={submitting}
          onClick={() => submit(stars)}
        >
          Submit rating
        </Button>
      ) : null}
    </div>
  );
}

export function LowRatingFollowUpBanner({
  ticketNumber,
  csat,
  ratingFollowedUpAt,
  canMarkFollowedUp,
}: {
  ticketNumber: number;
  csat: number | null;
  ratingFollowedUpAt: string | null;
  canMarkFollowedUp: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  if (!canMarkFollowedUp || csat === null || csat > 2 || ratingFollowedUpAt) return null;

  return (
    <div className="flex items-center gap-3 rounded-card border border-urgent/30 bg-urgent/5 p-4">
      <Stars value={csat} />
      <span className="text-small text-ink-2">Low rating from the requester.</span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="ml-auto"
        disabled={submitting}
        onClick={async () => {
          setSubmitting(true);
          await markTicketRatingFollowedUp({ ticketNumber });
          setSubmitting(false);
          router.refresh();
        }}
      >
        Mark followed up
      </Button>
    </div>
  );
}
