'use client';

import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Info, Loader2, X } from 'lucide-react';
import ExperienceForm from '@/features/dashboard/components/profile/ExperienceForm';
import ProjectsForm from '@/features/dashboard/components/profile/ProjectsForm';
import EducationForm from '@/features/dashboard/components/profile/EducationForm';
import SkillsForm from '@/features/dashboard/components/profile/SkillsForm';
import type { ProfileStepHandle } from '@/features/dashboard/components/profile/step-handle';
import { completeOnboarding } from '@/features/dashboard/actions/profile-actions';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import BasicsStep, { basicsAreValid, type BasicsState } from './BasicsStep';
import {
  evaluateProfileCompleteness,
  projectsSectionVisible,
  toCompletenessInputFromFlags,
} from '@/features/dashboard/data/profile-completeness';
import { cn } from '@/shared/utils/cn';

type OptionalKey = 'experience' | 'projects' | 'education' | 'skills';
type StepKey = 'basics' | OptionalKey;

const STEPS = [
  { key: 'basics', label: 'Direction', title: 'Career direction', subtitle: 'Your name and the role you are targeting. Everything else on this step is optional.' },
  { key: 'experience', label: 'Experience', title: 'Work experience', subtitle: 'Add your roles — or skip and add them later.' },
  { key: 'projects', label: 'Projects', title: 'Projects', subtitle: 'Showcase what you have built. Optional.' },
  { key: 'education', label: 'Education', title: 'Education', subtitle: 'Your qualifications. Optional.' },
  { key: 'skills', label: 'Skills', title: 'Skills', subtitle: 'Group your skills by category. Optional.' },
] as const satisfies readonly { key: StepKey; label: string; title: string; subtitle: string }[];

/**
 * Complete a Career Profile manually.
 *
 * Retained deliberately, and no longer the universal first-run path. It is the
 * right tool for a user with no CV, for filling in what an import could not
 * read, for editing imported records, and for building a second Career Profile —
 * every one of which is a case where a form beats an upload.
 *
 * `includeBasics` is false when the goal-led journey has already collected the
 * career direction, so the user is not asked the same two questions twice.
 */
export default function ManualProfileWizard({
  initial,
  fallback,
  includeBasics = true,
}: {
  initial: ProfileData;
  fallback: { name: string; email: string };
  includeBasics?: boolean;
}) {
  const router = useRouter();
  const [stepKey, setStepKey] = useState<StepKey>(includeBasics ? 'basics' : 'experience');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [basics, setBasics] = useState<BasicsState>(() => ({
    valid: basicsAreValid({ ...initial.personal }),
    fullName: initial.personal.fullName || fallback.name,
    targetRoleTitle: initial.personal.targetRoleTitle,
    professionalSummary: initial.personal.professionalSummary,
    targetOccupation: initial.personal.targetOccupation,
  }));
  const [filled, setFilled] = useState({
    experience: initial.experience.length > 0,
    projects: initial.projects.length > 0,
    education: initial.education.length > 0,
    skills: initial.skills.length > 0,
  });

  const basicsRef = useRef<ProfileStepHandle>(null);
  const stepRef = useRef<ProfileStepHandle>(null);

  const onBasicsChange = useCallback((state: BasicsState) => setBasics(state), []);

  // A projects step is dropped entirely where the occupation marks it
  // irrelevant — but never while the user still has project rows, or they
  // would be left with data they cannot see or delete. `initial.projects` is
  // the persisted count, so this survives the user emptying the form in-session.
  const showProjects = projectsSectionVisible(basics.targetOccupation, initial.projects.length);

  const steps = useMemo(
    () =>
      STEPS.filter(
        (s) => (s.key !== 'projects' || showProjects) && (s.key !== 'basics' || includeBasics)
      ),
    [showProjects, includeBasics]
  );

  // Navigation is keyed, not indexed: changing occupation on the basics step
  // can add or remove a later step, and an index would then point at the wrong
  // one. Falls back to the first step if the current key ever disappears.
  const stepIndex = Math.max(0, steps.findIndex((s) => s.key === stepKey));
  const current = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const isBasics = current.key === 'basics';

  /** The shared calculation, fed from this wizard's own per-step state. */
  const completenessWith = useCallback(
    (overrides: Partial<Record<OptionalKey, boolean>>) => {
      const merged = { ...filled, ...overrides };
      return evaluateProfileCompleteness(
        toCompletenessInputFromFlags({
          targetOccupation: basics.targetOccupation,
          fullName: Boolean(basics.fullName.trim()),
          careerDirection: Boolean(basics.targetRoleTitle.trim()),
          professionalSummary: Boolean(basics.professionalSummary.trim()),
          ...merged,
        })
      ).percentage;
    },
    [basics, filled]
  );

  const completeness = completenessWith({});

  function markFilled(key: OptionalKey, value: boolean) {
    setFilled((f) => ({ ...f, [key]: value }));
  }

  function warnIncomplete(pct: number) {
    if (pct < 100) setToast(`Your profile is ${pct}% complete. Complete it to generate a CV.`);
  }

  function finish(pct: number) {
    startTransition(async () => {
      await completeOnboarding();
      warnIncomplete(pct);
      router.push('/dashboard');
      router.refresh();
    });
  }

  function goTo(offset: number) {
    const next = steps[stepIndex + offset];
    if (next) setStepKey(next.key);
  }

  function handleContinue() {
    setError('');
    if (isBasics) {
      if (!basics.valid) {
        setError('Please fill in every required field (marked *) before continuing.');
        return;
      }
      startTransition(async () => {
        await basicsRef.current?.save();
        goTo(1);
      });
      return;
    }

    const key = current.key as OptionalKey;
    startTransition(async () => {
      await stepRef.current?.save();
      // The section counts as filled only if the form actually persisted a row;
      // we optimistically mark it and let the dashboard reconcile on next load.
      markFilled(key, true);
      if (isLast) finish(completenessWith({ [key]: true }));
      else goTo(1);
    });
  }

  function handleSkip() {
    setError('');
    const key = current.key as OptionalKey;
    markFilled(key, false);
    const pctAfterSkip = completenessWith({ [key]: false });
    if (isLast) {
      finish(pctAfterSkip);
    } else {
      warnIncomplete(pctAfterSkip);
      goTo(1);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={s.key} className="flex flex-1 items-center">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                  i < stepIndex
                    ? 'bg-accent-purple text-white'
                    : i === stepIndex
                      ? 'bg-accent-purple/15 text-accent-purple ring-2 ring-accent-purple'
                      : 'bg-neutral-100 text-neutral-400'
                )}
              >
                {i < stepIndex ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={cn('mx-2 h-0.5 flex-1 rounded', i < stepIndex ? 'bg-accent-purple' : 'bg-neutral-200')} />
              )}
            </div>
          ))}
        </div>
        {/*
          Two different measurements, shown as two different things. Where you
          are in the form is not how complete your profile is: opening step two
          of five does not make a profile 40% complete, and printing them as one
          sentence made the old wizard claim exactly that.
        */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
          <span className="text-neutral-500">
            Step {stepIndex + 1} of {steps.length}
          </span>
          <span aria-hidden="true" className="text-neutral-300">
            ·
          </span>
          <span className="text-neutral-500">
            Career Profile {completeness}% complete
            <span className="sr-only"> — based on the details you have saved, not on this form&apos;s progress</span>
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-8">
        <h1 className="text-xl font-bold text-neutral-900">{current.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{current.subtitle}</p>

        <div className="mt-6">
          {current.key === 'basics' && (
            <BasicsStep ref={basicsRef} initial={initial.personal} fallback={fallback} onBasicsChange={onBasicsChange} />
          )}
          {current.key === 'experience' && <ExperienceForm ref={stepRef} initial={initial.experience} embedded />}
          {current.key === 'projects' && <ProjectsForm ref={stepRef} initial={initial.projects} skills={initial.skills} embedded />}
          {current.key === 'education' && <EducationForm ref={stepRef} initial={initial.education} embedded />}
          {current.key === 'skills' && <SkillsForm ref={stepRef} initial={initial.skills} embedded />}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 border-t border-neutral-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => goTo(-1)}
            disabled={stepIndex === 0 || isPending}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-900 disabled:invisible"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>

          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            {!isBasics && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={isPending}
                className="w-full rounded-full px-4 py-2.5 text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-900 disabled:opacity-50 sm:w-auto"
              >
                {isLast ? 'Skip & finish' : 'Skip for now'}
              </button>
            )}
            <button
              type="button"
              onClick={handleContinue}
              disabled={isPending || (isBasics && !basics.valid)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent-purple px-5 py-2.5 text-xs font-bold text-white transition-all hover:bg-accent-purple/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isLast ? 'Finish' : 'Save & continue'}
              {!isLast && !isPending && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      <WizardToast message={toast} onClose={() => setToast('')} />
    </div>
  );
}

function WizardToast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed bottom-6 right-6 z-50 w-full max-w-sm"
        >
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-xl">
            <div className="mt-0.5 rounded-lg bg-amber-100 p-1.5 text-amber-600">
              <Info className="h-4 w-4" />
            </div>
            <p className="flex-1 text-xs font-medium leading-relaxed text-amber-900">{message}</p>
            <button type="button" onClick={onClose} className="text-amber-400 transition-colors hover:text-amber-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
