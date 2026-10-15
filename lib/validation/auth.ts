import { z } from 'zod';
import type { AuthTokenType } from '@/generated/prisma/client';

export const signInSchema = z.object({
  email: z.string().trim().min(1, 'Enter your work email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const requestPasswordResetSchema = z.object({
  email: z.string().trim().min(1, 'Enter your work email').email('Enter a valid email address'),
});

export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

const MIN_PASSWORD_LENGTH = 10;

export const setPasswordSchema = z
  .object({
    token: z.string().min(1),
    type: z.enum(['RESET', 'INVITE'] as [AuthTokenType, AuthTokenType]),
    password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`),
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
