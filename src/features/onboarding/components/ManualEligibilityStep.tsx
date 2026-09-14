'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FieldHint, Label, TextField } from '@/features/dashboard/components/profile/Field';
import type { ProfileStepHandle } from '@/features/dashboard/components/profile/step-handle';
import { saveEligibilityBasics } from '../actions';
import { VISA_STATUSES, visaRequiresExpiry } from '@/shared/constants/visa-status';

export const ManualEligibilityStep = forwardRef<ProfileStepHandle, { initial: { country: string; city: string; visaStatus: string; visaExpiry: string } }>(function ManualEligibilityStep({ initial }, ref) {
  const [form, setForm] = useState(initial);
  useImperativeHandle(ref, () => ({ save: async () => {
    const result = await saveEligibilityBasics(form);
    if (!result.ok) throw new Error(result.error);
  } }), [form]);
  const needsExpiry = Boolean(form.visaStatus) && visaRequiresExpiry(form.visaStatus);
  function set<K extends keyof typeof form>(key: K, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  return <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
    <div><Label htmlFor="eligibility-country" optional>Country</Label><TextField id="eligibility-country" value={form.country} onChange={(event) => set('country', event.target.value)} placeholder="e.g. United Kingdom" autoComplete="country-name" /></div>
    <div><Label htmlFor="eligibility-city" optional>City or town</Label><TextField id="eligibility-city" value={form.city} onChange={(event) => set('city', event.target.value)} placeholder="e.g. Manchester" autoComplete="address-level2" /></div>
    <div className={needsExpiry ? '' : 'sm:col-span-2'}>
      <Label htmlFor="eligibility-visa" optional>Right to work</Label>
      <div className="relative"><select id="eligibility-visa" value={form.visaStatus} onChange={(event) => set('visaStatus', event.target.value)} aria-describedby="eligibility-visa-hint" className="w-full appearance-none rounded-xl border border-neutral-300 bg-white px-4 py-2.5 pr-9 text-sm text-neutral-900 transition-colors focus:border-accent-cyan focus:outline-none focus:ring-2 focus:ring-accent-cyan/15"><option value="">Prefer not to say yet</option>{VISA_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" /></div>
      <FieldHint id="eligibility-visa-hint">Used to tell you whether a role needs sponsorship you do not have.</FieldHint>
    </div>
    {needsExpiry && <div><Label htmlFor="eligibility-visa-expiry" required>Visa expiry</Label><TextField id="eligibility-visa-expiry" type="date" value={form.visaExpiry} onChange={(event) => set('visaExpiry', event.target.value)} /></div>}
  </div>;
});