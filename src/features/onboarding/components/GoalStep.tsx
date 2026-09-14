'use client';

import { useState } from 'react';
import { ArrowRight, Briefcase, FileSearch, PencilLine, Target } from 'lucide-react';
import { ChoiceCard, OnboardingShell, PrimaryButton, SecondaryButton } from './OnboardingShell';
import type { OnboardingGoal } from '../api';

/**
 * The first screen: what does the user want first?
 *
 * Deliberately carries no upgrade messaging. Someone who has just signed up has
 * not seen the product do anything yet, and asking them to pay before they have
 * is both premature and a good way to lose them. Plan limits appear later, at
 * the point where one actually applies.
 */

const GOALS: { value: OnboardingGoal; title: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'CHECK_CV',
    title: 'Check my CV',
    description: 'Review formatting, structure, ATS readability and improvement opportunities.',
    icon: <FileSearch className="h-4 w-4" aria-hidden="true" />,
  },
  {
    value: 'MATCH_JOB',
    title: 'Match my CV to a job',
    description: 'Compare your experience with a job description and identify evidence gaps.',
    icon: <Target className="h-4 w-4" aria-hidden="true" />,
  },
  {
    value: 'BUILD_PROFILE',
    title: 'Build my Career Profile',
    description: 'Create a reusable profile for future applications and tailored CVs.',
    icon: <Briefcase className="h-4 w-4" aria-hidden="true" />,
  },
  {
    value: 'NO_CV',
    title: 'I do not have a CV yet',
    description: 'Build your profile manually and create a CV later.',
    icon: <PencilLine className="h-4 w-4" aria-hidden="true" />,
  },
];

export function GoalStep({
  initialGoal,
  stageIndex,
  totalStages,
  busy,
  error,
  onChoose,
  onDismiss,
}: {
  initialGoal?: OnboardingGoal | null;
  stageIndex: number;
  totalStages: number;
  busy: boolean;
  error: string | null;
  onChoose: (goal: OnboardingGoal) => void;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState<OnboardingGoal | null>(initialGoal ?? null);

  return (
    <OnboardingShell
      stageIndex={stageIndex}
      totalStages={totalStages}
      title="What would you like to do first?"
      subtitle="Choose the outcome that matters now. You can use every other part of Align later."
      busy={busy}
      busyLabel={busy ? 'Saving your choice…' : undefined}
      error={error}
      footer={
        <>
          <SecondaryButton onClick={onDismiss} disabled={busy}>
            Skip setup
          </SecondaryButton>
          <PrimaryButton onClick={() => selected && onChoose(selected)} disabled={!selected || busy}>
            Continue
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </PrimaryButton>
        </>
      }
    >
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Choose what you would like to do first</legend>
        {GOALS.map((goal) => (
          <ChoiceCard
            key={goal.value}
            name="onboarding-goal"
            value={goal.value}
            checked={selected === goal.value}
            onSelect={(value) => setSelected(value as OnboardingGoal)}
            title={goal.title}
            description={goal.description}
            icon={goal.icon}
            disabled={busy}
          />
        ))}
      </fieldset>
    </OnboardingShell>
  );
}
