'use client';

import { useRef, useState } from 'react';
import { ArrowLeft, FileText, Trash2, UploadCloud } from 'lucide-react';
import type { CapabilityDecision } from '@/shared/entitlements/registry';
import { OnboardingShell, PrimaryButton, SecondaryButton } from './OnboardingShell';
import { onboardingApi, OnboardingRequestError, type StoredCvSummary } from '../api';

/**
 * Upload a CV, or pick one already stored.
 *
 * Three cases this screen exists to handle honestly:
 *
 *   - the SAME file again. Detected by checksum, not filename, so a rename does
 *     not create a second copy. The user is told and offered the existing one;
 *   - the stored-CV allowance being full. Nothing is uploaded, the stage is
 *     kept, and the user can remove an older CV, upgrade, or carry on manually —
 *     a full allowance must not end the journey;
 *   - a rejected file. The reason comes from a stable code, so "that is a scan,
 *     not a text document" reads differently from "that file is damaged".
 */
export function UploadStep({
  stageIndex,
  totalStages,
  initialStoredCvs,
  initialCapacity,
  maxBytes,
  onUploaded,
  onManualPath,
  onBack,
  onUpgrade,
}: {
  stageIndex: number;
  totalStages: number;
  /** Rendered server-side on first paint, then kept fresh after each mutation. */
  initialStoredCvs: StoredCvSummary[];
  initialCapacity: CapabilityDecision;
  maxBytes: number;
  onUploaded: (storedCvId: string, wasDuplicate: boolean) => void;
  onManualPath: () => void;
  onBack: () => void;
  onUpgrade: () => void;
}) {
  const [storedCvs, setStoredCvs] = useState(initialStoredCvs);
  const [capacity, setCapacity] = useState<CapabilityDecision>(initialCapacity);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<StoredCvSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Only ever called after a mutation this component performed, so the list and
  // the allowance shown next to it reflect what just happened. There is no
  // fetch-on-mount: the server already sent both with the page.
  const refresh = async () => {
    try {
      const result = await onboardingApi.storedCvs();
      setStoredCvs(result.storedCvs);
      setCapacity(result.capacity);
    } catch {
      // A failed refresh is not worth blocking on; the server enforces the limit
      // regardless of what this screen managed to show.
    }
  };

  async function handleFile(file: File) {
    setError(null);
    setDuplicateOf(null);
    setBusy(true);
    setBusyLabel('Uploading securely…');
    try {
      const result = await onboardingApi.upload(file);
      if (result.duplicate) {
        // Not an error, and not silently ignored either: the user gets to decide
        // what to do with a CV they have already uploaded.
        setDuplicateOf(result.storedCv);
        return;
      }
      onUploaded(result.storedCv.id, false);
    } catch (uploadError) {
      setError(
        uploadError instanceof OnboardingRequestError
          ? uploadError.message
          : 'We could not upload that file. Please try again.'
      );
      await refresh();
    } finally {
      setBusy(false);
      setBusyLabel(undefined);
      // Clearing the input lets the same file be retried after a failure.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function removeStoredCv(storedCvId: string) {
    setBusy(true);
    setBusyLabel('Removing…');
    try {
      await onboardingApi.deleteStoredCv(storedCvId);
      await refresh();
    } catch {
      setError('We could not remove that CV. Please try again.');
    } finally {
      setBusy(false);
      setBusyLabel(undefined);
    }
  }

  const atLimit = !capacity.allowed;
  const maxMb = Math.round(maxBytes / (1024 * 1024));

  return (
    <OnboardingShell
      stageIndex={stageIndex}
      totalStages={totalStages}
      title="Upload your CV"
      subtitle={`PDF or Word (.docx), up to ${maxMb}MB. You will review everything we read from it before it is saved.`}
      busy={busy}
      busyLabel={busyLabel}
      error={error}
      footer={
        <>
          <SecondaryButton onClick={onBack} disabled={busy}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back
          </SecondaryButton>
          <SecondaryButton onClick={onManualPath} disabled={busy}>
            Enter details manually instead
          </SecondaryButton>
        </>
      }
    >
      {duplicateOf ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">You have already uploaded this CV</h2>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            This is the same file as <span className="font-medium">{duplicateOf.originalFilename}</span>,
            uploaded on {new Date(duplicateOf.createdAt).toLocaleDateString('en-GB')}. We have not stored a
            second copy.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <PrimaryButton onClick={() => onUploaded(duplicateOf.id, true)} disabled={busy}>
              Continue with this CV
            </PrimaryButton>
            <SecondaryButton onClick={() => setDuplicateOf(null)} disabled={busy}>
              Upload a different file
            </SecondaryButton>
          </div>
        </div>
      ) : atLimit ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            You have reached your stored CV limit
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            {/* Straight from the server's decision — no plan numbers live here. */}
            Your plan stores {capacity.limit} CV{capacity.limit === 1 ? '' : 's'} and you are using{' '}
            {capacity.used}. Remove one below to upload another, or continue without uploading.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {capacity.upgradeTarget && (
              <PrimaryButton onClick={onUpgrade} disabled={busy}>
                See what {capacity.upgradeTarget} includes
              </PrimaryButton>
            )}
            <SecondaryButton onClick={onManualPath} disabled={busy}>
              Continue without uploading
            </SecondaryButton>
          </div>
        </div>
      ) : (
        <div>
          <label
            htmlFor="onboarding-cv-file"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 px-4 py-10 text-center transition-colors hover:border-accent-cyan focus-within:border-accent-cyan focus-within:ring-2 focus-within:ring-accent-cyan/20"
          >
            <UploadCloud className="h-6 w-6 text-neutral-400" aria-hidden="true" />
            <span className="text-sm font-semibold text-neutral-800">Choose a file to upload</span>
            <span className="text-xs text-neutral-500">PDF or Word (.docx), up to {maxMb}MB</span>
            <input
              ref={inputRef}
              id="onboarding-cv-file"
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
              // Visually hidden rather than display:none, so it stays focusable
              // and reachable by keyboard through its label.
              className="sr-only"
            />
          </label>
        </div>
      )}

      {storedCvs.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs font-semibold text-neutral-600">Your stored CVs</h2>
          <ul className="mt-2 space-y-2">
            {storedCvs.map((storedCv) => (
              <li
                key={storedCv.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-neutral-800">
                      {storedCv.originalFilename}
                    </span>
                    <span className="block text-[11px] text-neutral-400">
                      {new Date(storedCv.createdAt).toLocaleDateString('en-GB')}
                      {!storedCv.objectAvailable && ' · original no longer available'}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onUploaded(storedCv.id, true)}
                    disabled={busy || !storedCv.objectAvailable}
                    className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-accent-cyan transition-colors hover:bg-accent-cyan/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/40 disabled:opacity-40"
                  >
                    Use this
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeStoredCv(storedCv.id)}
                    disabled={busy}
                    aria-label={`Remove ${storedCv.originalFilename}`}
                    className="rounded-full p-1.5 text-rose-600 transition-colors hover:bg-rose-100 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {capacity.limit !== undefined && (
            <p className="mt-2 text-[11px] text-neutral-400">
              {capacity.used} of {capacity.limit} stored CVs used on your plan.
            </p>
          )}
        </div>
      )}
    </OnboardingShell>
  );
}
