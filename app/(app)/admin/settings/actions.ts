'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth';
import { canManagePeople } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { formError, type ActionResult } from '@/lib/validation/action-result';
import { updateAdminSettingsSchema } from '@/lib/validation/settings';

const FORBIDDEN = "You don't have permission to do that.";

export async function updateAdminSettings(input: unknown): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return formError(FORBIDDEN);
  if (!canManagePeople(session.user)) return formError(FORBIDDEN);

  const parsed = updateAdminSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  const data = parsed.data;

  if (data.level2AfterMinutesMode === 'CUSTOM' && data.level2AfterMinutesCustom === undefined) {
    return { ok: false, fieldErrors: { level2AfterMinutesCustom: ['Enter a number of minutes'] } };
  }
  const level2AfterMinutes: Prisma.InputJsonValue =
    data.level2AfterMinutesMode === 'RESOLVE_TARGET'
      ? 'RESOLVE_TARGET'
      : data.level2AfterMinutesCustom!;

  await prisma.$transaction([
    prisma.setting.update({
      where: { key: 'sla.targets' },
      data: { value: data.targets as unknown as Prisma.InputJsonValue },
    }),
    prisma.setting.update({
      where: { key: 'sla.calendar' },
      data: { value: data.calendarByPriority as unknown as Prisma.InputJsonValue },
    }),
    prisma.setting.update({
      where: { key: 'sla.businessHours' },
      data: { value: data.businessHours as unknown as Prisma.InputJsonValue },
    }),
    prisma.setting.update({
      where: { key: 'sla.warningPercent' },
      data: { value: data.warningPercent },
    }),
    prisma.setting.update({
      where: { key: 'sla.pauseWhileAwaitingRequester' },
      data: { value: data.pauseWhileAwaitingRequester },
    }),
    prisma.setting.upsert({
      where: { key: 'escalation.level2AfterMinutes' },
      create: { key: 'escalation.level2AfterMinutes', value: level2AfterMinutes },
      update: { value: level2AfterMinutes },
    }),
    prisma.setting.update({
      where: { key: 'rules.autoCloseEnabled' },
      data: { value: data.autoCloseEnabled },
    }),
    prisma.setting.update({
      where: { key: 'rules.autoCloseResolvedAfterDays' },
      data: { value: data.autoCloseResolvedAfterDays },
    }),
  ]);

  revalidatePath('/admin/settings');
  return { ok: true, data: null };
}
