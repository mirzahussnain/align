'use client';

import type { ReactNode } from 'react';
import { EntitlementProvider } from '@/shared/components/entitlements/EntitlementProvider';
import type { EntitlementSnapshot } from '@/shared/entitlements/server';
import type { ProfileSummary } from '@/features/dashboard/data/load-profile';
import Sidebar from './Sidebar';

interface DashboardRouteShellProps {
  children: ReactNode;
  user: { name: string; email: string; image?: string | null };
  tier: string;
  entitlementSnapshot: EntitlementSnapshot;
  profiles: ProfileSummary[];
  activeProfileId: string;
  maxProfiles: number;
}

export default function DashboardRouteShell({
  children,
  user,
  tier,
  entitlementSnapshot,
  profiles,
  activeProfileId,
  maxProfiles,
}: DashboardRouteShellProps) {
  return (
    <EntitlementProvider initialSnapshot={entitlementSnapshot}>
      <div className="flex min-h-screen bg-neutral-50 text-neutral-900 dark:bg-bg-primary dark:text-text-primary">
        <Sidebar
          user={user}
          tier={tier}
          profiles={profiles}
          activeProfileId={activeProfileId}
          maxProfiles={maxProfiles}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </EntitlementProvider>
  );
}
