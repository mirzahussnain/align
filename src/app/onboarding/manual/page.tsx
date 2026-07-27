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
 * A first-class route rather than the universal first-run path. It serves users
 * with no CV, users filling in what an import could not read, users editing
 * imported records, and users building a second profile.
 *
 * Reachable directly, so it also works for someone who has already finished
 * onboarding and just wants to fill their profile in — which is why there is no
 * `onboardedAt` redirect here.
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

  // The goal-led journey collects career direction on its own step, so arriving
  // from there must not ask for it a second time.
  const basicsAlreadyCollected = resolved.basics === 'done' || Boolean(state?.selectedProfileId);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto w-full max-w-3xl px-4 pt-8 sm:px-6">
        <h1 className="text-sm font-semibold text-neutral-500">Complete Career Profile manually</h1>
      </div>
      <ManualProfileWizard
        initial={profile}
        fallback={{ name: session.user.name ?? '', email: session.user.email ?? '' }}
        includeBasics={!basicsAlreadyCollected}
      />
    </main>
  );
}
