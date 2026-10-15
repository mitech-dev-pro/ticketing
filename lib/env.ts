import { z } from 'zod';

/**
 * Every environment variable the app reads, validated once at startup.
 * Add a field here the same change you add the `process.env` read it backs.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .regex(/^mysql:\/\//, 'DATABASE_URL must be a mysql:// connection string'),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
});
