// Feeds the header dropdown and the 07:30 digest (BUILD_PLAN.md Phase 4). The
// Notification.(userId, ticketId, kind) unique constraint makes notify() naturally
// idempotent: a cron route can call it every minute for as long as a condition holds
// (e.g. still past 75%) and only the first call ever creates a row.

import { prisma } from '@/lib/db';
import { Prisma, type NotificationKind } from '@/generated/prisma/client';

/** Returns true the first time this (userId, ticketId, kind) is notified, false on
 * every repeat — callers use that to send the matching email exactly once, not on
 * every cron tick the underlying condition keeps holding. */
export async function notify(params: {
  userId: string;
  ticketId: number;
  kind: NotificationKind;
}): Promise<boolean> {
  try {
    await prisma.notification.create({
      data: { userId: params.userId, ticketId: params.ticketId, kind: params.kind },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return false; // already notified — idempotent, not an error
    }
    throw error;
  }
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markNotificationRead(params: {
  notificationId: string;
  userId: string;
}): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: params.notificationId, userId: params.userId, readAt: null },
    data: { readAt: new Date() },
  });
}
