import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/shared/lib/auth';
import { loadProfileData } from '@/features/dashboard/data/load-profile';
import ManualProfileWizard from '@/features/onboarding/components/ManualProfileWizard';
import { peekOnboardingState } from '@/shared/services/onboarding';

export const dynamic = 'force-dynamic';

/**
 * Complete a Career Profile manually.
 *
 * This stays a first-class route for users without a CV, people completing an
 * import, and returning users building another profile. Authentication, profile
 * ownership and the existing resume semantics remain server-owned here.
 */
export default async function ManualProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const resolved = await searchParams;
  const requestedProfile = Array.isArray(resolved.profile) ? resolved.profile[0] : resolved.profile;

  const [state, profile] = await Promise.all([
    peekOnboardingState(session.user.id),
    loadProfileData(session.user.id, requestedProfile),
  ]);

  const basicsAlreadyCollected = resolved.basics === 'done' || Boolean(state?.selectedProfileId);

  return (
    <main>
      <ManualProfileWizard
        initial={profile}
        fallback={{ name: session.user.name ?? '', email: session.user.email ?? '' }}
        includeBasics={!basicsAlreadyCollected}
      />
    </main>
  );
}
