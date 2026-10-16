'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import {
  markAllNotificationsRead as markAllNotificationsReadService,
  markNotificationRead as markNotificationReadService,
} from '@/lib/services/notifications';
import { formError, type ActionResult } from '@/lib/validation/action-result';

export async function markAllNotificationsRead(): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError("You don't have permission to do that.");

  await markAllNotificationsReadService(session.user.id);
  revalidatePath('/', 'layout');
  return { ok: true, data: null };
}

export async function markNotificationRead(notificationId: string): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError("You don't have permission to do that.");

  await markNotificationReadService({ notificationId, userId: session.user.id });
  revalidatePath('/', 'layout');
  return { ok: true, data: null };
}
