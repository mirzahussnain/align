'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CapabilityDecision } from '@/shared/entitlements/registry';
import { UploadStep } from './UploadStep';
import { ExtractionStep } from './ExtractionStep';
import { ProfileSelectionStep, type ProfileOption } from './ProfileSelectionStep';
import { ImportReviewStep } from './ImportReviewStep';
import { onboardingApi, OnboardingRequestError, type ImportSession, type StoredCvSummary } from '../api';

/**
 * Importing a CV outside the first-run journey.
 *
 * Existing users need this for the cases the journey does not cover: a newer CV,
 * a second Career Profile, or a profile that was built by hand and never had a
 * source document attached. It reuses the same steps — and therefore the same
 * duplicate detection, the same entitlement enforcement and the same review
 * rules — but keeps its stage locally, because onboarding state belongs to
 * onboarding and a returning user is not repeating it.
 */
type Stage = 'UPLOAD' | 'EXTRACTION' | 'PROFILE' | 'REVIEW';

export function ImportCvFlow({
  profiles,
  profileCapacity,
  storedCvs,
  storedCvCapacity,
  evidenceCapacity,
  maxUploadBytes,
}: {
  profiles: ProfileOption[];
  profileCapacity: CapabilityDecision;
  storedCvs: StoredCvSummary[];
  storedCvCapacity: CapabilityDecision;
  evidenceCapacity: CapabilityDecision;
  maxUploadBytes: number;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('UPLOAD');
  const [storedCvId, setStoredCvId] = useState<string | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [session, setSession] = useState<ImportSession | null>(null);
  const [profileHasRecords, setProfileHasRecords] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goToDashboard() {
    router.push('/dashboard');
    router.refresh();
  }

  async function openImport(profileId: string) {
    if (!storedCvId || !extractionId) return;
    setError(null);
    try {
      const result = await onboardingApi.openImport({ storedCvId, extractionId, profileId });
      setSession(result.session);
      // Reconciliation is only worth offering where there is something to
      // compare against; a profile with nothing in it must never spend an
      // allowance to be told everything is new.
      setProfileHasRecords(
        (profiles.find((profile) => profile.id === profileId)?.completeness ?? 0) > 0
      );
      setStage('REVIEW');
    } catch (importError) {
      setError(
        importError instanceof OnboardingRequestError
          ? importError.message
          : 'We could not prepare your details for review.'
      );
    }
  }

  const STEP_COUNT = 4;

  switch (stage) {
    case 'UPLOAD':
      return (
        <UploadStep
          stageIndex={0}
          totalStages={STEP_COUNT}
          initialStoredCvs={storedCvs}
          initialCapacity={storedCvCapacity}
          maxBytes={maxUploadBytes}
          onUploaded={(id) => {
            setStoredCvId(id);
            setStage('EXTRACTION');
          }}
          onManualPath={goToDashboard}
          onBack={goToDashboard}
          onUpgrade={() => router.push('/dashboard?tab=billing')}
        />
      );

    case 'EXTRACTION':
      return storedCvId ? (
        <ExtractionStep
          stageIndex={1}
          totalStages={STEP_COUNT}
          storedCvId={storedCvId}
          onExtracted={(id) => {
            setExtractionId(id);
            setStage('PROFILE');
          }}
          onManualPath={goToDashboard}
        />
      ) : null;

    case 'PROFILE':
      return (
        <ProfileSelectionStep
          stageIndex={2}
          totalStages={STEP_COUNT}
          profiles={profiles}
          profileCapacity={profileCapacity}
          onSelected={(profileId) => void openImport(profileId)}
          onBack={() => setStage('UPLOAD')}
          onUpgrade={() => router.push('/dashboard?tab=billing')}
        />
      );

    case 'REVIEW':
      return session ? (
        <ImportReviewStep
          stageIndex={3}
          totalStages={STEP_COUNT}
          session={session}
          evidenceCapacity={evidenceCapacity}
          reconciliationOffered={profileHasRecords}
          onDone={goToDashboard}
          onBack={() => setStage('PROFILE')}
        />
      ) : (
        <p role="alert" className="mx-auto max-w-3xl px-4 py-10 text-sm text-rose-600">
          {error ?? 'We could not open that import.'}
        </p>
      );
  }
}
