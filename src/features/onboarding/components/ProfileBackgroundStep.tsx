'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { Label, TextArea, TextField } from '@/features/dashboard/components/profile/Field';
import PhonePicker from '@/features/dashboard/components/profile/PhonePicker';
import type { ProfileStepHandle } from '@/features/dashboard/components/profile/step-handle';
import { saveProfileBackground, type ProfileBackgroundInput } from '@/features/dashboard/actions/profile-actions';
import type { ProfileData } from '@/features/dashboard/data/load-profile';

export const ProfileBackgroundStep = forwardRef<ProfileStepHandle, {
  initial: ProfileData['personal'];
  profileId: string;
  onSummaryChange: (summary: string) => void;
}>(function ProfileBackgroundStep({ initial, profileId, onSummaryChange }, ref) {
  const [form, setForm] = useState<ProfileBackgroundInput>({
    profileId, tagline: initial.tagline, professionalSummary: initial.professionalSummary, email: initial.email,
    phoneDialCode: initial.phoneDialCode, phoneNumber: initial.phoneNumber, phoneCountry: initial.phoneCountry,
    website: initial.website, linkedin: initial.linkedin, github: initial.github,
  });
  useImperativeHandle(ref, () => ({ save: () => saveProfileBackground(form).then(() => undefined) }), [form]);
  function set<K extends keyof ProfileBackgroundInput>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === 'professionalSummary') onSummaryChange(value);
  }
  function patch(value: Partial<ProfileBackgroundInput>) { setForm((current) => ({ ...current, ...value })); }
  return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
    <div className="sm:col-span-2"><Label htmlFor="tagline" optional>Headline</Label><TextField id="tagline" value={form.tagline} onChange={(event) => set('tagline', event.target.value)} placeholder="Senior Backend Engineer" /></div>
    <div><Label htmlFor="email" optional>Email</Label><TextField id="email" type="email" value={form.email} onChange={(event) => set('email', event.target.value)} placeholder="you@example.com" autoComplete="email" /></div>
    <PhonePicker value={form} onChange={patch} />
    <div><Label htmlFor="linkedin" optional>LinkedIn</Label><TextField id="linkedin" value={form.linkedin} onChange={(event) => set('linkedin', event.target.value)} placeholder="linkedin.com/in/…" /></div>
    <div><Label htmlFor="github" optional>GitHub</Label><TextField id="github" value={form.github} onChange={(event) => set('github', event.target.value)} placeholder="github.com/…" /></div>
    <div className="sm:col-span-2"><Label htmlFor="website" optional>Website</Label><TextField id="website" type="url" value={form.website} onChange={(event) => set('website', event.target.value)} placeholder="your-site.example" /></div>
    <div className="sm:col-span-2"><Label htmlFor="summary" optional>Professional summary</Label><TextArea id="summary" value={form.professionalSummary} onChange={(event) => set('professionalSummary', event.target.value)} placeholder="Two or three sentences on who you are and the value you bring." /></div>
  </div>;
});