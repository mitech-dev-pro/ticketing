import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@/generated/prisma/client';
import { env } from '@/lib/env';

/**
 * Prisma 7's connectionLimit is read from the adapter config, not from the
 * DATABASE_URL query string (the old `connection_limit` param is ignored).
 * We still keep a single DATABASE_URL as the source of truth and parse it here.
 */
function parseDatabaseUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

function createPrismaClient() {
  const adapter = new PrismaMariaDb({
    ...parseDatabaseUrl(env.DATABASE_URL),
    connectionLimit: 5,
  });
  return new PrismaClient({ adapter });
}

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma = globalThis.prismaGlobal ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}
