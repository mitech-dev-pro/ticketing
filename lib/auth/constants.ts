// Split out so proxy.ts (optimistic cookie-presence check only) can import the cookie
// name without pulling in session.ts's Prisma/next-headers dependencies.

export const SESSION_COOKIE_NAME = 'milife_session';
