'use client';

import { useId, useMemo, useState } from 'react';
import { AlertTriangle, Info, Sparkles, ArrowLeft } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type {
  DetectResponse,
  ProfileTargetOption,
  TargetChoice,
  TargetSelectionPayload,
} from '@/shared/types/target-detection';

/**
 * The ATS post-upload "What is this CV intended for?" step.
 *
 * It is a PURE controlled view over the deterministic {@link DetectResponse}: it
 * never calls AI or re-detects. It preselects the detected target ONLY when
 * detection is high-confidence and does not conflict with the active Profile;
 * otherwise it forces an explicit choice. On submit it hands the parent a
 * {@link TargetSelectionPayload} for /api/analyze, which re-resolves the choice
 * authoritatively — the active Profile is never auto-used.
 *
 * Accessibility: the options are native radios inside a labelled radiogroup, so
 * they are keyboard-operable and announced by screen readers out of the box;
 * notices and errors use aria-live regions and are linked to their controls.
 */
export interface TargetSelectionStepProps {
  detection: DetectResponse;
  onSubmit: (payload: TargetSelectionPayload) => void;
  onBack?: () => void;
  /** True while the parent's /api/analyze call is in flight — blocks re-submit. */
  isSubmitting?: boolean;
  /** A server-side validation / ownership / analysis error to surface safely. */
  error?: string | null;
}

/** Mirrors the server's TargetRole schema closely enough to catch input early. */
function validateCustomRole(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 2) return 'Enter the target role for this CV.';
  if (trimmed.length > 100) return 'Target role is too long (max 100 characters).';
  if (!/\p{L}/u.test(trimmed)) return 'Target role must contain letters.';
  if (/[\r\n\t]/.test(trimmed)) return 'Target role must be a single line.';
  return null;
}

const CONFIDENCE_LABEL: Record<DetectResponse['detected']['confidence'], string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

export default function TargetSelectionStep({
  detection,
  onSubmit,
  onBack,
  isSubmitting = false,
  error = null,
}: TargetSelectionStepProps) {
  const { detected, activeProfile, savedProfiles, mismatch } = detection;

  const headingId = useId();
  const customRoleId = useId();
  const customRoleErrorId = useId();
  const savedSelectId = useId();

  // A conflict between what the CV shows and what the active Profile targets.
  // While present the user MUST choose explicitly — nothing is preselected.
  const hasConflict = mismatch !== null;

  // "Other saved Profile targets" excludes the one already shown as the active
  // Profile, so the two options never overlap.
  const otherSavedProfiles = useMemo(
    () => savedProfiles.filter((p) => p.profileId !== activeProfile?.profileId),
    [savedProfiles, activeProfile]
  );

  // Preselect the detected target ONLY on high-confidence, non-conflicting
  // detection. Otherwise start with no selection so the user must confirm.
  const initialSelection: TargetChoice | '' =
    detected.confidence === 'high' && !hasConflict && detected.occupation !== 'generic'
      ? 'detected'
      : '';

  const [selection, setSelection] = useState<TargetChoice | ''>(initialSelection);
  const [customRole, setCustomRole] = useState('');
  const [savedProfileId, setSavedProfileId] = useState<string>(
    otherSavedProfiles[0]?.profileId ?? ''
  );
  const [customRoleTouched, setCustomRoleTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const customRoleError =
    selection === 'custom_role' && (customRoleTouched || submitAttempted)
      ? validateCustomRole(customRole)
      : null;

  // The occupation the current selection targets, for the regulated notice.
  const selectedOption: ProfileTargetOption | null =
    selection === 'active_profile'
      ? activeProfile
      : selection === 'saved_profile'
        ? otherSavedProfiles.find((p) => p.profileId === savedProfileId) ?? null
        : null;

  // A non-blocking notice: the user picked a regulated Profile target whose
  // profession the CV does not currently evidence (the detected occupation
  // differs). The analysis still runs against it and flags what is missing.
  const showRegulatedNotice =
    selectedOption?.regulated === true && selectedOption.occupation !== detected.occupation;

  function canSubmit(): boolean {
    if (isSubmitting || selection === '') return false;
    if (selection === 'custom_role') return validateCustomRole(customRole) === null;
    if (selection === 'saved_profile') return savedProfileId !== '';
    return true;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitAttempted(true);
    // Guard against duplicate submissions and invalid states.
    if (!canSubmit()) return;

    const payload: TargetSelectionPayload = { targetSelection: selection as TargetChoice };
    if (selection === 'custom_role') payload.targetRole = customRole.trim();
    if (selection === 'saved_profile') payload.savedProfileId = savedProfileId;
    onSubmit(payload);
  }

  function selectOption(value: TargetChoice) {
    setSelection(value);
  }

  const options: {
    value: TargetChoice;
    title: string;
    description: string;
    available: boolean;
  }[] = [
    {
      value: 'detected',
      title: `Use detected target — ${detected.label}`,
      description: `${CONFIDENCE_LABEL[detected.confidence]} from your CV's own content.`,
      available: detected.occupation !== 'generic',
    },
    {
      value: 'active_profile',
      title: activeProfile
        ? `Use active profile target — ${activeProfile.occupationLabel || activeProfile.label}`
        : 'Use active profile target',
      description: activeProfile
        ? `Analyse against your “${activeProfile.label}” track.`
        : 'No active profile target available.',
      available: activeProfile !== null,
    },
    {
      value: 'saved_profile',
      title: 'Choose another saved profile target',
      description: 'Analyse against a different career track you have saved.',
      available: otherSavedProfiles.length > 0,
    },
    {
      value: 'custom_role',
      title: 'Enter another target role',
      description: 'Type the role this CV is aimed at.',
      available: true,
    },
    {
      value: 'generic',
      title: 'General ATS review',
      description: 'A deliberately occupation-neutral readiness check.',
      available: true,
    },
  ];

  return (
    <section
      aria-labelledby={headingId}
      className="w-full mx-auto max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
    >
      <h2 id={headingId} className="text-xl font-bold text-slate-800 mb-1">
        What is this CV intended for?
      </h2>
      <p className="text-sm text-slate-500 mb-5">
        Choose the target so Align scores your CV against the right occupation.
      </p>

      {/* Deterministic detection summary. */}
      <dl className="grid gap-2 mb-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <dt className="font-semibold text-slate-700">Detected from CV:</dt>
          <dd className="text-slate-600">
            {detected.occupation === 'generic' ? 'No clear occupation detected' : detected.label}{' '}
            <span className="text-slate-400">({CONFIDENCE_LABEL[detected.confidence]})</span>
          </dd>
        </div>
        {activeProfile && (
          <div className="flex flex-wrap items-center gap-2">
            <dt className="font-semibold text-slate-700">Active profile target:</dt>
            <dd className="text-slate-600">{activeProfile.occupationLabel || activeProfile.label}</dd>
          </div>
        )}
      </dl>

      {/* Mismatch notice — non-blocking, announced to assistive tech. */}
      {mismatch && (
        <div
          role="status"
          className="flex items-start gap-2 mb-5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm"
        >
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>
            Your CV looks like <strong>{mismatch.detectedLabel}</strong>, but your active profile
            targets <strong>{mismatch.profileLabel}</strong>. Please choose which to analyse against.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <fieldset
          role="radiogroup"
          aria-labelledby={headingId}
          aria-required="true"
          className="flex flex-col gap-2.5 border-0 p-0 m-0"
        >
          <legend className="sr-only">Choose the target for this CV</legend>

          {options.map((option) => {
            const disabled = !option.available || isSubmitting;
            const checked = selection === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  'flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors',
                  checked
                    ? 'border-accent-cyan bg-sky-50/60'
                    : 'border-slate-200 hover:border-slate-300',
                  disabled && 'opacity-50 cursor-not-allowed hover:border-slate-200'
                )}
              >
                <input
                  type="radio"
                  name="targetSelection"
                  value={option.value}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => selectOption(option.value)}
                  className="mt-1 h-4 w-4 accent-accent-cyan"
                />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-800">{option.title}</span>
                  <span className="text-xs text-slate-500">{option.description}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {/* Saved-profile picker, revealed for that option. */}
        {selection === 'saved_profile' && otherSavedProfiles.length > 0 && (
          <div className="mt-3">
            <label htmlFor={savedSelectId} className="block text-xs font-semibold text-slate-700 mb-1">
              Saved profile target
            </label>
            <select
              id={savedSelectId}
              value={savedProfileId}
              disabled={isSubmitting}
              onChange={(e) => setSavedProfileId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-accent-cyan/50 focus:ring-2 focus:ring-accent-cyan/20"
            >
              {otherSavedProfiles.map((p) => (
                <option key={p.profileId} value={p.profileId}>
                  {p.label}
                  {p.occupationLabel ? ` — ${p.occupationLabel}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Custom role input, revealed for that option. */}
        {selection === 'custom_role' && (
          <div className="mt-3">
            <label htmlFor={customRoleId} className="block text-xs font-semibold text-slate-700 mb-1">
              Target role
            </label>
            <input
              id={customRoleId}
              type="text"
              value={customRole}
              disabled={isSubmitting}
              onChange={(e) => setCustomRole(e.target.value)}
              onBlur={() => setCustomRoleTouched(true)}
              placeholder="e.g. Warehouse Operative, Registered Nurse, Data Analyst"
              aria-invalid={customRoleError ? true : undefined}
              aria-describedby={customRoleError ? customRoleErrorId : undefined}
              className={cn(
                'w-full p-2.5 bg-slate-50 border rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2',
                customRoleError
                  ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-200'
                  : 'border-slate-200 focus:border-accent-cyan/50 focus:ring-accent-cyan/20'
              )}
            />
            {customRoleError && (
              <p id={customRoleErrorId} role="alert" className="mt-1 text-xs text-rose-600">
                {customRoleError}
              </p>
            )}
          </div>
        )}

        {/* Regulated-target notice — non-blocking. */}
        {showRegulatedNotice && (
          <div
            role="status"
            className="flex items-start gap-2 mt-4 p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-800 text-sm"
          >
            <Info size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>
              This CV does not currently show evidence confirming the selected regulated profession.
              Align will still analyse it for that target and highlight missing requirements.
            </span>
          </div>
        )}

        {/* Server error — announced. */}
        {error && (
          <div
            role="alert"
            className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium"
          >
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 mt-6">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
          )}
          <button
            type="submit"
            disabled={!canSubmit()}
            className={cn(
              'flex-1 py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-300',
              canSubmit()
                ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            )}
          >
            <Sparkles size={18} aria-hidden="true" />
            {isSubmitting ? 'Analyzing…' : 'Analyze CV'}
          </button>
        </div>
      </form>
    </section>
  );
}
