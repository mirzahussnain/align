'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Label, TextField, TextArea } from '@/features/dashboard/components/profile/Field';
import TargetRolePicker from '@/features/dashboard/components/profile/TargetRolePicker';
import LocationPicker from '@/features/dashboard/components/profile/LocationPicker';
import PhonePicker from '@/features/dashboard/components/profile/PhonePicker';
import VisaStatusPicker from '@/features/dashboard/components/profile/VisaStatusPicker';
import type { ProfileStepHandle } from '@/features/dashboard/components/profile/step-handle';
import { savePersonalInfo, type PersonalInfoInput } from '@/features/dashboard/actions/profile-actions';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import { visaRequiresExpiry } from '@/shared/constants/visa-status';
import { suggestCareerTrackLabel } from '@/shared/occupations/track-label';

/** Are all non-skippable basics filled in (incl. an expiry for temporary visas)? */
export function basicsAreValid(form: PersonalInfoInput): boolean {
  const required: (keyof PersonalInfoInput)[] = [
    'fullName',
    'email',
    'city',
    'country',
    'professionalSummary',
    // The occupation selects which evaluation profile scores this user's
    // analyses — without it everything falls back to generic rules.
    'targetOccupation',
  ];
  if (!required.every((k) => form[k].trim().length > 0)) return false;
  if (!form.visaStatus) return false;
  if (visaRequiresExpiry(form.visaStatus) && !form.visaExpiry.trim()) return false;
  return true;
}

interface BasicsStepProps {
  initial: ProfileData['personal'];
  /** Fallbacks from the auth user record, so name/email aren't blank on a fresh account. */
  fallback: { name: string; email: string };
  onValidityChange: (valid: boolean) => void;
}

const BasicsStep = forwardRef<ProfileStepHandle, BasicsStepProps>(function BasicsStep(
  { initial, fallback, onValidityChange },
  ref
) {
  const [form, setForm] = useState<PersonalInfoInput>({
    ...initial,
    fullName: initial.fullName || fallback.name,
    email: initial.email || fallback.email,
    label: initial.label && initial.label !== 'Default' ? initial.label : suggestCareerTrackLabel({
      occupation: initial.targetOccupation,
      targetRoleTitle: initial.targetRoleTitle,
      industry: initial.targetIndustry,
    }),
  });

  // Once the user edits the track name themselves, auto-suggestion stops —
  // it should fill a blank field, never fight the user's own choice.
  const labelTouched = useRef(Boolean(initial.label && initial.label !== 'Default'));

  useImperativeHandle(ref, () => ({ save: () => savePersonalInfo(form).then(() => undefined) }), [form]);

  useEffect(() => {
    onValidityChange(basicsAreValid(form));
  }, [form, onValidityChange]);

  useEffect(() => {
    if (labelTouched.current) return;
    const suggestion = suggestCareerTrackLabel({
      occupation: form.targetOccupation,
      targetRoleTitle: form.targetRoleTitle,
      industry: form.targetIndustry,
    });
    setForm((f) => (f.label === suggestion ? f : { ...f, label: suggestion }));
  }, [form.targetOccupation, form.targetRoleTitle, form.targetIndustry]);

  function set<K extends keyof PersonalInfoInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function patch(p: Partial<PersonalInfoInput>) {
    setForm((f) => ({ ...f, ...p }));
  }
  function setLabel(value: string) {
    labelTouched.current = true;
    set('label', value);
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <div>
        <Label htmlFor="fullName">
          Full name <span className="text-rose-500">*</span>
        </Label>
        <TextField id="fullName" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="Ada Lovelace" />
      </div>
      <div>
        <Label htmlFor="tagline">Headline / tagline</Label>
        <TextField id="tagline" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="Senior Backend Engineer" />
      </div>
      <div>
        <Label htmlFor="email">
          Email <span className="text-rose-500">*</span>
        </Label>
        <TextField id="email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" />
      </div>

      <TargetRolePicker value={form} onChange={patch} required />

      <div className="sm:col-span-2">
        <Label htmlFor="trackLabel">Career track name</Label>
        <TextField
          id="trackLabel"
          value={form.label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Software Engineering"
        />
        <p className="mt-1 text-[10px] text-neutral-400">
          Suggested from your target role — rename it if you&apos;d like something different. You can add more
          tracks later for other kinds of roles.
        </p>
      </div>

      <PhonePicker value={form} onChange={patch} />

      <LocationPicker value={form} onChange={patch} />

      <VisaStatusPicker value={form} onChange={patch} />

      <div>
        <Label htmlFor="linkedin">LinkedIn</Label>
        <TextField id="linkedin" value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} placeholder="linkedin.com/in/…" />
      </div>
      <div>
        <Label htmlFor="github">GitHub</Label>
        <TextField id="github" value={form.github} onChange={(e) => set('github', e.target.value)} placeholder="github.com/…" />
      </div>

      <div className="sm:col-span-2">
        <Label htmlFor="summary">
          Professional summary <span className="text-rose-500">*</span>
        </Label>
        <TextArea
          id="summary"
          value={form.professionalSummary}
          onChange={(e) => set('professionalSummary', e.target.value)}
          placeholder="Two or three sentences on who you are and the value you bring."
        />
      </div>
    </div>
  );
});

export default BasicsStep;
