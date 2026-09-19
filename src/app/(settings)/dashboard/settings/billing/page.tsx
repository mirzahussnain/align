import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import BillingView from '@/features/dashboard/components/views/BillingView';
import { resolveBillingAccess } from '@/shared/billing/access';
import { auth } from '@/shared/lib/auth';
import { getStorageUsage } from '@/shared/services/storage-quota';

export default async function BillingSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const billing = await resolveBillingAccess(session.user.id);
  const storage = await getStorageUsage(session.user.id, billing.effectivePlan);

  return (
    <BillingView
      tier={billing.effectivePlan.toLowerCase()}
      storage={storage}
      billing={{
        plan: billing.effectivePlan,
        status: billing.status,
        cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
        accessEndsAt: billing.accessEndsAt?.toISOString() ?? null,
        graceEndsAt: billing.graceEndsAt?.toISOString() ?? null,
        checkoutAvailable: billing.checkoutAvailable,
        portalAvailable: billing.portalAvailable,
      }}
    />
  );
}
