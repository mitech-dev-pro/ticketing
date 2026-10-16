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
  // Base URL used to build absolute links in emails (invite, password reset).
  APP_URL: z.string().min(1, 'APP_URL is required').url('APP_URL must be a full URL'),
  // Unset in development: lib/email.ts logs to the console instead of calling Resend.
  RESEND_API_KEY: z.string().optional(),
  // Unset in development: lib/storage.ts writes to .uploads/ on disk instead of Blob.
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  // Required: app/api/cron/* routes reject any request whose Authorization header
  // doesn't match this. Vercel Cron sends it automatically once set in the project;
  // locally, curl the route with `Authorization: Bearer <CRON_SECRET>`.
  CRON_SECRET: z.string().min(1, 'CRON_SECRET is required'),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  APP_URL: process.env.APP_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  CRON_SECRET: process.env.CRON_SECRET,
});
