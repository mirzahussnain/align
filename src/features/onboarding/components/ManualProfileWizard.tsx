'use client';

import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Info, Loader2, X } from 'lucide-react';
import ExperienceForm from '@/features/dashboard/components/profile/ExperienceForm';
import ProjectsForm from '@/features/dashboard/components/profile/ProjectsForm';
import EducationForm from '@/features/dashboard/components/profile/EducationForm';
import SkillsForm from '@/features/dashboard/components/profile/SkillsForm';
import type { ProfileStepHandle } from '@/features/dashboard/components/profile/step-handle';
import { completeOnboarding } from '@/features/dashboard/actions/profile-actions';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import BasicsStep, { basicsAreValid, type BasicsState } from './BasicsStep';
import { ProfileBackgroundStep } from './ProfileBackgroundStep';
import { ManualEligibilityStep } from './ManualEligibilityStep';
import {
  evaluateProfileCompleteness,
  projectsSectionVisible,
  toCompletenessInputFromFlags,
} from '@/features/dashboard/data/profile-completeness';
import {
  OnboardingExperience,
  OnboardingShell,
  PrimaryButton,
  SecondaryButton,
} from './OnboardingShell';

type OptionalKey = 'profile' | 'experience' | 'projects' | 'education' | 'skills' | 'eligibility';
type StepKey = 'basics' | OptionalKey;

const STEPS = [
  {
    key: 'basics',
    label: 'Direction',
    title: 'Set Your Career Direction',
    subtitle: 'Start with the role you are targeting. This gives every detail that follows a useful context.',
  },
  {
    key: 'profile',
    label: 'Profile',
    title: 'Add Profile Details',
    subtitle: 'Contact details and a short summary are optional. You can add or update them later.',
  },
  {
    key: 'experience',
    label: 'Experience',
    title: 'Add Your Work Experience',
    subtitle: 'Include the roles that best show what you can do, or continue and add them later.',
  },
  {
    key: 'projects',
    label: 'Projects',
    title: 'Add Relevant Projects',
    subtitle: 'Projects can show practical evidence of your skills, especially while your experience is growing.',
  },
  {
    key: 'education',
    label: 'Education',
    title: 'Add Your Education',
    subtitle: 'Record the qualifications that support the direction you are pursuing.',
  },
  {
    key: 'skills',
    label: 'Skills',
    title: 'Add Your Key Skills',
    subtitle: 'Group your capabilities so Align can compare them with roles more accurately.',
  },
  {
    key: 'eligibility',
    label: 'Eligibility',
    title: 'A Couple Of Eligibility Basics',
    subtitle: 'These help us judge whether a role is realistic for you. You can add them later instead.',
  },
] as const satisfies readonly { key: StepKey; label: string; title: string; subtitle: string }[];

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
    profile: Boolean(initial.personal.professionalSummary.trim() || initial.personal.email.trim() || initial.personal.phoneNumber.trim()),
    experience: initial.experience.length > 0,
    projects: initial.projects.length > 0,
    education: initial.education.length > 0,
    skills: initial.skills.length > 0,
    eligibility: Boolean(initial.personal.country.trim() || initial.personal.city.trim() || initial.personal.visaStatus.trim()),
  });

  const basicsRef = useRef<ProfileStepHandle>(null);
  const profileRef = useRef<ProfileStepHandle>(null);
  const experienceRef = useRef<ProfileStepHandle>(null);
  const projectsRef = useRef<ProfileStepHandle>(null);
  const educationRef = useRef<ProfileStepHandle>(null);
  const skillsRef = useRef<ProfileStepHandle>(null);
  const eligibilityRef = useRef<ProfileStepHandle>(null);

  const onBasicsChange = useCallback((state: BasicsState) => setBasics(state), []);
  const showProjects = projectsSectionVisible(basics.targetOccupation, initial.projects.length);

  const steps = useMemo(
    () =>
      STEPS.filter(
        (step) =>
          (step.key !== 'projects' || showProjects) &&
          (step.key !== 'basics' || includeBasics)
      ),
    [showProjects, includeBasics]
  );

  const stepIndex = Math.max(0, steps.findIndex((step) => step.key === stepKey));
  const current = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const isBasics = current.key === 'basics';

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
    setFilled((currentFilled) => ({ ...currentFilled, [key]: value }));
  }

  function warnIncomplete(percentage: number) {
    if (percentage < 100) {
      setToast(`Your Career Profile is ${percentage}% complete. You can keep building it from your dashboard.`);
    }
  }

  function finish(percentage: number) {
    startTransition(async () => {
      await completeOnboarding();
      warnIncomplete(percentage);
      router.push('/dashboard');
      router.refresh();
    });
  }

  function goTo(offset: number) {
    const next = steps[stepIndex + offset];
    if (next) setStepKey(next.key);
  }

  function refFor(key: OptionalKey) {
    return {
      profile: profileRef,
      experience: experienceRef,
      projects: projectsRef,
      education: educationRef,
      skills: skillsRef,
      eligibility: eligibilityRef,
    }[key];
  }

  function handleContinue() {
    setError('');
    if (isBasics) {
      if (!basics.valid) {
        setError('Add your name and target role before continuing. Complete any other marked fields shown here.');
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
      try {
        await refFor(key).current?.save();
        markFilled(key, true);
        if (isLast) finish(completenessWith({ [key]: true }));
        else goTo(1);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'We could not save this step. Please try again.');
      }
    });
  }

  function handleSkip() {
    setError('');
    const key = current.key as OptionalKey;
    markFilled(key, false);
    const percentageAfterSkip = completenessWith({ [key]: false });
    if (isLast) finish(percentageAfterSkip);
    else {
      warnIncomplete(percentageAfterSkip);
      goTo(1);
    }
  }

  const footer = (
    <>
      <SecondaryButton onClick={() => goTo(-1)} disabled={stepIndex === 0 || isPending} className={stepIndex === 0 ? 'invisible' : ''}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </SecondaryButton>

      <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
        {!isBasics && (
          <button
            type="button"
            onClick={handleSkip}
            disabled={isPending}
            className="min-h-11 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/35 disabled:opacity-50 sm:w-auto"
          >
            {isLast ? 'Skip And Finish' : 'Skip For Now'}
          </button>
        )}
        <PrimaryButton onClick={handleContinue} disabled={isPending || (isBasics && !basics.valid)}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isLast ? 'Finish Profile' : 'Save And Continue'}
          {!isLast && !isPending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </PrimaryButton>
      </div>
    </>
  );

  return (
    <OnboardingExperience
      stage={current.key}
      stages={steps.map((step) => step.key)}
      stageIndex={stepIndex}
      intent="manual"
      preserveContent
    >
      <OnboardingShell
        stageIndex={stepIndex}
        totalStages={steps.length}
        title={current.title}
        subtitle={current.subtitle}
        error={error}
        footer={footer}
      >
        <div className="mb-6 flex items-center justify-between rounded-xl bg-slate-100/80 px-4 py-3 text-xs font-medium text-slate-600">
          <span>Career Profile Completeness</span>
          <span className="font-semibold tabular-nums text-slate-900">{completeness}%</span>
        </div>

        <div hidden={current.key !== 'basics'}>
          {includeBasics && (
            <BasicsStep ref={basicsRef} initial={initial.personal} fallback={fallback} onBasicsChange={onBasicsChange} />
          )}
        </div>
        <div hidden={current.key !== 'profile'}><ProfileBackgroundStep ref={profileRef} initial={initial.personal} profileId={initial.profileId} onSummaryChange={(professionalSummary) => setBasics((current) => ({ ...current, professionalSummary }))} /></div>
        <div hidden={current.key !== 'experience'}>
          <ExperienceForm ref={experienceRef} initial={initial.experience} embedded />
        </div>
        {showProjects && (
          <div hidden={current.key !== 'projects'}>
            <ProjectsForm ref={projectsRef} initial={initial.projects} skills={initial.skills} embedded />
          </div>
        )}
        <div hidden={current.key !== 'education'}>
          <EducationForm ref={educationRef} initial={initial.education} embedded />
        </div>
        <div hidden={current.key !== 'skills'}>
          <SkillsForm ref={skillsRef} initial={initial.skills} embedded />
        </div>
        <div hidden={current.key !== 'eligibility'}><ManualEligibilityStep ref={eligibilityRef} initial={initial.personal} /></div>
      </OnboardingShell>

      <WizardToast message={toast} onClose={() => setToast('')} />
    </OnboardingExperience>
  );
}

function WizardToast({ message, onClose }: { message: string; onClose: () => void }) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-4 bottom-4 z-50 mx-auto w-auto max-w-sm sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-full"
        >
          <div className="flex items-start gap-3 rounded-2xl bg-slate-950 p-4 text-white shadow-[0_18px_55px_rgba(15,23,42,0.28)]">
            <span className="mt-0.5 rounded-lg bg-white/10 p-1.5 text-cyan-200">
              <Info className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="flex-1 text-xs font-medium leading-5 text-slate-200">{message}</p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Dismiss message"
              className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
