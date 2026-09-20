'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CapabilityDecision } from '@/shared/entitlements/registry';
import { OnboardingExperience } from './OnboardingShell';
import { PricingDetailsDialog } from '@/shared/components/billing/PricingDetailsDialog';
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
const IMPORT_STAGES: Stage[] = ['UPLOAD', 'EXTRACTION', 'PROFILE', 'REVIEW'];

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
  const [transitionDirection, setTransitionDirection] = useState<1 | -1>(1);
  const [storedCvId, setStoredCvId] = useState<string | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [session, setSession] = useState<ImportSession | null>(null);
  const [profileHasRecords, setProfileHasRecords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);

  function moveTo(nextStage: Stage) {
    setTransitionDirection(IMPORT_STAGES.indexOf(nextStage) < IMPORT_STAGES.indexOf(stage) ? -1 : 1);
    setStage(nextStage);
  }

  function goToDashboard() {
    router.push('/dashboard');
    router.refresh();
  }

  async function openImport(profileId: string) {
    setSelectedProfileId(profileId);
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
      moveTo('REVIEW');
    } catch (importError) {
      setError(
        importError instanceof OnboardingRequestError
          ? importError.message
          : 'We could not prepare your details for review.'
      );
    }
  }

  const stages = IMPORT_STAGES;
  const stageIndex = stages.indexOf(stage);

  const content = (() => {
    switch (stage) {
    case 'UPLOAD':
      return (
        <UploadStep
          stageIndex={0}
          totalStages={stages.length}
          initialStoredCvs={storedCvs}
          initialCapacity={storedCvCapacity}
          maxBytes={maxUploadBytes}
          onUploaded={(id) => {
            setStoredCvId(id);
            moveTo('EXTRACTION');
          }}
          onManualPath={goToDashboard}
          onBack={goToDashboard}
          onUpgrade={() => setPricingOpen(true)}
        />
      );

    case 'EXTRACTION':
      return storedCvId ? (
        <ExtractionStep
          stageIndex={1}
          totalStages={stages.length}
          storedCvId={storedCvId}
          onExtracted={(id) => {
            setExtractionId(id);
            moveTo('PROFILE');
          }}
          onManualPath={goToDashboard}
        />
      ) : null;

    case 'PROFILE':
      return (
        <ProfileSelectionStep
          initialProfileId={selectedProfileId}
          stageIndex={2}
          totalStages={stages.length}
          profiles={profiles}
          profileCapacity={profileCapacity}
          onSelected={(profileId) => void openImport(profileId)}
          onBack={() => moveTo('UPLOAD')}
          onUpgrade={() => setPricingOpen(true)}
        />
      );

    case 'REVIEW':
      return session ? (
        <ImportReviewStep
          stageIndex={3}
          totalStages={stages.length}
          session={session}
          evidenceCapacity={evidenceCapacity}
          reconciliationOffered={profileHasRecords}
          onDone={goToDashboard}
          onBack={() => moveTo('PROFILE')}
        />
      ) : (
        <p role="alert" className="mx-auto max-w-3xl px-4 py-10 text-sm text-rose-600">
          {error ?? 'We could not open that import.'}
        </p>
      );
  }
  })();

  return (
    <>
      <OnboardingExperience stage={stage} stages={stages} stageIndex={stageIndex} direction={transitionDirection} intent="import">
        {content}
      </OnboardingExperience>
      <PricingDetailsDialog
        open={pricingOpen}
        onClose={() => setPricingOpen(false)}
        context={{
          capability: stage === 'UPLOAD' ? 'stored_source_cvs' : 'additional_career_profiles',
          decision: stage === 'UPLOAD' ? storedCvCapacity : profileCapacity,
        }}
        onViewPlans={() => router.push('/dashboard/settings/billing')}
      />
    </>
  );
}
