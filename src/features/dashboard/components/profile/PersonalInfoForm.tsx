'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check } from 'lucide-react';
import { Label, TextField, TextArea } from './Field';
import TargetRolePicker from './TargetRolePicker';
import LocationPicker from './LocationPicker';
import PhonePicker from './PhonePicker';
import VisaStatusPicker from './VisaStatusPicker';
import { savePersonalInfo, type PersonalInfoInput } from '@/features/dashboard/actions/profile-actions';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import { visaRequiresExpiry } from '@/shared/constants/visa-status';

/** Blocks a save that would persist inconsistent required location/visa data. */
function validate(form: PersonalInfoInput): string | null {
  if (form.country.trim() && !form.city.trim()) return 'Please pick a city for the selected country.';
  if (form.city.trim() && !form.country.trim()) return 'Please pick a country.';
  if (form.visaStatus && visaRequiresExpiry(form.visaStatus) && !form.visaExpiry.trim())
    return 'This visa status needs an expiry date.';
  return null;
}

export default function PersonalInfoForm({
  initial,
  profileId,
}: {
  initial: ProfileData['personal'];
  /** Career track the tagline/summary belong to; identity fields are shared. */
  profileId?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<PersonalInfoInput>(initial);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  function set<K extends keyof PersonalInfoInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
    setError('');
  }
  function patch(p: Partial<PersonalInfoInput>) {
    setForm((f) => ({ ...f, ...p }));
    setSaved(false);
    setError('');
  }

  function handleSave() {
    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    startTransition(async () => {
      await savePersonalInfo(form, profileId);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">Personal information</h2>
        <SaveStatus isPending={isPending} saved={saved} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="trackLabel">Career track name</Label>
          <TextField
            id="trackLabel"
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="e.g. Software Engineering"
          />
          <p className="mt-1 text-[10px] text-neutral-400">
            Shown in the career-track switcher and the dashboard — rename this track anytime.
          </p>
        </div>
        <div>
          <Label htmlFor="fullName">Full name</Label>
          <TextField id="fullName" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="Ada Lovelace" />
        </div>
        <div>
          <Label htmlFor="tagline">Headline / tagline</Label>
          <TextField id="tagline" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="Senior Backend Engineer" />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <TextField id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" />
        </div>

        <TargetRolePicker value={form} onChange={patch} />

        <PhonePicker value={form} onChange={patch} />

        <LocationPicker value={form} onChange={patch} />

        <VisaStatusPicker value={form} onChange={patch} />

        <div>
          <Label htmlFor="website">Website</Label>
          <TextField id="website" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://…" />
        </div>
        <div>
          <Label htmlFor="linkedin">LinkedIn</Label>
          <TextField id="linkedin" value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} placeholder="linkedin.com/in/…" />
        </div>
        <div>
          <Label htmlFor="github">GitHub</Label>
          <TextField id="github" value={form.github} onChange={(e) => set('github', e.target.value)} placeholder="github.com/…" />
        </div>
      </div>

      <div className="mt-5">
        <Label htmlFor="summary">Professional summary</Label>
        <TextArea
          id="summary"
          value={form.professionalSummary}
          onChange={(e) => set('professionalSummary', e.target.value)}
          placeholder="Two or three sentences on who you are and the value you bring."
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end">
        <SaveButton isPending={isPending} onClick={handleSave} />
      </div>
    </div>
  );
}

export function SaveStatus({ isPending, saved }: { isPending: boolean; saved: boolean }) {
  if (isPending) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving changes
      </span>
    );
  }
  if (saved) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
        <Check className="h-3.5 w-3.5" /> Saved
      </span>
    );
  }
  return null;
}

export function SaveButton({ isPending, onClick }: { isPending: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="inline-flex items-center gap-2 rounded-full bg-accent-purple px-5 py-2.5 text-xs font-bold text-white transition-all hover:bg-accent-purple/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      Save changes
    </button>
  );
}
