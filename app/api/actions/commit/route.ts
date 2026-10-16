// D-09: when the undo window closes because the tab was closed or navigated away
// before the 6s delay elapsed, the client fires this with `fetch(..., { keepalive:
// true })` instead of waiting for the in-page timer. It calls the exact same Server
// Actions a normal Send/Resolve/Forward click would, so there is only one code path
// that ever writes these events.

import { NextResponse, type NextRequest } from 'next/server';
import {
  addNoteToTicket,
  forwardTicket,
  replyToTicket,
  resolveTicket,
} from '@/components/tickets/actions';
import type { ActionResult } from '@/lib/validation/action-result';

const HANDLERS: Record<string, (input: unknown) => Promise<ActionResult<unknown>>> = {
  reply: replyToTicket,
  note: addNoteToTicket,
  forward: forwardTicket,
  resolve: resolveTicket,
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  if (typeof body !== 'object' || body === null || !('kind' in body) || !('payload' in body)) {
    return new NextResponse('Expected { kind, payload }', { status: 400 });
  }

  const { kind, payload } = body as { kind: unknown; payload: unknown };
  if (typeof kind !== 'string' || !(kind in HANDLERS)) {
    return new NextResponse('Unknown action kind', { status: 400 });
  }

  const result = await HANDLERS[kind]!(payload);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
