'use client';

import { ArrowRight, FileSearch, Target } from 'lucide-react';
import type { CapabilityDecision } from '@/shared/entitlements/registry';
import { OnboardingShell, PrimaryButton, SecondaryButton } from './OnboardingShell';

/**
 * The hand-off to a real result.
 *
 * One primary action, chosen from the goal the user picked at the start —
 * offering three equally-weighted buttons here just moves the decision they
 * already made back onto them.
 *
 * Nothing on this screen gates a result behind a paid operation. Deterministic
 * ATS is always available, so a Free user with no AI quota left still reaches a
 * useful outcome and still completes onboarding.
 */
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
        title="Your Career Profile is ready to use"
        subtitle="You can check a CV against it, match it to a job, or keep filling it in."
        footer={
          <>
            <SecondaryButton onClick={onGoToDashboard}>Go to my dashboard</SecondaryButton>
            <PrimaryButton onClick={onRunAts}>
              <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
              Check a CV
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </PrimaryButton>
          </>
        }
      >
        <p className="text-xs leading-relaxed text-neutral-600">
          Everything you confirmed is saved. You can add more experience, education and skills at any time from
          your profile.
        </p>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      stageIndex={stageIndex}
      totalStages={totalStages}
      title={wantsJobMatch ? 'Match your CV to a job' : 'Let’s check your CV'}
      subtitle={
        wantsJobMatch
          ? 'Paste a job description and we will compare your experience against what it asks for.'
          : 'We will review formatting, structure, ATS readability and what to improve.'
      }
      footer={
        <>
          <SecondaryButton onClick={onGoToDashboard}>I’ll do this later</SecondaryButton>
          <PrimaryButton onClick={wantsJobMatch ? onRunJobMatch : onRunAts}>
            {wantsJobMatch ? (
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {wantsJobMatch ? 'Start a job match' : 'Check my CV'}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </PrimaryButton>
        </>
      }
    >
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs leading-relaxed text-neutral-600">
        {wantsJobMatch ? (
          <p>
            {jobMatchDecision.limit !== undefined
              ? `Your plan includes ${jobMatchDecision.limit} job match${jobMatchDecision.limit === 1 ? '' : 'es'} a month — you have ${jobMatchDecision.remaining} left.`
              : 'Job matching is included on your plan.'}
          </p>
        ) : (
          <>
            <p>The formatting and structure review is always included, with no monthly limit.</p>
            <p className="mt-1.5">
              {aiAtsDecision.allowed
                ? `Your plan also includes AI-enhanced review — you have ${aiAtsDecision.remaining} of ${aiAtsDecision.limit} left this month.`
                : 'You have used your AI-enhanced reviews for this month, so this run will use the standard review. Your result is not affected by that.'}
            </p>
          </>
        )}
      </div>
    </OnboardingShell>
  );
}
