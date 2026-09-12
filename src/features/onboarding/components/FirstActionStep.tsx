'use client';

import { ArrowRight, Check, FileSearch, Target } from 'lucide-react';
import type { CapabilityDecision } from '@/shared/entitlements/registry';
import { OnboardingShell, PrimaryButton, SecondaryButton } from './OnboardingShell';

export function FirstActionStep({
  stageIndex,
  totalStages,
  goal,
  aiAtsDecision,
  jobMatchDecision,
  onRunAts,
  onRunJobMatch,
  onGoToDashboard,
}: {
  stageIndex: number;
  totalStages: number;
  goal: 'CHECK_CV' | 'MATCH_JOB' | 'BUILD_PROFILE' | 'NO_CV' | null;
  aiAtsDecision: CapabilityDecision;
  jobMatchDecision: CapabilityDecision;
  onRunAts: () => void;
  onRunJobMatch: () => void;
  onGoToDashboard: () => void;
}) {
  const wantsJobMatch = goal === 'MATCH_JOB';
  const profileOnly = goal === 'NO_CV' || goal === 'BUILD_PROFILE';

  if (profileOnly) {
    return (
      <OnboardingShell
        stageIndex={stageIndex}
        totalStages={totalStages}
        title="Your Career Profile is ready"
        subtitle="What you confirmed is saved and ready to improve job matching and application guidance."
        footer={
          <>
            <SecondaryButton onClick={onGoToDashboard}>Go to dashboard</SecondaryButton>
            <PrimaryButton onClick={onRunAts}>
              <FileSearch className="h-4 w-4" aria-hidden="true" />
              Check a CV
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </PrimaryButton>
          </>
        }
      >
        <ReadyPanel
          title="A useful foundation, not a finished document"
          description="You can add more experience, education and skills whenever they become relevant."
        />
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      stageIndex={stageIndex}
      totalStages={totalStages}
      title={wantsJobMatch ? 'Your profile is ready for a job match' : 'Your profile is ready for a CV check'}
      subtitle={
        wantsJobMatch
          ? 'Add a job description next and Align will compare it with the experience you confirmed.'
          : 'Run a review next to see how clearly your CV presents the experience you confirmed.'
      }
      footer={
        <>
          <SecondaryButton onClick={onGoToDashboard}>Do this later</SecondaryButton>
          <PrimaryButton onClick={wantsJobMatch ? onRunJobMatch : onRunAts}>
            {wantsJobMatch ? <Target className="h-4 w-4" aria-hidden="true" /> : <FileSearch className="h-4 w-4" aria-hidden="true" />}
            {wantsJobMatch ? 'Start job match' : 'Check my CV'}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </PrimaryButton>
        </>
      }
    >
      <ReadyPanel
        title="Everything you approved is saved"
        description={
          wantsJobMatch
            ? jobMatchDecision.limit !== undefined
              ? `Your plan includes ${jobMatchDecision.limit} job matches a month, with ${jobMatchDecision.remaining} left.`
              : 'Job matching is included on your plan.'
            : aiAtsDecision.allowed
              ? `The standard review is always included. You also have ${aiAtsDecision.remaining} enhanced reviews remaining this month.`
              : 'The standard review for formatting and structure is always included, with no monthly limit.'
        }
      />
    </OnboardingShell>
  );
}

function ReadyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl bg-sky-50/50 p-5 ring-1 ring-inset ring-accent-cyan/20 border border-accent-cyan/20 sm:p-6">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-cyan text-white shadow-sm">
        <Check className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
      </div>
    </div>
  );
}
