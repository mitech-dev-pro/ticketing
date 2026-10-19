// Ticket detail aside "Tasks" checklist (BUILD_PLAN.md Phase 6). Every write here
// also writes a TASK TicketEvent in the same transaction (CLAUDE.md).

import { prisma } from '@/lib/db';

export async function listTasks(ticketNumber: number) {
  return prisma.task.findMany({
    where: { ticketId: ticketNumber },
    orderBy: { order: 'asc' },
  });
}

export async function addTask(params: {
  ticketNumber: number;
  text: string;
  byUserId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const last = await tx.task.findFirst({
      where: { ticketId: params.ticketNumber },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const task = await tx.task.create({
      data: {
        ticketId: params.ticketNumber,
        text: params.text,
        order: (last?.order ?? -1) + 1,
      },
    });
    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: 'TASK',
        byUserId: params.byUserId,
        meta: { action: 'added', text: task.text },
      },
    });
  });
}

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} does not exist on this ticket.`);
  }
}

export async function toggleTask(params: {
  ticketNumber: number;
  taskId: string;
  byUserId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id: params.taskId } });
    if (!task || task.ticketId !== params.ticketNumber) {
      throw new TaskNotFoundError(params.taskId);
    }

    const done = !task.done;
    await tx.task.update({ where: { id: task.id }, data: { done } });
    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: 'TASK',
        byUserId: params.byUserId,
        meta: { action: done ? 'completed' : 'reopened', text: task.text },
      },
    });
  });
}

export async function removeTask(params: {
  ticketNumber: number;
  taskId: string;
  byUserId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id: params.taskId } });
    if (!task || task.ticketId !== params.ticketNumber) {
      throw new TaskNotFoundError(params.taskId);
    }

    await tx.task.delete({ where: { id: task.id } });
    await tx.ticketEvent.create({
      data: {
        ticketId: params.ticketNumber,
        type: 'TASK',
        byUserId: params.byUserId,
        meta: { action: 'removed', text: task.text },
      },
    });
  });
}
