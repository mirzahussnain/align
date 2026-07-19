import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { loadProfileData } from '@/features/dashboard/data/load-profile';
import OnboardingWizard from '@/features/onboarding/components/OnboardingWizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const userId = session.user.id;

  const [user, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { onboardedAt: true } }),
    loadProfileData(userId),
  ]);

  // Already onboarded — nothing to do here.
  if (user?.onboardedAt) redirect('/dashboard');

  return (
    <main className="min-h-screen bg-neutral-50">
      <OnboardingWizard
        initial={profile}
        fallback={{ name: session.user.name ?? '', email: session.user.email ?? '' }}
      />
    </main>
  );
}
