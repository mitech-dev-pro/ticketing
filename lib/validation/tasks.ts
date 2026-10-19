import { z } from 'zod';

const ticketNumber = z.number().int().positive();

export const addTaskSchema = z.object({
  ticketNumber,
  text: z.string().trim().min(1, 'Enter a task').max(300),
});
export type AddTaskInput = z.infer<typeof addTaskSchema>;

export const toggleTaskSchema = z.object({
  ticketNumber,
  taskId: z.string().min(1),
});
export type ToggleTaskInput = z.infer<typeof toggleTaskSchema>;

export const removeTaskSchema = z.object({
  ticketNumber,
  taskId: z.string().min(1),
});
export type RemoveTaskInput = z.infer<typeof removeTaskSchema>;
