import { z } from 'zod';

export const addPersonSchema = z.object({
  name: z.string().trim().min(1, "Enter the person's name"),
  email: z.string().trim().min(1, 'Enter a work email').email('Enter a valid email address'),
  role: z.enum(['MEMBER', 'HEAD', 'ADMIN']),
  departmentId: z.string().min(1, 'Select a department'),
  branch: z.enum(['ACHIMOTA_HQ', 'KUMASI', 'TAKORADI']),
  phone: z.string().trim().optional(),
  ext: z.string().trim().optional(),
});

export type AddPersonInput = z.infer<typeof addPersonSchema>;
