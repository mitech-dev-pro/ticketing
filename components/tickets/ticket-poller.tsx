'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const POLL_INTERVAL_MS = 20_000; // D-10: polling refresh, no websockets.

/** D-10: "The ticket page ... calls router.refresh() every 20 seconds while the tab
 * is visible, and immediately on focus." Renders nothing — just runs the effect. */
export function TicketPoller() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, POLL_INTERVAL_MS);

    function handleFocus() {
      router.refresh();
    }
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(id);
      window.removeEventListener('focus', handleFocus);
    };
  }, [router]);

  return null;
}
