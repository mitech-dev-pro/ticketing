// Optimistic check only: does the session cookie exist? No DB lookup here (D-/Next 16
// guidance — Proxy runs on every route, including prefetches, so it must stay cheap).
// Real validation (expiry, revocation, active user) happens in getSession()/
// touchSession(), called from layouts and Server Actions.
//
// Deliberately one-directional: we only redirect away when a cookie is absent, since
// that's the one case Proxy can decide correctly without a DB call. We never redirect
// an already-signed-in visitor away from a public route here — a present cookie can
// still belong to an expired/revoked session, and bouncing on cookie presence alone
// caused a redirect loop (stale cookie → bounced off /sign-in to '/', with nothing
// there to clear it). The public auth pages already do that "already signed in"
// bounce themselves with a real getSession() check (see app/(auth)/*/page.tsx).

import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';

const PUBLIC_ROUTES = ['/sign-in', '/forgot-password', '/set-password'];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);

  if (!hasSession && !isPublicRoute(pathname)) {
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
