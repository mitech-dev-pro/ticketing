'use client';

// D-09: "Send, resolve and forward wait 6 seconds in the browser before calling the
// server, while the toast shows Undo. Undo simply cancels, so nothing is written and
// the append-only log stays clean. If the page is closed or navigated away during the
// window, the pending action is sent at once with fetch(..., { keepalive: true }) to
// POST /api/actions/commit, which calls the same service function as the Server Action."

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

const UNDO_WINDOW_MS = 6_000;

interface PendingAction {
  id: string;
  label: string;
  remainingMs: number;
  kind: string;
  payload: unknown;
  commit: () => Promise<unknown>;
  onSettled?: (result: unknown) => void;
}

interface RunWithUndoInput {
  label: string;
  /** Matches a key in app/api/actions/commit/route.ts's HANDLERS map. */
  kind: string;
  payload: unknown;
  commit: () => Promise<unknown>;
  onSettled?: (result: unknown) => void;
}

interface UndoToastContextValue {
  runWithUndo: (input: RunWithUndoInput) => void;
}

const UndoToastContext = createContext<UndoToastContextValue | null>(null);

function commitViaKeepalive(kind: string, payload: unknown): void {
  try {
    fetch('/api/actions/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, payload }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Best-effort: the browser may already be tearing the page down.
  }
}

export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingAction[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const settledRef = useRef<Set<string>>(new Set());

  const settle = useCallback((action: PendingAction, viaKeepalive: boolean) => {
    if (settledRef.current.has(action.id)) return;
    settledRef.current.add(action.id);
    const timer = timersRef.current.get(action.id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(action.id);
    setPending((current) => current.filter((item) => item.id !== action.id));

    if (viaKeepalive) {
      commitViaKeepalive(action.kind, action.payload);
    } else {
      action
        .commit()
        .then((result) => action.onSettled?.(result))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    function handleVisibilityOrUnload() {
      if (document.visibilityState !== 'hidden') return;
      for (const action of pending) {
        settle(action, true);
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityOrUnload);
    window.addEventListener('pagehide', handleVisibilityOrUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrUnload);
      window.removeEventListener('pagehide', handleVisibilityOrUnload);
    };
  }, [pending, settle]);

  const runWithUndo = useCallback(
    ({ label, kind, payload, commit, onSettled }: RunWithUndoInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const action: PendingAction = {
        id,
        label,
        remainingMs: UNDO_WINDOW_MS,
        kind,
        payload,
        commit,
        onSettled,
      };
      setPending((current) => [...current, action]);
      const timer = setTimeout(() => settle(action, false), UNDO_WINDOW_MS);
      timersRef.current.set(id, timer);
    },
    [settle],
  );

  function cancel(action: PendingAction) {
    if (settledRef.current.has(action.id)) return;
    settledRef.current.add(action.id);
    const timer = timersRef.current.get(action.id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(action.id);
    setPending((current) => current.filter((item) => item.id !== action.id));
  }

  return (
    <UndoToastContext.Provider value={{ runWithUndo }}>
      {children}
      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2',
        )}
      >
        {pending.map((action) => (
          <div
            key={action.id}
            className="pointer-events-auto flex items-center gap-4 rounded-control bg-navy px-4 py-2.5 text-small text-white shadow-modal"
          >
            <span>{action.label}</span>
            <button
              type="button"
              className="font-semibold text-teal underline-offset-2 hover:underline"
              onClick={() => cancel(action)}
            >
              Undo
            </button>
          </div>
        ))}
      </div>
    </UndoToastContext.Provider>
  );
}

export function useUndoToast(): UndoToastContextValue {
  const context = useContext(UndoToastContext);
  if (!context) {
    throw new Error('useUndoToast must be used within an UndoToastProvider');
  }
  return context;
}
