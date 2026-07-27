'use client';

import { useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, FolderPlus } from 'lucide-react';
import type { CapabilityDecision } from '@/shared/entitlements/registry';
import { ChoiceCard, OnboardingShell, PrimaryButton, SecondaryButton } from './OnboardingShell';
import { createDraftCareerProfile } from '../actions';

export interface ProfileOption {
  id: string;
  label: string;
  isDefault: boolean;
  completeness: number;
}

/**
 * Which Career Profile this CV is going into.
 *
 * The rule that matters: with more than one profile the choice is ALWAYS
 * explicit. Quietly importing into whichever profile happened to be active is
 * how a warehouse CV ends up inside someone's nursing track, and the user only
 * finds out when a tailored CV comes out wrong.
 *
 * With no profiles at all there is nothing to choose between, so one is created
 * and named from the user's target role at the next step.
 */
export function ProfileSelectionStep({
  stageIndex,
  totalStages,
  profiles,
  profileCapacity,
  onSelected,
  onBack,
  onUpgrade,
}: {
  stageIndex: number;
  totalStages: number;
  profiles: ProfileOption[];
  profileCapacity: CapabilityDecision;
  onSelected: (profileId: string) => void;
  onBack: () => void;
  onUpgrade: () => void;
}) {
  const [choice, setChoice] = useState<string>(
    profiles.length === 1 ? profiles[0].id : ''
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canCreate = profileCapacity.allowed;

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createDraftCareerProfile();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSelected(result.profileId);
    });
  }

  function submit() {
    setError(null);
    if (choice === '__new__') {
      create();
      return;
    }
    if (!choice) {
      setError('Choose which Career Profile to use.');
      return;
    }
    onSelected(choice);
  }

  if (profiles.length === 0) {
    return (
      <OnboardingShell
        stageIndex={stageIndex}
        totalStages={totalStages}
        title="Let’s set up your Career Profile"
        subtitle="A Career Profile holds one career direction — your experience, education and skills for the kind of role you are going for. You can add more later."
        busy={pending}
        busyLabel={pending ? 'Creating your Career Profile…' : undefined}
        error={error}
        footer={
          <>
            <SecondaryButton onClick={onBack} disabled={pending}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back
            </SecondaryButton>
            <PrimaryButton onClick={create} disabled={pending || !canCreate}>
              Create my Career Profile
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </PrimaryButton>
          </>
        }
      >
        <p className="text-xs leading-relaxed text-neutral-600">
          We will name it from the role you tell us about next — you can rename it whenever you like.
        </p>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      stageIndex={stageIndex}
      totalStages={totalStages}
      title="Which Career Profile should this go into?"
      subtitle="Pick the profile these details belong to. Nothing is added until you have reviewed it."
      busy={pending}
      busyLabel={pending ? 'Creating your Career Profile…' : undefined}
      error={error}
      footer={
        <>
          <SecondaryButton onClick={onBack} disabled={pending}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back
          </SecondaryButton>
          <PrimaryButton onClick={submit} disabled={pending}>
            Continue
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </PrimaryButton>
        </>
      }
    >
      <fieldset className="space-y-3">
        <legend className="sr-only">Choose a Career Profile</legend>
        {profiles.map((profile) => (
          <ChoiceCard
            key={profile.id}
            name="onboarding-profile"
            value={profile.id}
            checked={choice === profile.id}
            onSelect={setChoice}
            title={profile.label}
            description={`${profile.completeness}% complete${profile.isDefault ? ' · your default profile' : ''}`}
            disabled={pending}
          />
        ))}
        <ChoiceCard
          name="onboarding-profile"
          value="__new__"
          checked={choice === '__new__'}
          onSelect={setChoice}
          title="Create a new Career Profile"
          description={
            canCreate
              ? 'Use this if the CV is for a different kind of role.'
              : `Your plan includes ${profileCapacity.limit} Career Profile${profileCapacity.limit === 1 ? '' : 's'}. Choose an existing one, or upgrade to add another.`
          }
          icon={<FolderPlus className="h-4 w-4 text-accent-purple" aria-hidden="true" />}
          disabled={pending || !canCreate}
        />
      </fieldset>

      {!canCreate && profileCapacity.upgradeTarget && (
        <button
          type="button"
          onClick={onUpgrade}
          className="mt-3 text-xs font-semibold text-accent-purple hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/40"
        >
          See what {profileCapacity.upgradeTarget} includes
        </button>
      )}
    </OnboardingShell>
  );
}
