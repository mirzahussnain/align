'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileSearch, RefreshCw } from 'lucide-react';
import { OnboardingShell, PrimaryButton, SecondaryButton } from './OnboardingShell';
import { onboardingApi, OnboardingRequestError } from '../api';

/**
 * Reading the uploaded CV.
 *
 * Extraction is deterministic and unmetered — no model is called — so it costs
 * the user nothing and can be retried freely. That matters: a failed read must
 * never look like a wasted quota unit, and a retry must never be something the
 * user hesitates over.
 *
 * A permanent failure (a scan, a damaged file) is a dead end for THIS file, not
 * for onboarding: the manual path stays one click away and the uploaded file is
 * kept, so nothing the user has already done is lost.
 */
export function ExtractionStep({
  stageIndex,
  totalStages,
  storedCvId,
  onExtracted,
  onManualPath,
}: {
  stageIndex: number;
  totalStages: number;
  storedCvId: string;
  onExtracted: (extractionId: string) => void;
  onManualPath: () => void;
}) {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  // Guards against React's development double-invoke and any stray re-render
  // starting a second extraction for the same file.
  const started = useRef(false);

  const run = useCallback(
    async (force: boolean) => {
      setBusy(true);
      setError(null);
      setErrorCode(null);
      try {
        const result = await onboardingApi.extract(storedCvId, force);
        onExtracted(result.extractionId);
      } catch (extractError) {
        if (extractError instanceof OnboardingRequestError) {
          setError(extractError.message);
          setErrorCode(extractError.code);
        } else {
          setError('We could not read your CV. You can try again, or enter your details manually.');
        }
      } finally {
        setBusy(false);
      }
    },
    [storedCvId, onExtracted]
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run(false);
  }, [run]);

  // A scan or a damaged file will not read differently on a second attempt.
  // Offering a retry there wastes the user's time and implies the fault is
  // transient when it is not.
  const retryable = errorCode !== 'EMPTY_TEXT' && errorCode !== 'CORRUPT_DOCUMENT';

  return (
    <OnboardingShell
      stageIndex={stageIndex}
      totalStages={totalStages}
      title={error ? 'We could not read that CV' : 'Reading your CV'}
      subtitle={
        error
          ? undefined
          : 'This takes a few seconds. Nothing is saved to your profile until you have reviewed it.'
      }
      busy={busy}
      busyLabel={busy ? 'Extracting CV text…' : undefined}
      error={error}
      footer={
        error ? (
          <>
            <SecondaryButton onClick={onManualPath} disabled={busy}>
              Enter details manually
            </SecondaryButton>
            {retryable && (
              <PrimaryButton onClick={() => void run(true)} disabled={busy}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Try again
              </PrimaryButton>
            )}
          </>
        ) : undefined
      }
    >
      {!error && (
        <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-6">
          <FileSearch className="h-5 w-5 shrink-0 animate-pulse text-accent-purple" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-neutral-600">
            Finding your experience, education, skills and qualifications. We only read what the document
            actually says — anything it does not state, we will ask you for.
          </p>
        </div>
      )}
      {error && (
        <p className="text-xs leading-relaxed text-neutral-600">
          Your uploaded file is still saved. You can try a different file, or build your Career Profile by
          entering the details yourself.
        </p>
      )}
    </OnboardingShell>
  );
}
