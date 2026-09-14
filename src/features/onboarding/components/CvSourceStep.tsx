'use client';

import { ArrowLeft, ArrowRight, FileUp, PencilLine } from 'lucide-react';
import { motion } from 'framer-motion';
import { OnboardingShell, SecondaryButton, TrustNote } from './OnboardingShell';

export function CvSourceStep({
  stageIndex,
  totalStages,
  retentionDays,
  maxBytes,
  busy,
  error,
  onUploadPath,
  onManualPath,
  onBack,
}: {
  stageIndex: number;
  totalStages: number;
  retentionDays: number | null;
  maxBytes: number;
  busy: boolean;
  error: string | null;
  onUploadPath: () => void;
  onManualPath: () => void;
  onBack: () => void;
}) {
  const maxMb = Math.round(maxBytes / (1024 * 1024));

  return (
    <OnboardingShell
      stageIndex={stageIndex}
      totalStages={totalStages}
      title="How would you like to build your profile?"
      subtitle="Start from a CV to save time, or add your experience manually. Both paths give you full control over what is recorded."
      busy={busy}
      error={error}
      footer={
        <SecondaryButton onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </SecondaryButton>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <SourceChoice
          icon={FileUp}
          title="Start from my CV"
          description={`Upload a PDF or Word document, up to ${maxMb}MB, then review every detail.`}
          onClick={onUploadPath}
          disabled={busy}
          featured
        />
        <SourceChoice
          icon={PencilLine}
          title="Build manually"
          description="Add your career direction and supporting experience step by step."
          onClick={onManualPath}
          disabled={busy}
        />
      </div>

      <div className="mt-5">
        <TrustNote>
          <p className="font-semibold text-slate-800">Your CV stays private.</p>
          <p className="mt-0.5">
            {retentionDays === null
              ? 'The original is kept until you delete it.'
              : `The original is kept for ${retentionDays} days on your current plan.`}{' '}
            Nothing read from it joins your Career Profile until you have reviewed and confirmed it.
          </p>
        </TrustNote>
      </div>
    </OnboardingShell>
  );
}

function SourceChoice({
  icon: Icon,
  title,
  description,
  onClick,
  disabled,
  featured = false,
}: {
  icon: typeof FileUp;
  title: string;
  description: string;
  onClick: () => void;
  disabled: boolean;
  featured?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.99 }}
      className={`group flex min-h-44 flex-col items-start rounded-2xl border p-5 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        featured
          ? 'border-accent-cyan/50 bg-sky-50/50 shadow-[0_12px_34px_rgba(2,132,199,0.08)] hover:border-accent-cyan'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${featured ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
        <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="mt-5 flex w-full items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-950">{title}</span>
        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
      <span className="mt-1.5 text-xs leading-5 text-slate-600">{description}</span>
    </motion.button>
  );
}
