'use client';

import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import type {
  ApprovedProfileEvidence,
  ProfileEvidenceRequirement,
  ProfileEvidenceSuggestion,
} from '@/shared/types/profile-reasoning';
import { requirementEvidencePairKey } from '@/shared/types/profile-reasoning';

interface Props {
  loading: boolean;
  suggestions: ProfileEvidenceSuggestion[];
  requirements: ProfileEvidenceRequirement[];
  approved: ApprovedProfileEvidence[];
  onToggle: (suggestion: ProfileEvidenceSuggestion) => void;
  profileLabel: string;
  error: string | null;
  onCapture?: (requirement: ProfileEvidenceRequirement) => void;
}

const STATUS_LABELS: Record<ProfileEvidenceRequirement['status'], string> = {
  met: 'Already evidenced',
  partial: 'Partly evidenced',
  not_met: 'Not evidenced',
  contradicted: 'Conflicting evidence',
  unclear: 'Evidence unclear',
};

export default function ProfileBridgeStep({
  loading,
  suggestions,
  requirements,
  approved,
  onToggle,
  profileLabel,
  error,
  onCapture,
}: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <Loader2 className="mb-3 h-6 w-6 animate-spin" />
        <p className="text-sm font-medium">Checking your saved profile evidence…</p>
        <p className="mt-1 text-xs text-slate-400">
          Looking for stored evidence that supports this job&apos;s exact requirements.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-800">Couldn&apos;t compare your profile</p>
        <p className="mt-1 text-xs text-amber-700">{error}</p>
        <p className="mt-2 text-xs text-amber-700">
          You can carry on — your CV will still be rebuilt from the original analysis.
        </p>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Check size={20} strokeWidth={2.5} />
        </span>
        <p className="text-sm font-semibold text-slate-800">No additional stored evidence found</p>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-500">
          Nothing in your <span className="font-medium">{profileLabel}</span> profile clearly
          supports the partial or unmet requirements in this analysis.
        </p>
      </div>
    );
  }

  const requirementsById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const approvedKeys = new Set(
    approved.map((approval) =>
      requirementEvidencePairKey(approval.requirementId, approval.evidenceRef)
    )
  );

  // Requirements the analysis flagged as gaps for which nothing in the profile
  // qualifies. Named explicitly so the user understands Align will not invent
  // them rather than silently leaving them out.
  const suggestedRequirementIds = new Set(suggestions.map((suggestion) => suggestion.requirementId));
  const unsupportedRequirements = requirements.filter(
    (requirement) => !suggestedRequirementIds.has(requirement.id)
  );

  return (
    <div>
      <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-accent-purple/20 bg-purple-50/50 p-3.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-purple" />
        <p className="text-xs leading-relaxed text-slate-600">
          Align found saved evidence that may support this job. Review each link and choose whether
          to use it. Confidence is guidance only; nothing is selected automatically.
        </p>
      </div>

      <div className="space-y-4">
        {suggestions.map((suggestion) => {
          const requirement = requirementsById.get(suggestion.requirementId);
          if (!requirement) return null;

          const key = requirementEvidencePairKey(
            suggestion.requirementId,
            suggestion.evidenceRef
          );
          const isApproved = approvedKeys.has(key);

          return (
            <article
              key={key}
              className={cn(
                'rounded-xl border p-4 transition-colors',
                isApproved
                  ? 'border-accent-purple bg-purple-50/30'
                  : 'border-slate-200 bg-white'
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  {requirement.importance === 'mandatory' ? 'Essential requirement' : 'Desirable requirement'}
                </span>
                <span className="text-[11px] font-medium text-amber-700">
                  {STATUS_LABELS[requirement.status]}
                </span>
              </div>

              <h3 className="mt-2 text-sm font-semibold text-slate-900">{requirement.text}</h3>

              <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Found in your {profileLabel} profile
                </p>
                <blockquote className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-800">
                  “{suggestion.evidenceText}”
                </blockquote>
                <p className="mt-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-600">Source:</span>{' '}
                  {suggestion.evidenceLocation}
                </p>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-600">
                <span className="font-semibold">Why it may help:</span> {suggestion.rationale}
              </p>
              <p className="mt-1.5 text-[11px] text-slate-400">
                Suggested match confidence: {Math.round(suggestion.confidence * 100)}%
              </p>
              {onCapture && <button type="button" className="mt-2 text-xs font-semibold text-accent-purple" onClick={() => onCapture(requirement)}>I have different relevant evidence</button>}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!isApproved) onToggle(suggestion);
                  }}
                  aria-pressed={isApproved}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
                    isApproved
                      ? 'border-accent-purple bg-accent-purple text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-accent-purple'
                  )}
                >
                  <Check size={14} /> Use this evidence
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isApproved) onToggle(suggestion);
                  }}
                  aria-pressed={!isApproved}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
                    !isApproved
                      ? 'border-slate-400 bg-slate-100 text-slate-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  )}
                >
                  <X size={14} /> Do not use
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {unsupportedRequirements.length > 0 && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold text-slate-700">
            Some requirements can&apos;t be backed up
          </p>
          <ul className="mt-2 space-y-1.5">
            {unsupportedRequirements.map((requirement) => (
              <li key={requirement.id} className="text-xs leading-relaxed text-slate-500">
                <span className="font-medium text-slate-700">{requirement.text}</span> — this
                requirement is not supported by your CV or approved profile evidence, so Align will
                not add it.
              </li>
            ))}
          </ul>
        </div>
      )}

      {onCapture && requirements.length > 0 && (
        <div className="mt-5 rounded-xl border border-purple-200 bg-purple-50/40 p-4">
          <p className="text-xs font-semibold text-slate-700">Have evidence we did not find?</p>
          <div className="mt-2 flex flex-wrap gap-2">{requirements.map((requirement) => <button key={requirement.id} type="button" className="rounded border border-purple-200 bg-white px-2 py-1 text-xs text-accent-purple" onClick={() => onCapture(requirement)}>I have relevant evidence: {requirement.text}</button>)}</div>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
        Approved evidence is rechecked against your saved profile when you generate the CV. The
        original match score and requirement status stay unchanged.
      </p>
    </div>
  );
}
