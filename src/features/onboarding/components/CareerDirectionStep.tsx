'use client';

import { useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import { Label, TextField, FieldHint } from '@/features/dashboard/components/profile/Field';
import { OnboardingShell, PrimaryButton, SecondaryButton } from './OnboardingShell';
import { saveCareerDirection } from '../actions';

/**
 * What this Career Profile is for.
 *
 * Two required fields and nothing else. A name, because a CV needs one, and a
 * target role, because a career track with no direction cannot be scored,
 * matched or rewritten against anything.
 *
 * The target role stays free text. Users describe themselves as "Warehouse
 * Administrator" or "Band 5 Staff Nurse", and forcing them to pick an internal
 * occupation code from a list makes them answer a question about our data model.
 * The optional advanced fields exist for people who want the extra precision;
 * anything inferred is offered there for confirmation, never written silently.
 */
export function CareerDirectionStep({
  stageIndex,
  totalStages,
  profileId,
  initial,
  occupationOptions,
  seniorityOptions,
  onSaved,
  onBack,
}: {
  stageIndex: number;
  totalStages: number;
  profileId: string;
  initial: {
    fullName: string;
    targetRoleTitle: string;
    label: string;
    targetOccupation: string;
    targetSeniority: string;
    tagline: string;
    /** Suggested by the parser from the CV, for the user to accept or change. */
    suggestedRoleFromCv?: string;
  };
  occupationOptions: { value: string; label: string }[];
  seniorityOptions: { value: string; label: string }[];
  onSaved: () => void;
  onBack: () => void;
}) {
  const [form, setForm] = useState({
    fullName: initial.fullName,
    targetRoleTitle: initial.targetRoleTitle || initial.suggestedRoleFromCv || '',
    label: initial.label,
    targetOccupation: initial.targetOccupation,
    targetSeniority: initial.targetSeniority,
    tagline: initial.tagline,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveCareerDirection({ profileId, ...form });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <OnboardingShell
      stageIndex={stageIndex}
      totalStages={totalStages}
      title="What are you aiming for?"
      subtitle="This shapes how your CV is scored and what a tailored CV emphasises."
      busy={pending}
      busyLabel={pending ? 'Saving…' : undefined}
      error={error}
      footer={
        <>
          <SecondaryButton onClick={onBack} disabled={pending}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back
          </SecondaryButton>
          <PrimaryButton onClick={submit} disabled={pending}>
            Continue
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="onboarding-full-name" required>
            Your name
          </Label>
          <TextField
            id="onboarding-full-name"
            value={form.fullName}
            onChange={(event) => set('fullName', event.target.value)}
            placeholder="Ada Lovelace"
            autoComplete="name"
            aria-describedby="onboarding-full-name-hint"
          />
          <FieldHint id="onboarding-full-name-hint">
            Shared across all your Career Profiles — you only enter it once.
          </FieldHint>
        </div>

        <div>
          <Label htmlFor="onboarding-target-role" required>
            Target role
          </Label>
          <TextField
            id="onboarding-target-role"
            value={form.targetRoleTitle}
            onChange={(event) => set('targetRoleTitle', event.target.value)}
            placeholder="e.g. Warehouse Administrator"
            aria-describedby="onboarding-target-role-hint"
          />
          <FieldHint id="onboarding-target-role-hint">
            {initial.suggestedRoleFromCv
              ? 'Suggested from your CV — change it if you are aiming somewhere else.'
              : 'In your own words. You are not limited to a fixed list.'}
          </FieldHint>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="onboarding-profile-label" optional>
            Career Profile name
          </Label>
          <TextField
            id="onboarding-profile-label"
            value={form.label}
            onChange={(event) => set('label', event.target.value)}
            placeholder="Suggested from your target role"
            aria-describedby="onboarding-profile-label-hint"
          />
          <FieldHint id="onboarding-profile-label-hint">
            Left blank, we will name it from your target role.
          </FieldHint>
        </div>
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowAdvanced((open) => !open)}
          aria-expanded={showAdvanced}
          aria-controls="onboarding-advanced-direction"
          className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-semibold text-neutral-600 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-purple/40"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
          {showAdvanced ? 'Hide' : 'Add'} more detail (optional)
        </button>

        {showAdvanced && (
          <div id="onboarding-advanced-direction" className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="onboarding-occupation" optional>
                CV evaluation type
              </Label>
              <div className="relative">
                <select
                  id="onboarding-occupation"
                  value={form.targetOccupation}
                  onChange={(event) => set('targetOccupation', event.target.value)}
                  className="w-full appearance-none rounded-xl border border-neutral-300 bg-white px-4 py-2.5 pr-9 text-sm text-neutral-900 transition-colors focus:border-accent-purple focus:outline-none focus:ring-2 focus:ring-accent-purple/15"
                >
                  <option value="">Work it out from my CV</option>
                  {occupationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                  aria-hidden="true"
                />
              </div>
              <FieldHint>Leave this alone unless you want to override how your CV is judged.</FieldHint>
            </div>

            <div>
              <Label htmlFor="onboarding-seniority" optional>
                Seniority
              </Label>
              <div className="relative">
                <select
                  id="onboarding-seniority"
                  value={form.targetSeniority}
                  onChange={(event) => set('targetSeniority', event.target.value)}
                  className="w-full appearance-none rounded-xl border border-neutral-300 bg-white px-4 py-2.5 pr-9 text-sm text-neutral-900 transition-colors focus:border-accent-purple focus:outline-none focus:ring-2 focus:ring-accent-purple/15"
                >
                  <option value="">Not specified</option>
                  {seniorityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                  aria-hidden="true"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="onboarding-tagline" optional>
                Headline
              </Label>
              <TextField
                id="onboarding-tagline"
                value={form.tagline}
                onChange={(event) => set('tagline', event.target.value)}
                placeholder="e.g. Band 5 Staff Nurse with acute medical experience"
              />
            </div>
          </div>
        )}
      </div>
    </OnboardingShell>
  );
}
