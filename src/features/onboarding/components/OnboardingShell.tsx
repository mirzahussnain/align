'use client';

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Image from 'next/image';
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  Circle,
  FileCheck2,
  FileSearch,
  Loader2,
  LockKeyhole,
  MapPinCheck,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  UserRoundCheck,
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';

type JourneyContextValue = {
  stage: string;
  stages: readonly string[];
  stageIndex: number;
  direction: 1 | -1;
  intent?: 'onboarding' | 'manual' | 'import';
};

const JourneyContext = createContext<JourneyContextValue | null>(null);

const STAGE_META: Record<
  string,
  { label: string; heading: string; supporting: string; icon: typeof Target }
> = {
  GOAL: {
    label: 'Starting Point',
    heading: 'Build a profile that works harder for you.',
    supporting: 'Align turns your real experience into clearer job-fit and application guidance.',
    icon: Sparkles,
  },
  CV_SOURCE: {
    label: 'Choose A Source',
    heading: 'Start with what you already have.',
    supporting: 'Import a CV or build manually. You stay in control of every detail.',
    icon: FileCheck2,
  },
  UPLOAD: {
    label: 'Add Your CV',
    heading: 'Bring your experience into one place.',
    supporting: 'Your original file stays private and nothing enters your profile without review.',
    icon: Upload,
  },
  EXTRACTION: {
    label: 'Read Your CV',
    heading: 'Turning your CV into useful profile details.',
    supporting: 'Align is organising the document for review. It is not saving profile facts yet.',
    icon: FileSearch,
  },
  PROFILE_SELECTION: {
    label: 'Career Profile',
    heading: 'Keep each career direction distinct.',
    supporting: 'Choose where these details belong so future matching stays relevant.',
    icon: BriefcaseBusiness,
  },
  PROFILE: {
    label: 'Career Profile',
    heading: 'Keep each career direction distinct.',
    supporting: 'Choose where these details belong so future matching stays relevant.',
    icon: BriefcaseBusiness,
  },
  CAREER_DIRECTION: {
    label: 'Career Direction',
    heading: 'Give your experience a clear destination.',
    supporting: 'Your target role tells Align what good fit should look like for you.',
    icon: Target,
  },
  IMPORT_REVIEW: {
    label: 'Review Details',
    heading: 'Your profile, with your approval.',
    supporting: 'Confirm what is accurate, correct what is not, and leave out anything you do not want.',
    icon: UserRoundCheck,
  },
  REVIEW: {
    label: 'Review Details',
    heading: 'Your profile, with your approval.',
    supporting: 'Confirm what is accurate, correct what is not, and leave out anything you do not want.',
    icon: UserRoundCheck,
  },
  ELIGIBILITY_BASICS: {
    label: 'Practical Fit',
    heading: 'Add context that changes which roles fit.',
    supporting: 'A few optional details help Align surface practical constraints without making them the focus.',
    icon: MapPinCheck,
  },
  FIRST_ACTION: {
    label: 'Ready To Use',
    heading: 'Your Career Profile now has a purpose.',
    supporting: 'Use it for a clearer CV review, a grounded job match, or continue from your dashboard.',
    icon: ShieldCheck,
  },
  basics: {
    label: 'Direction',
    heading: 'Start With The Role You Want To Move Towards.',
    supporting: 'This anchors how Align interprets the rest of your experience.',
    icon: Target,
  },
  profile: {
    label: 'Profile',
    heading: 'Add Your Professional Context.',
    supporting: 'Keep contact details and your professional summary together, separate from your career direction.',
    icon: UserRoundCheck,
  },
  eligibility: {
    label: 'Eligibility',
    heading: 'Add Practical Eligibility Context.',
    supporting: 'These optional details help Align identify roles that are realistic for you.',
    icon: MapPinCheck,
  },  experience: {
    label: 'Experience',
    heading: 'Capture The Work That Shows What You Can Do.',
    supporting: 'Add what is relevant now. You can return and build on it later.',
    icon: BriefcaseBusiness,
  },
  projects: {
    label: 'Projects',
    heading: 'Make Practical Work Part Of Your Story.',
    supporting: 'Projects can add evidence where formal experience is still growing.',
    icon: FileCheck2,
  },
  education: {
    label: 'Education',
    heading: 'Record The Qualifications That Support Your Direction.',
    supporting: 'Add the education that helps employers understand your foundation.',
    icon: FileCheck2,
  },
  skills: {
    label: 'Skills',
    heading: 'Finish With The Capabilities You Want Matched.',
    supporting: 'Group skills clearly so role comparisons use the right evidence.',
    icon: Sparkles,
  },
};

function metaFor(stage: string) {
  return (
    STAGE_META[stage] ?? {
      label: stage.toLowerCase().replaceAll('_', ' '),
      heading: 'Build A Clearer Career Profile.',
      supporting: 'Each step adds context that improves matching and application guidance.',
      icon: Circle,
    }
  );
}

export function OnboardingExperience({
  stage,
  stages,
  stageIndex,
  children,
  intent = 'onboarding',
  preserveContent = false,
  direction = 1,
}: {
  stage: string;
  stages: readonly string[];
  stageIndex: number;
  children: ReactNode;
  intent?: JourneyContextValue['intent'];
  preserveContent?: boolean;
  direction?: 1 | -1;
}) {
  const reduceMotion = useReducedMotion();

  const visibleStages = useMemo(() => stages.filter((item) => item !== 'COMPLETE'), [stages]);
  const currentMeta = metaFor(stage);
  const listedIndex = visibleStages.indexOf(stage);
  const progressIndex = listedIndex >= 0 ? listedIndex : Math.max(0, stageIndex);
  const progressTotal = Math.max(1, visibleStages.length);
  const progressPercentage = Math.round(((progressIndex + 1) / progressTotal) * 100);

  const context = useMemo(
    () => ({ stage, stages, stageIndex, direction, intent }),
    [stage, stages, stageIndex, direction, intent]
  );

  const content = preserveContent ? (
    <motion.div className="h-full" layout={!reduceMotion} transition={{ duration: 0.24 }}>
      {children}
    </motion.div>
  ) : (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={stage}
        custom={direction}
        initial={reduceMotion ? false : { opacity: 0, x: direction * 22, filter: 'blur(5px)' }}
        animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
        exit={reduceMotion ? { opacity: 1 } : { opacity: 0, x: direction * -14, filter: 'blur(3px)' }}
        transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <JourneyContext.Provider value={context}>
      <div className="relative min-h-[100dvh] overflow-hidden bg-slate-100 p-0 lg:p-5 xl:p-7">
        <template
          data-impeccable-contract="code-led-align-profile-rail"
          dangerouslySetInnerHTML={{
            __html:
              '<!-- THESIS: Onboarding is a guided assembly of a trustworthy Career Profile, not a long form. OWN-WORLD: Ink-slate contextual rail, paper-white workspace, cyan detail and restrained actions; 12-16px surfaces and compact controls. STORY: Choose an outcome, bring relevant evidence, approve what is recorded, then use the profile immediately. FIRST VIEWPORT: A stable dark context rail occupies one third; a focused decision surface occupies the rest with actions anchored below. FORM: Split workspace, selected from the existing-flow structural study; seed code-led-align-profile-rail. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(82,207,226,0.11),transparent_28%),radial-gradient(circle_at_86%_86%,rgba(14,165,233,0.06),transparent_30%)]"
        />

        <div className="relative mx-auto grid min-h-[100dvh] max-w-[1480px] overflow-hidden bg-white shadow-[0_24px_90px_rgba(31,41,55,0.13)] lg:h-[calc(100dvh-2.5rem)] lg:min-h-0 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.65fr)] lg:rounded-2xl xl:h-[calc(100dvh-3.5rem)]">
          <aside className="relative hidden overflow-hidden bg-slate-900 px-8 py-8 text-white lg:flex lg:flex-col xl:px-10 xl:py-10">
            <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-24 h-80 w-80 rounded-full bg-cyan-300/10 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-28 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />

            <div className="relative flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/8 ring-1 ring-white/12">
                <Image src="/assets/svgs/logo.svg" alt="" width={24} height={24} className="h-6 w-6 object-contain" />
              </span>
              <span className="text-[15px] font-bold tracking-[-0.02em]">Align</span>
            </div>

            {stage === 'GOAL' ? (
              <div className="relative my-auto max-w-sm py-12">
                <h2 className="mt-5 text-[clamp(2rem,3vw,3rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-white">
                  {currentMeta.heading}
                </h2>
                <p className="mt-5 max-w-[32ch] text-sm leading-6 text-slate-300">{currentMeta.supporting}</p>
              </div>
            ) : (
              <div className="relative mt-12 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Your Progress</p>
                <ol className="mt-6 space-y-1" aria-label="Onboarding progress">
                  {visibleStages.map((item, index) => {
                    const itemMeta = metaFor(item);
                    const completed = index < progressIndex;
                    const current = item === stage;
                    return (
                      <li key={`${item}-${index}`} className="relative flex min-h-9 items-center gap-3">
                        {index < visibleStages.length - 1 && (
                          <span
                            aria-hidden="true"
                            className={cn(
                              'absolute left-[13px] top-[25px] h-[18px] w-px transition-colors duration-300',
                              completed ? 'bg-cyan-300/70' : 'bg-white/12'
                            )}
                          />
                        )}
                        <span
                          className={cn(
                            'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-300',
                            completed && 'border-cyan-300/70 bg-cyan-300/12 text-cyan-200',
                            current && 'border-white/75 bg-white text-slate-950 shadow-[0_6px_24px_rgba(255,255,255,0.15)]',
                            !completed && !current && 'border-white/20 text-slate-300'
                          )}
                        >
                          {completed ? <Check className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" /> : <span className="text-[11px] font-semibold tabular-nums">{index + 1}</span>}
                        </span>
                        <span
                          className={cn(
                            'truncate text-xs font-medium transition-colors',
                            current ? 'text-white' : completed ? 'text-slate-300' : 'text-slate-300'
                          )}
                          aria-current={current ? 'step' : undefined}
                        >
                          {itemMeta.label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={stage}
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -5 }}
                transition={{ duration: reduceMotion ? 0 : 0.22 }}
                className="relative mt-8 border-t border-white/10 pt-6"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/7 text-cyan-200 ring-1 ring-white/10">
                    <currentMeta.icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{currentMeta.heading}</p>
                    <p className="mt-1 max-w-[34ch] text-xs leading-5 text-slate-400">{currentMeta.supporting}</p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#fbfcfd]">
            <header className="border-b border-slate-200/80 bg-white/80 px-4 py-4 backdrop-blur-md sm:px-6 lg:hidden">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <Image src="/assets/svgs/logo.svg" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
                  <span className="text-sm font-bold tracking-[-0.02em] text-slate-900">Align</span>
                </div>
                <p className="text-xs font-semibold tabular-nums text-slate-500">{Math.min(progressIndex + 1, progressTotal)} of {progressTotal}</p>
              </div>
              <div
                role="progressbar"
                aria-valuenow={progressIndex + 1}
                aria-valuemin={1}
                aria-valuemax={progressTotal}
                aria-label={`Setup progress: step ${progressIndex + 1} of ${progressTotal}`}
                className="mt-3 h-1 overflow-hidden rounded-full bg-slate-200"
              >
                <motion.div
                  className="h-full rounded-full bg-accent-cyan"
                  animate={{ width: `${progressPercentage}%` }}
                  transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <p className="mt-2 text-[11px] font-medium text-slate-600">{currentMeta.label}</p>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-7 lg:px-10 lg:[scrollbar-gutter:stable] xl:px-16">{content}</div>
          </section>
        </div>
      </div>
    </JourneyContext.Provider>
  );
}

export function OnboardingShell({
  stageIndex,
  totalStages,
  title,
  subtitle,
  children,
  footer,
  busy,
  busyLabel,
  error,
}: {
  stageIndex: number;
  totalStages: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  busyLabel?: string;
  error?: string | null;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const journey = useContext(JourneyContext);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [title]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col py-8 sm:py-10 lg:min-h-[calc(100dvh-2.5rem)] lg:justify-center lg:py-12 xl:min-h-[calc(100dvh-3.5rem)]">
      {!journey && (
        <div className="mb-7 lg:hidden">
          <p className="text-xs font-semibold tabular-nums text-slate-500">Step {Math.min(stageIndex + 1, totalStages)} of {totalStages}</p>
          <div
            role="progressbar"
            aria-valuenow={stageIndex}
            aria-valuemin={0}
            aria-valuemax={totalStages}
            aria-label={`Setup progress: step ${stageIndex + 1} of ${totalStages}`}
            className="mt-3 h-1 overflow-hidden rounded-full bg-slate-200"
          >
            <div className="h-full rounded-full bg-accent-cyan" style={{ width: `${Math.round(((stageIndex + 1) / totalStages) * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="w-full">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="max-w-[19ch] text-[clamp(1.8rem,4vw,2.65rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-slate-950 outline-none"
        >
          {title}
        </h1>
        {subtitle && <p className="mt-3 max-w-[62ch] text-sm leading-6 text-slate-600 sm:text-[15px]">{subtitle}</p>}

        <div className="mt-7 sm:mt-9">{children}</div>

        <p aria-live="polite" className="sr-only">{busy ? busyLabel ?? 'Working...' : ''}</p>

        {busy && busyLabel && (
          <p className="mt-5 flex items-center gap-2 text-xs font-medium text-slate-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-cyan motion-reduce:animate-none" aria-hidden="true" />
            {busyLabel}
          </p>
        )}

        <AnimatePresence initial={false}>
          {error && (
            <motion.p
              role="alert"
              initial={reduceMotion ? false : { opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
              className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-xs font-medium leading-5 text-rose-800 ring-1 ring-inset ring-rose-200"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {footer && (
          <div className="mt-9 flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function PrimaryButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-[background-color,transform,box-shadow] duration-200 hover:bg-slate-800 active:translate-y-px active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/45 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none sm:w-auto',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-[border-color,background-color,color,transform] duration-200 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/35 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  title,
  description,
  icon,
  disabled,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  title: string;
  description: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.label
      layout={!reduceMotion}
      whileTap={disabled || reduceMotion ? undefined : { scale: 0.992 }}
      className={cn(
        'group relative flex min-h-[82px] cursor-pointer items-start gap-4 overflow-hidden rounded-2xl border px-4 py-4 transition-[border-color,background-color,box-shadow] duration-200 focus-within:outline-none focus-within:ring-2 focus-within:ring-accent-cyan/45 focus-within:ring-offset-2 sm:px-5',
        checked
          ? 'border-accent-cyan/60 bg-sky-50/50 shadow-[0_10px_30px_rgba(2,132,199,0.06)] ring-1 ring-accent-cyan/20'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/75',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={() => onSelect(value)} className="sr-only" />
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors',
          checked ? 'border-accent-cyan/25 bg-accent-cyan text-white' : 'border-slate-200 bg-slate-50 text-slate-500 group-hover:bg-white'
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="block text-sm font-semibold tracking-[-0.01em] text-slate-950">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-600">{description}</span>
      </span>
      <span
        className={cn(
          'mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all',
          checked ? 'bg-accent-cyan text-white' : 'bg-slate-100 text-slate-400 group-hover:text-slate-600'
        )}
      >
        {checked ? <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" /> : <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
      </span>
    </motion.label>
  );
}

export function TrustNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-slate-100/80 px-4 py-3.5 text-xs leading-5 text-slate-600">
      <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
