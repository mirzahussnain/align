'use client';

import { useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import { Label, TextField, FieldHint } from '@/features/dashboard/components/profile/Field';
import { VISA_STATUSES, visaRequiresExpiry } from '@/shared/constants/visa-status';
import { OnboardingShell, PrimaryButton, SecondaryButton } from './OnboardingShell';
import { saveEligibilityBasics } from '../actions';

/**
 * The eligibility facts an early result can actually use.
 *
 * Kept to a baseline, and skippable. Detailed clearance history, five-year
 * residency, driving licences, professional registration and occupation-specific
 * regulatory questions are all collected at the point a specific job needs them
 * — asking for them at sign-up turns a first run into a form nobody finishes,
 * and none of them change an ATS result.
 *
 * The one hard rule survives: a time-limited visa status without its expiry is
 * an incomplete fact, and the server rejects it rather than storing half of it.
 */
export function EligibilityStep({
  stageIndex,
  totalStages,
  initial,
  onSaved,
  onSkip,
  onBack,
}: {
  stageIndex: number;
  totalStages: number;
  initial: { country: string; city: string; visaStatus: string; visaExpiry: string };
  onSaved: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const needsExpiry = Boolean(form.visaStatus) && visaRequiresExpiry(form.visaStatus);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveEligibilityBasics(form);
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
      title="A couple of eligibility basics"
      subtitle="These help us judge whether a role is realistic for you. You can add them later instead."
      busy={pending}
      busyLabel={pending ? 'Saving…' : undefined}
      error={error}
      footer={
        <>
          <SecondaryButton onClick={onBack} disabled={pending}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back
          </SecondaryButton>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <SecondaryButton onClick={onSkip} disabled={pending}>
              Skip for now
            </SecondaryButton>
            <PrimaryButton onClick={submit} disabled={pending}>
              Save and continue
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </PrimaryButton>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="eligibility-country" optional>
            Country
          </Label>
          <TextField
            id="eligibility-country"
            value={form.country}
            onChange={(event) => set('country', event.target.value)}
            placeholder="e.g. United Kingdom"
            autoComplete="country-name"
          />
        </div>
        <div>
          <Label htmlFor="eligibility-city" optional>
            City or town
          </Label>
          <TextField
            id="eligibility-city"
            value={form.city}
            onChange={(event) => set('city', event.target.value)}
            placeholder="e.g. Manchester"
            autoComplete="address-level2"
          />
        </div>

        <div className={needsExpiry ? '' : 'sm:col-span-2'}>
          <Label htmlFor="eligibility-visa" optional>
            Right to work
          </Label>
          <div className="relative">
            <select
              id="eligibility-visa"
              value={form.visaStatus}
              onChange={(event) => set('visaStatus', event.target.value)}
              aria-describedby="eligibility-visa-hint"
              className="w-full appearance-none rounded-xl border border-neutral-300 bg-white px-4 py-2.5 pr-9 text-sm text-neutral-900 transition-colors focus:border-accent-purple focus:outline-none focus:ring-2 focus:ring-accent-purple/15"
            >
              <option value="">Prefer not to say yet</option>
              {VISA_STATUSES.map((option) => (
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
          <FieldHint id="eligibility-visa-hint">
            Used to tell you whether a role needs sponsorship you do not have.
          </FieldHint>
        </div>

        {needsExpiry && (
          <div>
            <Label htmlFor="eligibility-visa-expiry" required>
              Visa expiry
            </Label>
            <TextField
              id="eligibility-visa-expiry"
              type="date"
              value={form.visaExpiry}
              onChange={(event) => set('visaExpiry', event.target.value)}
              aria-describedby="eligibility-visa-expiry-hint"
            />
            <FieldHint id="eligibility-visa-expiry-hint">
              This status is time-limited, so the expiry date is needed with it.
            </FieldHint>
          </div>
        )}
      </div>
    </OnboardingShell>
  );
}
