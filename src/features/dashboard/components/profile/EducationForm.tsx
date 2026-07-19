'use client';

import { forwardRef, useImperativeHandle, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Label, TextField, TextArea, MonthField, PresentCheckbox, RequiredMark } from './Field';
import { SaveStatus, SaveButton } from './PersonalInfoForm';
import { saveEducation, type EducationInput } from '@/features/dashboard/actions/profile-actions';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import type { ProfileStepHandle } from './step-handle';

const EMPTY: EducationInput = {
  degree: '',
  university: '',
  startDate: '',
  endDate: '',
  current: false,
  grade: '',
  description: '',
};

const EducationForm = forwardRef<ProfileStepHandle, { initial: ProfileData['education']; embedded?: boolean; profileId?: string }>(
  function EducationForm({ initial, embedded = false, profileId }, ref) {
  const router = useRouter();
  const [rows, setRows] = useState<EducationInput[]>(initial.length ? initial : [{ ...EMPTY }]);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<EducationInput>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  useImperativeHandle(ref, () => ({ save: () => saveEducation(rows, profileId).then(() => undefined) }), [rows]);

  function handleSave() {
    startTransition(async () => {
      await saveEducation(rows, profileId);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div>
      {!embedded && (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-900">Education</h2>
          <SaveStatus isPending={isPending} saved={saved} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {rows.map((row, i) => (
          <div key={i} className="rounded-2xl border border-neutral-200 p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Entry {i + 1}</p>
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
                <Label>Degree</Label>
                <TextField value={row.degree} onChange={(e) => update(i, { degree: e.target.value })} placeholder="BSc Computer Science" />
              </div>
              <div>
                <Label>University</Label>
                <TextField value={row.university} onChange={(e) => update(i, { university: e.target.value })} placeholder="University of Manchester" />
              </div>
              <div>
                <Label>
                  Start date <RequiredMark />
                </Label>
                <MonthField
                  required
                  value={row.startDate}
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
                  id={`edu-current-${i}`}
                  checked={row.current}
                  onChange={(checked) => update(i, { current: checked, endDate: checked ? '' : row.endDate })}
                  label="I currently study here"
                />
              </div>
              <div>
                <Label>Grade</Label>
                <TextField value={row.grade} onChange={(e) => update(i, { grade: e.target.value })} placeholder="First Class" />
              </div>
            </div>

            <div className="mt-4">
              <Label>Description</Label>
              <TextArea value={row.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="Relevant modules, dissertation, honours…" />
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
          <Plus className="h-3.5 w-3.5" /> Add entry
        </button>
        {!embedded && <SaveButton isPending={isPending} onClick={handleSave} />}
      </div>
    </div>
  );
});

export default EducationForm;
