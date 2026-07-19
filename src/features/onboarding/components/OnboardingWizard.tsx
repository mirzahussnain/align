'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
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
import BasicsStep, { basicsAreValid } from './BasicsStep';
import { cn } from '@/shared/utils/cn';

type OptionalKey = 'experience' | 'projects' | 'education' | 'skills';

const STEPS = [
  { key: 'basics', label: 'Basics', title: 'Start with the basics', subtitle: 'The essentials every CV needs. This part is required.' },
  { key: 'experience', label: 'Experience', title: 'Work experience', subtitle: 'Add your roles — or skip and add them later.' },
  { key: 'projects', label: 'Projects', title: 'Projects', subtitle: 'Showcase what you have built. Optional.' },
  { key: 'education', label: 'Education', title: 'Education', subtitle: 'Your qualifications. Optional.' },
  { key: 'skills', label: 'Skills', title: 'Skills', subtitle: 'Group your skills by category. Optional.' },
] as const;

export default function OnboardingWizard({
  initial,
  fallback,
}: {
  initial: ProfileData;
  fallback: { name: string; email: string };
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [basicsValid, setBasicsValid] = useState(basicsAreValid({ ...initial.personal }));
  const [filled, setFilled] = useState({
    experience: initial.experience.length > 0,
    projects: initial.projects.length > 0,
    education: initial.education.length > 0,
    skills: initial.skills.length > 0,
  });

  const basicsRef = useRef<ProfileStepHandle>(null);
  const stepRef = useRef<ProfileStepHandle>(null);

  const onValidityChange = useCallback((valid: boolean) => setBasicsValid(valid), []);

  const isLast = step === STEPS.length - 1;
  const isBasics = step === 0;

  // Matches profileCompleteness(): fullName, summary + the four optional sections.
  const completeness = Math.round(
    ((basicsValid ? 2 : 0) + Object.values(filled).filter(Boolean).length) / 6 * 100
  );

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

  function handleContinue() {
    setError('');
    if (isBasics) {
      if (!basicsValid) {
        setError('Please fill in every required field (marked *) before continuing.');
        return;
      }
      startTransition(async () => {
        await basicsRef.current?.save();
        setStep(1);
      });
      return;
    }

    const key = STEPS[step].key as OptionalKey;
    startTransition(async () => {
      await stepRef.current?.save();
      // The section counts as filled only if the form actually persisted a row;
      // we optimistically mark it and let the dashboard reconcile on next load.
      markFilled(key, true);
      if (isLast) finish(completeness);
      else setStep((s) => s + 1);
    });
  }

  function handleSkip() {
    setError('');
    const key = STEPS[step].key as OptionalKey;
    markFilled(key, false);
    const pctAfterSkip = Math.round(
      ((basicsValid ? 2 : 0) + Object.entries(filled).filter(([k, v]) => k !== key && v).length) / 6 * 100
    );
    if (isLast) {
      finish(pctAfterSkip);
    } else {
      warnIncomplete(pctAfterSkip);
      setStep((s) => s + 1);
    }
  }

  const current = STEPS[step];

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex flex-1 items-center">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                  i < step
                    ? 'bg-accent-purple text-white'
                    : i === step
                      ? 'bg-accent-purple/15 text-accent-purple ring-2 ring-accent-purple'
                      : 'bg-neutral-100 text-neutral-400'
                )}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('mx-2 h-0.5 flex-1 rounded', i < step ? 'bg-accent-purple' : 'bg-neutral-200')} />
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs font-medium text-neutral-500">
          Step {step + 1} of {STEPS.length} · Profile {completeness}% complete
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-bold text-neutral-900">{current.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{current.subtitle}</p>

        <div className="mt-6">
          {step === 0 && (
            <BasicsStep ref={basicsRef} initial={initial.personal} fallback={fallback} onValidityChange={onValidityChange} />
          )}
          {step === 1 && <ExperienceForm ref={stepRef} initial={initial.experience} embedded />}
          {step === 2 && <ProjectsForm ref={stepRef} initial={initial.projects} embedded />}
          {step === 3 && <EducationForm ref={stepRef} initial={initial.education} embedded />}
          {step === 4 && <SkillsForm ref={stepRef} initial={initial.skills} embedded />}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
            {error}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between border-t border-neutral-100 pt-6">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || isPending}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-900 disabled:invisible"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>

          <div className="flex items-center gap-3">
            {!isBasics && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={isPending}
                className="rounded-full px-4 py-2.5 text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-900 disabled:opacity-50"
              >
                {isLast ? 'Skip & finish' : 'Skip for now'}
              </button>
            )}
            <button
              type="button"
              onClick={handleContinue}
              disabled={isPending || (isBasics && !basicsValid)}
              className="inline-flex items-center gap-2 rounded-full bg-accent-purple px-5 py-2.5 text-xs font-bold text-white transition-all hover:bg-accent-purple/90 disabled:cursor-not-allowed disabled:opacity-50"
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
