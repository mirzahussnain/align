import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/shared/lib/auth';
import { listProfiles } from '@/features/dashboard/data/load-profile';
import { checkCapability } from '@/shared/entitlements/server';
import { listStoredCvs } from '@/shared/services/stored-cv';
import { UPLOAD_POLICY } from '@/shared/policies';
import { ImportCvFlow } from '@/features/onboarding/components/ImportCvFlow';
import type { StoredCvSummary } from '@/features/onboarding/api';

export const dynamic = 'force-dynamic';

/**
 * Import a CV into an existing Career Profile.
 *
 * The returning-user entry point: a newer CV, a second profile, or a profile
 * built by hand that never had a source document attached. It does not recreate
 * anything — the user picks which profile the details go into, and existing
 * records are left alone unless they confirm a change.
 */
export default async function ImportCvPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const userId = session.user.id;
  const [profiles, storedCvs, profileCapacity, storedCvCapacity, evidenceCapacity] = await Promise.all([
    listProfiles(userId),
    listStoredCvs(userId),
    checkCapability(userId, 'additional_career_profiles'),
    checkCapability(userId, 'stored_source_cvs'),
    checkCapability(userId, 'profile_evidence_storage'),
  ]);

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto w-full max-w-3xl px-4 pt-8 sm:px-6">
        <h1 className="text-sm font-semibold text-neutral-500">Import a CV</h1>
      </div>
      <ImportCvFlow
        profiles={profiles.map((profile) => ({
          id: profile.id,
          label: profile.label,
          isDefault: profile.isDefault,
          completeness: profile.completeness,
        }))}
        profileCapacity={profileCapacity}
        storedCvs={JSON.parse(JSON.stringify(storedCvs)) as StoredCvSummary[]}
        storedCvCapacity={storedCvCapacity}
        evidenceCapacity={evidenceCapacity}
        maxUploadBytes={UPLOAD_POLICY.cv.maxBytes}
      />
    </main>
  );
}
