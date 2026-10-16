import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { canManagePeople } from '@/lib/permissions';
import { getEscalationSettings, getRuleSettings, getSlaSettings } from '@/lib/settings';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = {
  title: 'SLA & escalation settings — miLife Service Desk',
};

export default async function AdminSettingsPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  if (!canManagePeople(session.user)) redirect('/');

  const [slaSettings, escalationSettings, ruleSettings] = await Promise.all([
    getSlaSettings(),
    getEscalationSettings(),
    getRuleSettings(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-title font-bold text-ink">SLA &amp; escalation</h1>
      <p className="mt-1 text-small text-muted">
        Changes apply the next time a cron job runs (every minute). The fuller Administration area,
        with an audit trail for changes like these, is Phase 8.
      </p>
      <div className="mt-6">
        <SettingsForm
          slaSettings={slaSettings}
          escalationSettings={escalationSettings}
          ruleSettings={ruleSettings}
        />
      </div>
    </div>
  );
}
