'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CapabilityDecision } from '@/shared/entitlements/registry';
import { OnboardingExperience } from './OnboardingShell';
import { PricingDetailsDialog } from '@/shared/components/billing/PricingDetailsDialog';
import { GoalStep } from './GoalStep';
import { CvSourceStep } from './CvSourceStep';
import { UploadStep } from './UploadStep';
import { ExtractionStep } from './ExtractionStep';
import { ProfileSelectionStep, type ProfileOption } from './ProfileSelectionStep';
import { CareerDirectionStep, type CareerDirectionDraft } from './CareerDirectionStep';
import { ImportReviewStep } from './ImportReviewStep';
import { EligibilityStep } from './EligibilityStep';
import { FirstActionStep } from './FirstActionStep';
import {
  onboardingApi,
  OnboardingRequestError,
  type ImportSession,
  type OnboardingGoal,
  type OnboardingStage,
  type OnboardingState,
  type StoredCvSummary,
} from '../api';

/**
 * The goal-led first-run journey.
 *
 * The server owns where the user is; this component asks to move and renders
 * whatever comes back. That is deliberate — the stage unlocks upload, import and
 * the first action, so a client that could set its own stage could walk past the
 * checks each of those depends on.
 *
 * Because the stage is persisted, refreshing, closing the browser or coming back
 * on another device all resume rather than restart, and no step is repeated.
 */
export function OnboardingJourney({
  initialState,
  profiles,
  profileCapacity,
  aiAtsDecision,
  jobMatchDecision,
  retentionDays,
  storedCvs,
  storedCvCapacity,
  maxUploadBytes,
  identity,
  importSession: initialImportSession,
  evidenceCapacity,
  occupationOptions,
  seniorityOptions,
  suggestedRoleFromCv,
  profileHasExistingRecords,
}: {
  initialState: OnboardingState;
  profiles: ProfileOption[];
  profileCapacity: CapabilityDecision;
  aiAtsDecision: CapabilityDecision;
  jobMatchDecision: CapabilityDecision;
  retentionDays: number | null;
  storedCvs: StoredCvSummary[];
  storedCvCapacity: CapabilityDecision;
  maxUploadBytes: number;
  identity: {
    fullName: string;
    targetRoleTitle: string;
    label: string;
    targetOccupation: string;
    targetSeniority: string;
    tagline: string;
    country: string;
    city: string;
    visaStatus: string;
    visaExpiry: string;
  };
  importSession: ImportSession | null;
  evidenceCapacity: CapabilityDecision;
  occupationOptions: { value: string; label: string }[];
  seniorityOptions: { value: string; label: string }[];
  suggestedRoleFromCv?: string;
  profileHasExistingRecords: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [importSession, setImportSession] = useState(initialImportSession);
  const [busy, setBusy] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<1 | -1>(1);
  const stageIndexRef = useRef(initialState.progress.stageIndex);
  const [error, setError] = useState<string | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [careerDirectionDraft, setCareerDirectionDraft] = useState<CareerDirectionDraft>({
    fullName: identity.fullName,
    targetRoleTitle: identity.targetRoleTitle || suggestedRoleFromCv || '',
    label: identity.label,
    targetOccupation: identity.targetOccupation,
    targetSeniority: identity.targetSeniority,
    tagline: identity.tagline,
  });

  /** Every stage move goes through here, so one place handles busy and errors. */
  const move = useCallback(
    async (run: () => Promise<OnboardingState>) => {
      setBusy(true);
      setError(null);
      try {
        const nextState = await run();
        setTransitionDirection(nextState.progress.stageIndex < stageIndexRef.current ? -1 : 1);
        stageIndexRef.current = nextState.progress.stageIndex;
        setState(nextState);
      } catch (moveError) {
        setError(
          moveError instanceof OnboardingRequestError
            ? moveError.message
            : 'Something went wrong. Please try again.'
        );
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const goTo = useCallback(
    (stage: OnboardingStage, extra: Record<string, unknown> = {}) =>
      move(() => onboardingApi.advance({ stage, ...extra })),
    [move]
  );

  const stageIndex = state.progress.stageIndex;
  const totalStages = state.progress.totalStages;

  function goToDashboard() {
    router.push('/dashboard');
    router.refresh();
  }

  async function dismiss() {
    await move(() => onboardingApi.dismiss());
    goToDashboard();
  }

  /**
   * Leaving the upload path for manual entry. The GOAL is kept: "I said check my
   * CV but I'll type it in" is a normal thing to do, and throwing away their
   * answer would mean asking it again.
   */
  function switchToManual() {
    void goTo('PROFILE_SELECTION', { manualPath: true });
  }

  async function openImport(profileId: string) {
    if (!state.storedCvId || !state.extractionId) {
      // No CV in play — this is the manual path, which skips import entirely.
      await goTo('CAREER_DIRECTION', { selectedProfileId: profileId, manualPath: true });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await onboardingApi.openImport({
        storedCvId: state.storedCvId,
        extractionId: state.extractionId,
        profileId,
      });
      setImportSession(result.session);
      setState(
        await onboardingApi.advance({
          stage: 'CAREER_DIRECTION',
          selectedProfileId: profileId,
          importSessionId: result.session.id,
        })
      );
    } catch (importError) {
      setError(
        importError instanceof OnboardingRequestError
          ? importError.message
          : 'We could not prepare your details for review.'
      );
    } finally {
      setBusy(false);
    }
  }

  const content = (() => {
    switch (state.stage) {
    case 'GOAL':
      return (
        <GoalStep
          initialGoal={state.goal}
          stageIndex={stageIndex}
          totalStages={totalStages}
          busy={busy}
          error={error}
          onChoose={(goal: OnboardingGoal) => move(() => onboardingApi.chooseGoal(goal))}
          onDismiss={() => void dismiss()}
        />
      );

    case 'CV_SOURCE':
      return (
        <CvSourceStep
          stageIndex={stageIndex}
          totalStages={totalStages}
          retentionDays={retentionDays}
          maxBytes={maxUploadBytes}
          busy={busy}
          error={error}
          onUploadPath={() => void goTo('UPLOAD')}
          onManualPath={switchToManual}
          onBack={() => void goTo('GOAL')}
        />
      );

    case 'UPLOAD':
      return (
        <UploadStep
          stageIndex={stageIndex}
          totalStages={totalStages}
          initialStoredCvs={storedCvs}
          initialCapacity={storedCvCapacity}
          maxBytes={maxUploadBytes}
          onUploaded={(storedCvId) => void goTo('EXTRACTION', { storedCvId })}
          onManualPath={switchToManual}
          onBack={() => void goTo('CV_SOURCE')}
          onUpgrade={() => setPricingOpen(true)}
        />
      );

    case 'EXTRACTION':
      return state.storedCvId ? (
        <ExtractionStep
          stageIndex={stageIndex}
          totalStages={totalStages}
          storedCvId={state.storedCvId}
          onExtracted={(extractionId) => void goTo('PROFILE_SELECTION', { extractionId })}
          onManualPath={switchToManual}
        />
      ) : null;

    case 'PROFILE_SELECTION':
      return (
        <ProfileSelectionStep
          initialProfileId={state.selectedProfileId}
          stageIndex={stageIndex}
          totalStages={totalStages}
          profiles={profiles}
          profileCapacity={profileCapacity}
          onSelected={(profileId) => void openImport(profileId)}
          onBack={() => void goTo(state.storedCvId ? 'EXTRACTION' : 'GOAL')}
          onUpgrade={() => setPricingOpen(true)}
        />
      );

    case 'CAREER_DIRECTION':
      return state.selectedProfileId ? (
        <CareerDirectionStep
          stageIndex={stageIndex}
          totalStages={totalStages}
          profileId={state.selectedProfileId}
          initial={{ ...careerDirectionDraft, suggestedRoleFromCv }}
          occupationOptions={occupationOptions}
          seniorityOptions={seniorityOptions}
          onSaved={(draft) => {
            setCareerDirectionDraft(draft);
            if (importSession) {
              void goTo('IMPORT_REVIEW');
              return;
            }
            // No CV to import from: hand over to the manual wizard for the
            // experience, education and skills steps rather than reimplementing
            // them here. Career direction has just been collected, so it is
            // not asked for again.
            router.push(`/onboarding/manual?basics=done&profile=${state.selectedProfileId}`);
          }}
          onBack={() => void goTo('PROFILE_SELECTION')}
        />
      ) : null;

    case 'IMPORT_REVIEW':
      return importSession ? (
        <ImportReviewStep
          stageIndex={stageIndex}
          totalStages={totalStages}
          session={importSession}
          evidenceCapacity={evidenceCapacity}
          reconciliationOffered={profileHasExistingRecords}
          onDone={() =>
            void goTo(state.goal === 'BUILD_PROFILE' ? 'FIRST_ACTION' : 'ELIGIBILITY_BASICS')
          }
          onBack={() => void goTo('CAREER_DIRECTION')}
        />
      ) : null;

    case 'ELIGIBILITY_BASICS':
      return (
        <EligibilityStep
          stageIndex={stageIndex}
          totalStages={totalStages}
          initial={{
            country: identity.country,
            city: identity.city,
            visaStatus: identity.visaStatus,
            visaExpiry: identity.visaExpiry,
          }}
          onSaved={() => void goTo('FIRST_ACTION')}
          onSkip={() => void goTo('FIRST_ACTION')}
          onBack={() => void goTo('IMPORT_REVIEW')}
        />
      );

    case 'FIRST_ACTION':
      return (
        <FirstActionStep
          stageIndex={stageIndex}
          totalStages={totalStages}
          goal={state.goal}
          aiAtsDecision={aiAtsDecision}
          jobMatchDecision={jobMatchDecision}
          onRunAts={() => router.push('/analyze')}
          onRunJobMatch={() => router.push('/analyze?mode=job_match')}
          onGoToDashboard={() => void dismiss()}
        />
      );

    case 'COMPLETE':
    default:
      goToDashboard();
      return null;
  }
  })();

  return (
    <>
      <OnboardingExperience
        stage={state.stage}
        stages={state.stages}
        stageIndex={state.progress.stageIndex}
        direction={transitionDirection}
      >
        {content}
      </OnboardingExperience>
      <PricingDetailsDialog
        open={pricingOpen}
        onClose={() => setPricingOpen(false)}
        context={{
          capability: state.stage === 'UPLOAD' ? 'stored_source_cvs' : 'additional_career_profiles',
          decision: state.stage === 'UPLOAD' ? storedCvCapacity : profileCapacity,
        }}
        onViewPlans={() => router.push('/dashboard?tab=billing')}
      />
    </>
  );
}
