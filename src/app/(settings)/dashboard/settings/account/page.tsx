import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AccountSettings from '@/features/settings/components/AccountSettings';
import DeleteAccountPanel from '@/features/settings/components/DeleteAccountPanel';
import { resolveBillingAccess } from '@/shared/billing/access';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { getStorageUsage } from '@/shared/services/storage-quota';

export default async function AccountSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const [user, billing] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        emailVerified: true,
        createdAt: true,
        accounts: { select: { providerId: true } },
      },
    }),
    resolveBillingAccess(session.user.id),
  ]);
  if (!user) redirect('/login');

  const providers = [...new Set(user.accounts.map((account) => account.providerId))];
  const storage = await getStorageUsage(session.user.id, billing.effectivePlan);

  return (
    <AccountSettings
      user={{
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt.toISOString(),
        providers,
      }}
      data={{
        bytesUsed: storage.bytesUsed,
        sourceRetentionDays: storage.sourceRetentionDays,
        maxGeneratedCvs: storage.maxGeneratedCvs,
        maxStoredAnalyses: storage.maxStoredAnalyses,
      }}
      dangerZone={<DeleteAccountPanel credentialUser={providers.includes('credential')} />}
    />
  );
}
