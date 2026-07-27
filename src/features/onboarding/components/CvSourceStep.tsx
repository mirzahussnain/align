'use client';

import { ArrowLeft, ArrowRight, FileUp, Lock, PencilLine } from 'lucide-react';
import { OnboardingShell, PrimaryButton, SecondaryButton } from './OnboardingShell';

/**
 * How the user wants to get their CV in.
 *
 * The storage claims here are checked against what the pipeline actually does:
 * the file goes to a private bucket, it is reachable only through a short-lived
 * signed link, and it is kept for the retention window the user's plan sets —
 * which is why this screen says "for as long as your plan's retention window"
 * rather than "forever". Malware scanning is not mentioned, because none runs.
 */
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
  /** From the server's retention configuration, never a hard-coded number. */
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
      title="Do you have a CV to start from?"
      subtitle="Uploading one saves you typing everything in. You will review every detail before it becomes part of your profile."
      busy={busy}
      error={error}
      footer={
        <>
          <SecondaryButton onClick={onBack} disabled={busy}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back
          </SecondaryButton>
          <PrimaryButton onClick={onUploadPath} disabled={busy}>
            <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
            Upload my CV
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </PrimaryButton>
        </>
      }
    >
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <h2 className="flex items-center gap-2 text-xs font-semibold text-neutral-700">
          <Lock className="h-3.5 w-3.5 text-neutral-400" aria-hidden="true" />
          What happens to your file
        </h2>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-neutral-500">
          <li>Accepted formats: PDF and Word (.docx), up to {maxMb}MB.</li>
          <li>Your original file is stored privately and is only ever reachable through a short-lived link for you.</li>
          <li>
            {retentionDays === null
              ? 'Your original file is kept until you delete it.'
              : `Your original file is kept for ${retentionDays} days on your current plan, then removed. Details you confirm into your profile are kept.`}
          </li>
          <li>Nothing we read from it becomes part of your profile until you have reviewed and confirmed it.</li>
        </ul>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={onManualPath}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-xs font-semibold text-accent-purple transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/40 disabled:opacity-50"
        >
          <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
          I would rather enter my details manually
        </button>
      </div>
    </OnboardingShell>
  );
}
