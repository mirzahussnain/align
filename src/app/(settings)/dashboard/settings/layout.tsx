import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import DashboardRouteShell from '@/features/dashboard/components/DashboardRouteShell';
import { listProfiles } from '@/features/dashboard/data/load-profile';
import SettingsShell from '@/features/settings/components/SettingsShell';
import { getEntitlementSnapshot } from '@/shared/entitlements/server';
import { auth } from '@/shared/lib/auth';

export default async function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const [profiles, entitlement] = await Promise.all([
    listProfiles(session.user.id),
    getEntitlementSnapshot(session.user.id),
  ]);
  const activeProfile = profiles.find((profile) => profile.isDefault) ?? profiles[0];

  return (
    <DashboardRouteShell
      user={session.user}
      tier={entitlement.plan.toLowerCase()}
      entitlementSnapshot={entitlement}
      profiles={profiles}
      activeProfileId={activeProfile?.id ?? ''}
      maxProfiles={entitlement.capabilities.additional_career_profiles.limit ?? 1}
    >
      <SettingsShell user={session.user}>{children}</SettingsShell>
    </DashboardRouteShell>
  );
}
