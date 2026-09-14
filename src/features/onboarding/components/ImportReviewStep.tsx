'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, ChevronDown, Copy, Plus, Sparkles, X } from 'lucide-react';
import type { CapabilityDecision } from '@/shared/entitlements/registry';
import { Label, TextField } from '@/features/dashboard/components/profile/Field';
import { OnboardingShell, PrimaryButton, SecondaryButton } from './OnboardingShell';
import { onboardingApi, OnboardingRequestError, type ImportCandidate, type ImportSession } from '../api';

/**
 * Reviewing what we read out of the CV, before any of it becomes profile data.
 *
 * Two things this screen is careful about:
 *
 *   - it does not make people approve twenty-four skills one at a time. Low-risk
 *     items are grouped and confirmed together; employment, education and
 *     credentials get an individual look because their dates and institutions
 *     are claims that matter;
 *   - it never resolves a conflict on the user's behalf. A missing employer or a
 *     contradictory institution is shown with what the CV actually said, and the
 *     user supplies the answer.
 */

const CONFLICT_COPY: Record<string, string> = {
  MISSING_REQUIRED_FIELD: 'Your CV did not state everything this record needs.',
  CONFLICTING_DATES: 'Your profile already has this role with different dates.',
  CONTRADICTORY_INSTITUTION: 'Your profile has this qualification against a different institution.',
  IDENTITY_MISMATCH: 'The name on this CV is different from the name on your account.',
  DUPLICATE_CURRENT_EMPLOYMENT: 'This employer already appears as a current role.',
  IMPOSSIBLE_DATE_ORDER: 'The end date on this record comes before its start date.',
  IDENTITY_VALUE_DIFFERS: 'Your profile already has a different value for this.',
  AMBIGUOUS_VALUE: 'We read this from your CV but could not be sure of the whole of it.',
  UNVERIFIED_LINK:
    'Your CV showed this as a name rather than a full web address, so we worked the address out from it. Please check it.',
  SUMMARY_ALREADY_SET: 'This Career Track already has a professional summary.',
};

/** Labels for the identity fields, matching the server's own. */
const IDENTITY_LABELS: Record<string, string> = {
  fullName: 'Name',
  email: 'Contact email',
  phone: 'Phone',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  website: 'Website',
};

/**
 * The fields the recovery block offers when the CV did not carry them.
 *
 * Name and contact email are omitted: both are already collected elsewhere in
 * onboarding, and a second place to type them is a second place for them to
 * disagree.
 */
const RECOVERABLE_FIELDS = [
  { field: 'linkedin' as const, label: 'LinkedIn', placeholder: 'linkedin.com/in/your-name' },
  { field: 'github' as const, label: 'GitHub', placeholder: 'github.com/your-username' },
  { field: 'website' as const, label: 'Website', placeholder: 'your-portfolio.com' },
  { field: 'phone' as const, label: 'Phone', placeholder: '+44 7700 900000' },
];

const IDENTITY_TYPES = new Set(['IDENTITY_UPDATE', 'PROFILE_SUMMARY_UPDATE']);

/** How an identity or summary proposal reads on its card. */
function identityValue(candidate: ImportCandidate): { label: string; value: string } {
  const data = candidate.structuredData as Record<string, unknown>;
  const text = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : '');

  if (candidate.entityType === 'PROFILE_SUMMARY_UPDATE') {
    return { label: 'Professional summary', value: text('professionalSummary') };
  }

  const field = text('field');
  if (field === 'phone') {
    // Shown as the two parts it is stored as, which is the whole correction:
    // a reader must be able to see that the dial code was understood.
    const dial = text('phoneDialCode');
    const number = text('phoneNumber');
    return {
      label: 'Phone',
      value: dial ? `${dial} ${number}` : number || text('rawValue'),
    };
  }
  return {
    label: IDENTITY_LABELS[field] ?? 'Contact detail',
    value: text(field) || text('rawValue'),
  };
}

/** The stack a project listed, which confirming it will add as skills. */
function projectTechnologies(candidate: ImportCandidate): string[] {
  const value = (candidate.structuredData as Record<string, unknown>).technologies;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** A project's links, for the review card. */
function projectLinks(candidate: ImportCandidate): { label: string; url: string }[] {
  const data = candidate.structuredData as Record<string, unknown>;
  const links: { label: string; url: string }[] = [];
  if (typeof data.repositoryUrl === 'string') links.push({ label: 'Repository', url: data.repositoryUrl });
  if (typeof data.liveUrl === 'string') links.push({ label: 'Live link', url: data.liveUrl });
  return links;
}

/** Which field a MISSING_REQUIRED_FIELD conflict is actually missing. */
const REQUIRED_FIELD_BY_TYPE: Partial<Record<string, { key: string; label: string; placeholder: string }[]>> = {
  EXPERIENCE: [
    { key: 'company', label: 'Employer', placeholder: 'e.g. Manchester Royal Infirmary' },
    { key: 'startDate', label: 'Start date (YYYY-MM)', placeholder: 'e.g. 2021-03' },
  ],
  EDUCATION: [{ key: 'university', label: 'Institution', placeholder: 'e.g. University of Salford' }],
  VOLUNTEERING: [{ key: 'organisation', label: 'Organisation', placeholder: 'e.g. Age UK' }],
  PROFESSIONAL_REGISTRATION: [
    { key: 'issuingBody', label: 'Registration body', placeholder: 'e.g. NMC' },
  ],
};

function candidateTitle(candidate: ImportCandidate): string {
  const data = candidate.structuredData as Record<string, unknown>;
  const text = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : '');
  switch (candidate.entityType) {
    case 'EXPERIENCE':
      return [text('jobTitle'), text('company')].filter(Boolean).join(' — ') || candidate.sourceExcerpt;
    case 'EDUCATION':
      return [text('degree'), text('university')].filter(Boolean).join(' — ') || candidate.sourceExcerpt;
    case 'SKILL':
      return text('name');
    case 'LANGUAGE':
      return [text('language'), text('proficiency')].filter(Boolean).join(' — ');
    case 'PROJECT':
      return text('name');
    case 'IDENTITY_UPDATE':
    case 'PROFILE_SUMMARY_UPDATE': {
      const { label, value } = identityValue(candidate);
      return `${label}: ${value}`;
    }
    case 'OTHER_EVIDENCE':
      return text('title');
    default:
      return [text('officialName') || text('course'), text('issuingBody') || text('provider')]
        .filter(Boolean)
        .join(' — ') || candidate.sourceExcerpt;
  }
}

export function ImportReviewStep({
  stageIndex,
  totalStages,
  session: initialSession,
  evidenceCapacity: initialCapacity,
  reconciliationOffered,
  onDone,
  onBack,
}: {
  stageIndex: number;
  totalStages: number;
  session: ImportSession;
  evidenceCapacity: CapabilityDecision;
  /** True only where the target profile already holds records to compare with. */
  reconciliationOffered: boolean;
  onDone: () => void;
  onBack: () => void;
}) {
  const [session, setSession] = useState(initialSession);
  const [capacity, setCapacity] = useState(initialCapacity);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [reconciled, setReconciled] = useState(false);

  const [addingField, setAddingField] = useState<string | null>(null);
  const [addValue, setAddValue] = useState('');

  /**
   * Identity and the professional summary are handled in their own group and are
   * deliberately kept out of the general lists and out of "add all safe items":
   * each one OVERWRITES something shared rather than adding a record beside it,
   * so each gets its own decision.
   */
  const personal = useMemo(
    () =>
      session.candidates.filter(
        (candidate) =>
          IDENTITY_TYPES.has(candidate.entityType) &&
          candidate.reviewStatus !== 'REJECTED' &&
          candidate.reviewStatus !== 'CONFIRMED'
      ),
    [session]
  );
  const outstanding = useMemo(
    () =>
      session.candidates.filter(
        (candidate) => candidate.reviewStatus === 'PROPOSED' && !IDENTITY_TYPES.has(candidate.entityType)
      ),
    [session]
  );
  const conflicts = useMemo(
    () =>
      session.candidates.filter(
        (candidate) => candidate.reviewStatus === 'CONFLICT' && !IDENTITY_TYPES.has(candidate.entityType)
      ),
    [session]
  );
  /** Fields nothing was detected for, so the user can supply them here. */
  const missingFields = useMemo(() => {
    const present = new Set(
      session.candidates
        .filter((candidate) => candidate.entityType === 'IDENTITY_UPDATE')
        .map((candidate) => (candidate.structuredData as { field?: string }).field)
    );
    return RECOVERABLE_FIELDS.filter((entry) => !present.has(entry.field));
  }, [session]);
  const hasSummary = useMemo(
    () => session.candidates.some((candidate) => candidate.entityType === 'PROFILE_SUMMARY_UPDATE'),
    [session]
  );
  const duplicates = useMemo(
    () => session.candidates.filter((candidate) => candidate.reviewStatus === 'DUPLICATE'),
    [session]
  );
  const evidenceProposals = useMemo(
    () =>
      session.candidates.filter(
        (candidate) => candidate.entityType === 'OTHER_EVIDENCE' && candidate.reviewStatus === 'PROPOSED'
      ),
    [session]
  );

  async function apply(
    decisions: { candidateId: string; action: 'confirm' | 'reject'; edited?: unknown }[],
    label: string
  ) {
    if (decisions.length === 0) return;
    setBusy(true);
    setBusyLabel(label);
    setError(null);
    setNotice(null);
    try {
      const result = await onboardingApi.confirmImport(session.id, decisions);
      setSession(result.session);
      setCapacity(result.evidenceCapacity);
      if (result.failed > 0) {
        // One item failing no longer takes the batch with it, so say exactly
        // what landed and what did not rather than showing a blanket error over
        // records that were in fact saved.
        setError(
          `${result.failed} item${result.failed === 1 ? '' : 's'} could not be saved and ${result.failed === 1 ? 'is' : 'are'} still listed below. ${result.imported} other detail${result.imported === 1 ? '' : 's'} ${result.imported === 1 ? 'was' : 'were'} added.`
        );
      }
      if (result.pendingCapacity > 0) {
        // Not a failure. Everything uncapped went in; the reusable-evidence
        // items that did not fit are still here and still importable later.
        setNotice(
          `${result.imported} detail${result.imported === 1 ? '' : 's'} added. ${result.pendingCapacity} reusable evidence item${result.pendingCapacity === 1 ? '' : 's'} could not be added because your plan's reusable evidence allowance is full — they are still here whenever you free up space.`
        );
      } else if (result.imported > 0) {
        setNotice(`${result.imported} detail${result.imported === 1 ? '' : 's'} added to your Career Profile.`);
      }
    } catch (applyError) {
      setError(
        applyError instanceof OnboardingRequestError
          ? applyError.message
          : 'We could not save those details. Please try again.'
      );
    } finally {
      setBusy(false);
      setBusyLabel(undefined);
    }
  }

  async function runReconciliation() {
    setBusy(true);
    setBusyLabel('Comparing with your Career Profile…');
    setError(null);
    try {
      const result = await onboardingApi.reconcileImport(session.id, crypto.randomUUID());
      setReconciled(true);
      if (result.status === 'unavailable') {
        // The documented fallback: proposals stay reviewable and the import
        // continues by hand. First value is never blocked on this.
        setNotice(
          'We extracted your CV details. Automatic profile comparison is unavailable on your current plan, but you can review and import them manually.'
        );
        return;
      }
      if (result.status === 'skipped_empty_profile') {
        setNotice('There is nothing in this profile yet to compare against — everything here is new.');
        return;
      }
      const refreshed = await onboardingApi.openImport({
        storedCvId: session.storedCvId,
        extractionId: session.extractionId,
        profileId: session.profileId,
      });
      setSession(refreshed.session);
      setNotice(
        `Comparison done: ${result.summary.duplicates} already in your profile, ${result.summary.updates} newer than what you have, ${result.summary.fresh} new.`
      );
    } catch (reconcileError) {
      setError(
        reconcileError instanceof OnboardingRequestError
          ? reconcileError.message
          : 'We could not compare this CV with your profile. You can still review the details below.'
      );
    } finally {
      setBusy(false);
      setBusyLabel(undefined);
    }
  }

  async function addDetail(field: (typeof RECOVERABLE_FIELDS)[number]['field']) {
    const value = addValue.trim();
    if (!value) return;
    setBusy(true);
    setBusyLabel('Adding that detail…');
    setError(null);
    try {
      const result = await onboardingApi.addIdentityDetail(session.id, field, value);
      setSession(result.session);
      setAddingField(null);
      setAddValue('');
      // Added as a PROPOSAL, not saved. Saying so keeps the one rule this screen
      // rests on visible: nothing is in the profile until it is confirmed.
      setNotice('Added below for you to confirm.');
    } catch (addError) {
      setError(
        addError instanceof OnboardingRequestError
          ? addError.message
          : 'We could not add that detail. Please try again.'
      );
    } finally {
      setBusy(false);
      setBusyLabel(undefined);
    }
  }

  function editValue(candidateId: string, key: string): string {
    return edits[candidateId]?.[key] ?? '';
  }

  function setEdit(candidateId: string, key: string, value: string) {
    setEdits((current) => ({ ...current, [candidateId]: { ...current[candidateId], [key]: value } }));
  }

  function confirmWithEdits(candidate: ImportCandidate) {
    const patch = edits[candidate.id] ?? {};
    const edited = { ...(candidate.structuredData as Record<string, unknown>) };
    for (const [key, value] of Object.entries(patch)) {
      if (value.trim()) edited[key] = value.trim();
    }
    void apply([{ candidateId: candidate.id, action: 'confirm', edited }], 'Saving confirmed details…');
  }

  const nothingLeft = outstanding.length === 0 && conflicts.length === 0 && personal.length === 0;

  return (
    <OnboardingShell
      stageIndex={stageIndex}
      totalStages={totalStages}
      title="Review what we found"
      subtitle="Nothing here is part of your Career Profile until you confirm it."
      busy={busy}
      busyLabel={busyLabel}
      error={error}
      footer={
        <>
          <SecondaryButton onClick={onBack} disabled={busy}>
            Back
          </SecondaryButton>
          <PrimaryButton onClick={onDone} disabled={busy}>
            {nothingLeft ? 'Continue' : 'Continue without the rest'}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </PrimaryButton>
        </>
      }
    >
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
        >
          {notice}
        </p>
      )}

      {/* The compact summary: counts first, detail on demand. */}
      <ul className="mb-5 space-y-1 text-sm text-neutral-700">
        {session.summary.map((group) => (
          <li key={group.entityType} className="flex items-baseline gap-2">
            <span className="font-semibold text-neutral-900">
              {group.proposed + group.duplicate + group.conflict + group.confirmed}
            </span>
            <span>{group.label} found</span>
            {group.confirmed > 0 && (
              <span className="text-xs text-emerald-600">· {group.confirmed} added</span>
            )}
            {group.conflict > 0 && (
              <span className="text-xs text-amber-600">· {group.conflict} need a decision</span>
            )}
            {group.duplicate > 0 && (
              <span className="text-xs text-neutral-400">· {group.duplicate} already in your profile</span>
            )}
          </li>
        ))}
      </ul>

      {reconciliationOffered && !reconciled && (
        <div className="mb-5 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-xs leading-relaxed text-neutral-600">
            This profile already has records in it. We can compare them with this CV to spot what is already
            there and what is newer.
          </p>
          <SecondaryButton onClick={runReconciliation} disabled={busy} className="mt-2">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Compare with my Career Profile
          </SecondaryButton>
        </div>
      )}

      {outstanding.length > 0 && (
        <div className="mb-5 flex flex-col gap-2 rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-neutral-700">
            {outstanding.length} detail{outstanding.length === 1 ? '' : 's'} ready to add.
          </p>
          <PrimaryButton
            onClick={() =>
              apply(
                outstanding.map((candidate) => ({ candidateId: candidate.id, action: 'confirm' as const })),
                'Saving confirmed details…'
              )
            }
            disabled={busy}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Add all safe items
          </PrimaryButton>
        </div>
      )}

      {/*
        Personal details get their own group and their own per-item decision.
        Everything here writes over a value the user may already have — a phone
        number, a LinkedIn URL, the paragraph at the top of their CV — so none of
        it is swept up by "add all safe items", and each card shows what the CV
        actually said underneath the value it would store.
      */}
      <section className="mb-5" aria-labelledby="import-personal-heading">
        <h2 id="import-personal-heading" className="mb-2 text-xs font-semibold text-neutral-700">
          Personal and professional details
        </h2>

        {personal.length === 0 && missingFields.length === RECOVERABLE_FIELDS.length && (
          <p className="mb-2 text-[11px] text-neutral-500">
            We did not find any contact details in this CV.
          </p>
        )}

        <ul className="space-y-2">
          {personal.map((candidate) => {
            const { label, value } = identityValue(candidate);
            const isConflict = candidate.reviewStatus === 'CONFLICT';
            const isDuplicate = candidate.reviewStatus === 'DUPLICATE';
            const needsDialCode =
              candidate.conflictCode === 'AMBIGUOUS_VALUE' &&
              (candidate.structuredData as { field?: string }).field === 'phone';
            const summaryEdit = candidate.entityType === 'PROFILE_SUMMARY_UPDATE';
            return (
              <li
                key={candidate.id}
                className={`rounded-xl border p-3 ${
                  isConflict ? 'border-amber-200 bg-amber-50' : 'border-neutral-200 bg-white'
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
                <p className="mt-0.5 wrap-break-word text-xs font-medium text-neutral-900">{value}</p>

                {isConflict && (
                  <p className="mt-1 text-[11px] text-amber-800">
                    {CONFLICT_COPY[candidate.conflictCode ?? ''] ?? 'This detail needs your decision.'}
                  </p>
                )}
                {isDuplicate && (
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Already what your profile says — confirming changes nothing.
                  </p>
                )}
                <p className="mt-1 text-[11px] italic text-neutral-500">“{candidate.sourceExcerpt}”</p>

                {needsDialCode && (
                  <div className="mt-3">
                    <Label htmlFor={`${candidate.id}-phoneDialCode`}>Country dialling code</Label>
                    <TextField
                      id={`${candidate.id}-phoneDialCode`}
                      value={editValue(candidate.id, 'phoneDialCode')}
                      onChange={(event) => setEdit(candidate.id, 'phoneDialCode', event.target.value)}
                      placeholder="e.g. +44"
                    />
                  </div>
                )}

                {/*
                  A derived address is the one case where the value on the card
                  is ours rather than the document's, so the correction field is
                  offered up front instead of behind an "edit" affordance.
                */}
                {candidate.conflictCode === 'UNVERIFIED_LINK' && (
                  <div className="mt-3">
                    <Label htmlFor={`${candidate.id}-url`}>Correct the address</Label>
                    <TextField
                      id={`${candidate.id}-url`}
                      value={editValue(
                        candidate.id,
                        String((candidate.structuredData as { field?: string }).field ?? '')
                      )}
                      onChange={(event) =>
                        setEdit(
                          candidate.id,
                          String((candidate.structuredData as { field?: string }).field ?? ''),
                          event.target.value
                        )
                      }
                      placeholder={value}
                    />
                  </div>
                )}

                {summaryEdit && (
                  <div className="mt-3">
                    <Label htmlFor={`${candidate.id}-professionalSummary`}>Edit before saving</Label>
                    <TextField
                      id={`${candidate.id}-professionalSummary`}
                      value={editValue(candidate.id, 'professionalSummary')}
                      onChange={(event) => setEdit(candidate.id, 'professionalSummary', event.target.value)}
                      placeholder="Leave blank to use the text above"
                    />
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => confirmWithEdits(candidate)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" aria-hidden="true" />
                    {isConflict ? 'Use the CV value' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => apply([{ candidateId: candidate.id, action: 'reject' }], 'Updating…')}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:opacity-50"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                    Ignore
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {!hasSummary && (
          <p className="mt-2 text-[11px] text-neutral-500">
            No professional summary detected — you can write one on your Career Profile at any time.
          </p>
        )}

        {/*
          Missing details are recoverable here rather than by starting again.
          What is added is still a proposal: it appears in the list above and
          needs confirming, exactly like something read from the document.
        */}
        {missingFields.length > 0 && (
          <div className="mt-3 rounded-xl border border-dashed border-neutral-300 p-3">
            {addingField === null ? (
              <>
                <p className="text-[11px] text-neutral-600">
                  Not found in this CV: {missingFields.map((entry) => entry.label).join(', ')}.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {missingFields.map((entry) => (
                    <button
                      key={entry.field}
                      type="button"
                      onClick={() => {
                        setAddingField(entry.field);
                        setAddValue('');
                      }}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-700 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" />
                      Add {entry.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div>
                <Label htmlFor="import-add-detail">
                  {RECOVERABLE_FIELDS.find((entry) => entry.field === addingField)?.label}
                </Label>
                <TextField
                  id="import-add-detail"
                  value={addValue}
                  onChange={(event) => setAddValue(event.target.value)}
                  placeholder={RECOVERABLE_FIELDS.find((entry) => entry.field === addingField)?.placeholder}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void addDetail(addingField as (typeof RECOVERABLE_FIELDS)[number]['field'])}
                    disabled={busy || !addValue.trim()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingField(null)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {conflicts.length > 0 && (
        <section className="mb-5" aria-labelledby="import-conflicts-heading">
          <h2 id="import-conflicts-heading" className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Needs your decision ({conflicts.length})
          </h2>
          <ul className="space-y-2">
            {conflicts.map((candidate) => {
              const fields = REQUIRED_FIELD_BY_TYPE[candidate.entityType] ?? [];
              const needsFields = candidate.conflictCode === 'MISSING_REQUIRED_FIELD' && fields.length > 0;
              return (
                <li key={candidate.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-neutral-900">{candidateTitle(candidate)}</p>
                  <p className="mt-1 text-[11px] text-amber-800">
                    {CONFLICT_COPY[candidate.conflictCode ?? ''] ?? 'This detail needs your decision.'}
                  </p>
                  <p className="mt-1 text-[11px] italic text-neutral-500">
                    From your CV: “{candidate.sourceExcerpt}”
                  </p>

                  {needsFields && (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {fields.map((field) => (
                        <div key={field.key}>
                          <Label htmlFor={`${candidate.id}-${field.key}`}>{field.label}</Label>
                          <TextField
                            id={`${candidate.id}-${field.key}`}
                            value={editValue(candidate.id, field.key)}
                            onChange={(event) => setEdit(candidate.id, field.key, event.target.value)}
                            placeholder={field.placeholder}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => confirmWithEdits(candidate)}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" aria-hidden="true" />
                      {needsFields ? 'Save with these details' : 'Add it anyway'}
                    </button>
                    <button
                      type="button"
                      onClick={() => apply([{ candidateId: candidate.id, action: 'reject' }], 'Updating…')}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:opacity-50"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                      Leave it out
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {outstanding.length > 0 && (
        <section aria-labelledby="import-detail-heading">
          <button
            type="button"
            id="import-detail-heading"
            onClick={() => setExpanded(expanded === 'all' ? null : 'all')}
            aria-expanded={expanded === 'all'}
            aria-controls="import-detail-list"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/40"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${expanded === 'all' ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
            Review each item individually
          </button>

          {expanded === 'all' && (
            <ul id="import-detail-list" className="mt-3 space-y-2">
              {outstanding.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-neutral-900">
                      {candidateTitle(candidate)}
                    </span>
                    {/*
                      A project's links are shown because they are the part most
                      easily lost, and a user confirming a project should be able
                      to see that its repository came across with it.
                    */}
                    {projectLinks(candidate).map((link) => (
                      <span key={link.url} className="mt-0.5 block wrap-break-word text-[11px] text-neutral-600">
                        {link.label}: {link.url}
                      </span>
                    ))}
                    {/*
                      The stack is shown because confirming this project also adds
                      these to the profile's skills — the user should see that
                      before it happens, not discover it afterwards.
                    */}
                    {projectTechnologies(candidate).length > 0 && (
                      <span className="mt-0.5 block text-[11px] text-neutral-600">
                        Skills: {projectTechnologies(candidate).join(', ')}
                      </span>
                    )}
                    <span className="mt-0.5 block text-[11px] italic text-neutral-400">
                      “{candidate.sourceExcerpt}”
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => apply([{ candidateId: candidate.id, action: 'confirm' }], 'Saving…')}
                      disabled={busy}
                      aria-label={`Add ${candidateTitle(candidate)}`}
                      className="rounded-full p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-40"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => apply([{ candidateId: candidate.id, action: 'reject' }], 'Updating…')}
                      disabled={busy}
                      aria-label={`Leave out ${candidateTitle(candidate)}`}
                      className="rounded-full p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {duplicates.length > 0 && (
        <p className="mt-4 flex items-start gap-2 text-[11px] text-neutral-500">
          <Copy className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {duplicates.length} item{duplicates.length === 1 ? ' is' : 's are'} already in this Career Profile,
          so {duplicates.length === 1 ? 'it has' : 'they have'} been left out to avoid duplicates.
        </p>
      )}

      {/*
        Reusable evidence is the ONE imported type with a commercial allowance,
        and the number comes from the server's live decision — never a constant.
        Ordinary profile records carry no such message because they have no such
        limit.
      */}
      {evidenceProposals.length > 0 && capacity.limit !== undefined && (
        <p className="mt-3 text-[11px] text-neutral-500">
          {evidenceProposals.length} of these are reusable evidence items. You have used {capacity.used} of{' '}
          {capacity.limit} on your plan.
        </p>
      )}
    </OnboardingShell>
  );
}
