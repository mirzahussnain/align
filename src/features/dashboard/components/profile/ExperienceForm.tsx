'use client';

import { forwardRef, useImperativeHandle, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import {
  Label,
  TextField,
  TextArea,
  MonthField,
  SelectField,
  PresentCheckbox,
  RequiredMark,
} from './Field';
import { SaveStatus, SaveButton } from './PersonalInfoForm';
import { saveExperience, type ExperienceInput } from '@/features/dashboard/actions/profile-actions';
import { EMPLOYMENT_TYPES } from '@/shared/constants/employment-type';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import type { ProfileStepHandle } from './step-handle';

const EMPTY: ExperienceInput = {
  jobTitle: '',
  company: '',
  location: '',
  type: '',
  startDate: '',
  endDate: '',
  current: false,
  achievements: [''],
};

const ExperienceForm = forwardRef<ProfileStepHandle, { initial: ProfileData['experience']; embedded?: boolean; profileId?: string }>(
  function ExperienceForm({ initial, embedded = false, profileId }, ref) {
  const router = useRouter();
  const [rows, setRows] = useState<ExperienceInput[]>(
    initial.length ? initial.map((r) => ({ ...r, achievements: r.achievements.length ? r.achievements : [''] })) : [{ ...EMPTY }]
  );
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<ExperienceInput>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  useImperativeHandle(ref, () => ({ save: () => saveExperience(rows, profileId).then(() => undefined) }), [rows]);

  function handleSave() {
    startTransition(async () => {
      await saveExperience(rows, profileId);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div>
      {!embedded && (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-900">Work experience</h2>
          <SaveStatus isPending={isPending} saved={saved} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {rows.map((row, i) => (
          <div key={i} className="rounded-2xl border border-neutral-200 p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Role {i + 1}</p>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Job title</Label>
                <TextField value={row.jobTitle} onChange={(e) => update(i, { jobTitle: e.target.value })} placeholder="Backend Engineer" />
              </div>
              <div>
                <Label>Company</Label>
                <TextField value={row.company} onChange={(e) => update(i, { company: e.target.value })} placeholder="Monzo" />
              </div>
              <div>
                <Label>Location</Label>
                <TextField value={row.location} onChange={(e) => update(i, { location: e.target.value })} placeholder="London, UK" />
              </div>
              <div>
                <Label>Type</Label>
                <SelectField
                  value={row.type}
                  onChange={(e) => update(i, { type: e.target.value })}
                  options={EMPLOYMENT_TYPES}
                  placeholder="Select type…"
                />
              </div>
              <div>
                <Label>
                  Start date <RequiredMark />
                </Label>
                <MonthField
                  required
                  value={row.startDate}
                  // The start can never be after the end, so the end date caps
                  // it — the picker greys out impossible months instead of
                  // letting them be chosen and rejected on save.
                  max={row.current ? undefined : row.endDate || undefined}
                  onChange={(e) => update(i, { startDate: e.target.value })}
                />
              </div>
              <div>
                <Label>
                  End date {!row.current && <RequiredMark />}
                </Label>
                <MonthField
                  required={!row.current}
                  disabled={row.current}
                  value={row.current ? '' : row.endDate}
                  min={row.startDate || undefined}
                  onChange={(e) => update(i, { endDate: e.target.value })}
                />
                <PresentCheckbox
                  id={`exp-current-${i}`}
                  checked={row.current}
                  // Clearing endDate on tick keeps the stored row honest: an
                  // ongoing role must not carry a leftover end date that would
                  // resurface if the box is later unticked.
                  onChange={(checked) => update(i, { current: checked, endDate: checked ? '' : row.endDate })}
                  label="I currently work here"
                />
              </div>
            </div>

            <div className="mt-4">
              <Label>Achievements (one per line)</Label>
              <TextArea
                value={row.achievements.join('\n')}
                onChange={(e) => update(i, { achievements: e.target.value.split('\n') })}
                placeholder={'Cut checkout latency 40% by…\nLed migration of…'}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, { ...EMPTY }])}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-100"
        >
          <Plus className="h-3.5 w-3.5" /> Add role
        </button>
        {!embedded && <SaveButton isPending={isPending} onClick={handleSave} />}
      </div>
    </div>
  );
});

export default ExperienceForm;
