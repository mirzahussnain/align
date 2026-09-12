'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Label, TextField } from '@/features/dashboard/components/profile/Field';
import TargetRolePicker from '@/features/dashboard/components/profile/TargetRolePicker';
import type { ProfileStepHandle } from '@/features/dashboard/components/profile/step-handle';
import { savePersonalInfo, type PersonalInfoInput } from '@/features/dashboard/actions/profile-actions';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import { visaRequiresExpiry } from '@/shared/constants/visa-status';
import { suggestCareerTrackLabel } from '@/shared/occupations/track-label';

/**
 * The minimum needed to save a meaningful Career Profile.
 *
 * Only two fields, and both earn their place: a name, because a CV without one
 * is not a CV, and a target role, because a career track with no direction
 * cannot be scored, matched or rewritten against anything.
 *
 * Everything the old wizard demanded here has been moved to where it is
 * actually needed, because none of it blocks a first result:
 *
 *   - `email` duplicated the verified account email and was asked for twice;
 *   - `city`/`country` and `visaStatus` are eligibility facts, collected at the
 *     point an action needs them rather than at sign-up;
 *   - `professionalSummary` is genuinely optional — a user can get a full ATS
 *     report without having written one, and demanding it up front stopped new
 *     users reaching any result at all.
 *
 * The CV evaluation type (`targetOccupation`) stays optional: a missing one
 * resolves safely through the classifier's Generic fallback.
 */
export function basicsAreValid(form: PersonalInfoInput): boolean {
  if (!form.fullName.trim()) return false;
  if (!form.targetRoleTitle.trim()) return false;
  // Still conditional, wherever a visa status IS given: a time-limited status
  // without its expiry is an incomplete fact, not a deferred one.
  if (form.visaStatus && visaRequiresExpiry(form.visaStatus) && !form.visaExpiry.trim()) return false;
  return true;
}

/**
 * What the wizard needs from this step to do its own job: whether it can
 * advance, and the three fields that feed the shared completeness calculation.
 * `targetOccupation` additionally decides which later steps are shown at all,
 * so it has to leave this component rather than staying in local form state.
 */
export interface BasicsState {
  valid: boolean;
  fullName: string;
  /** The track's target role — the career-direction completeness check. */
  targetRoleTitle: string;
  professionalSummary: string;
  targetOccupation: string;
}

interface BasicsStepProps {
  initial: ProfileData['personal'];
  /** Fallbacks from the auth user record, so name/email aren't blank on a fresh account. */
  fallback: { name: string; email: string };
  onBasicsChange: (state: BasicsState) => void;
}

const BasicsStep = forwardRef<ProfileStepHandle, BasicsStepProps>(function BasicsStep(
  { initial, fallback, onBasicsChange },
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
    onBasicsChange({
      valid: basicsAreValid(form),
      fullName: form.fullName,
      targetRoleTitle: form.targetRoleTitle,
      professionalSummary: form.professionalSummary,
      targetOccupation: form.targetOccupation,
    });
  }, [form, onBasicsChange]);

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

      <TargetRolePicker value={form} onChange={patch} />

      <div className="sm:col-span-2">
        <Label htmlFor="trackLabel">Career track name</Label>
        <TextField
          id="trackLabel"
          value={form.label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Software Engineering"
        />
        <p className="mt-1 text-xs text-neutral-500">
          Suggested from your target role — rename it if you&apos;d like something different. You can add more
          tracks later for other kinds of roles.
        </p>
      </div>

    </div>
  );
});

export default BasicsStep;
