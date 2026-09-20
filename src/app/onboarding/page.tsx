import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { loadProfileData, listProfiles } from '@/features/dashboard/data/load-profile';
import { OnboardingJourney } from '@/features/onboarding/components/OnboardingJourney';
import { getOnboardingState, shouldOnboard } from '@/shared/services/onboarding';
import { loadImportSession } from '@/shared/services/cv-import';
import { loadOwnedExtraction, listStoredCvs } from '@/shared/services/stored-cv';
import { UPLOAD_POLICY } from '@/shared/policies';
import { checkCapability, getUserPlan } from '@/shared/entitlements/server';
import { entitlementsFor } from '@/shared/lib/entitlements';
import { OCCUPATION_OPTIONS, SENIORITY_OPTIONS } from '@/shared/constants/occupation-options';
import type { ImportSession, OnboardingState, StoredCvSummary } from '@/features/onboarding/api';

export const dynamic = 'force-dynamic';

/**
 * The goal-led first-run journey.
 *
 * Everything the client needs is resolved here, server-side: the persisted
 * stage, the user's profiles, and the live entitlement decisions the screens
 * quote. No plan number is computed in a component — a hard-coded "3 of 3" is
 * wrong the moment pricing changes, and silently so.
 */
export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const userId = session.user.id;

  // Existing users who have already been through onboarding are never pulled
  // back into it: `onboardedAt` is checked first, exactly as it always was.
  if (!(await shouldOnboard(userId))) redirect('/dashboard');

  const state = await getOnboardingState(userId);

  const [profiles, profileData, plan] = await Promise.all([
    listProfiles(userId),
    loadProfileData(userId, state.selectedProfileId ?? undefined),
    getUserPlan(userId),
  ]);

  const [profileCapacity, aiAtsDecision, jobMatchDecision, evidenceCapacity, storedCvCapacity, storedCvs] =
    await Promise.all([
      checkCapability(userId, 'additional_career_profiles'),
      checkCapability(userId, 'ai_enhanced_ats_analysis'),
      checkCapability(userId, 'job_match_analysis'),
      checkCapability(userId, 'profile_evidence_storage'),
      checkCapability(userId, 'stored_source_cvs'),
      listStoredCvs(userId),
    ]);

  // Resuming mid-review must show the SAME session, not a fresh one — candidate
  // ids the user has already acted on have to survive a refresh.
  const importSession = state.importSessionId
    ? await loadImportSession(userId, state.importSessionId).catch(() => null)
    : null;

  // The parser's read of a headline, offered as a target-role suggestion for the
  // user to accept or change. A suggestion, never a stored fact.
  const extracted = state.extractionId
    ? await loadOwnedExtraction(userId, state.extractionId).catch(() => null)
    : null;

  // Whether reconciliation is worth offering at all: comparing against an empty
  // profile has nothing to compare, and must never spend an allowance to say so.
  const existingRecordCount = state.selectedProfileId
    ? await prisma.experience.count({ where: { profileId: state.selectedProfileId } })
    : 0;

  return (
    <main className="min-h-screen bg-neutral-50">
      <OnboardingJourney
        // Serialised because the state carries Date fields, which cannot cross
        // the server/client boundary as-is.
        initialState={JSON.parse(JSON.stringify(state)) as OnboardingState}
        profiles={profiles.map((profile) => ({
          id: profile.id,
          label: profile.label,
          isDefault: profile.isDefault,
          completeness: profile.completeness,
        }))}
        profileCapacity={profileCapacity}
        aiAtsDecision={aiAtsDecision}
        jobMatchDecision={jobMatchDecision}
        retentionDays={entitlementsFor(plan).sourceRetentionDays}
        storedCvs={JSON.parse(JSON.stringify(storedCvs)) as StoredCvSummary[]}
        storedCvCapacity={storedCvCapacity}
        maxUploadBytes={UPLOAD_POLICY.cv.maxBytes}
        identity={{
          fullName: profileData.personal.fullName || (session.user.name ?? ''),
          targetRoleTitle: profileData.personal.targetRoleTitle,
          // "Default" is the database's placeholder, not a name the user chose.
          label: profileData.personal.label === 'Default' ? '' : profileData.personal.label,
          targetOccupation: profileData.personal.targetOccupation,
          targetSeniority: profileData.personal.targetSeniority,
          tagline: profileData.personal.tagline,
          country: profileData.personal.country,
          city: profileData.personal.city,
          visaStatus: profileData.personal.visaStatus,
          visaExpiry: profileData.personal.visaExpiry,
        }}
        importSession={
          importSession ? (JSON.parse(JSON.stringify(importSession)) as ImportSession) : null
        }
        evidenceCapacity={evidenceCapacity}
        occupationOptions={[...OCCUPATION_OPTIONS]}
        seniorityOptions={[...SENIORITY_OPTIONS]}
        suggestedRoleFromCv={extracted?.structured.headline}
        profileHasExistingRecords={existingRecordCount > 0}
      />
    </main>
  );
}
