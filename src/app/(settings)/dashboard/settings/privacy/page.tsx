import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import PrivacySettings from '@/features/settings/components/PrivacySettings';
import { resolveBillingAccess } from '@/shared/billing/access';
import { auth } from '@/shared/lib/auth';
import { getStorageUsage } from '@/shared/services/storage-quota';

export default async function PrivacySettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const billing = await resolveBillingAccess(session.user.id);
  const storage = await getStorageUsage(session.user.id, billing.effectivePlan);

  return <PrivacySettings storage={storage} />;
}
