'use client';

import { forwardRef, useImperativeHandle, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Label, TextField } from './Field';
import { SaveStatus, SaveButton } from './PersonalInfoForm';
import { saveSkills, type SkillGroupInput } from '@/features/dashboard/actions/profile-actions';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import type { ProfileStepHandle } from './step-handle';

const EMPTY: SkillGroupInput = { category: '', skills: [] };

const SkillsForm = forwardRef<ProfileStepHandle, { initial: ProfileData['skills']; embedded?: boolean; profileId?: string }>(
  function SkillsForm({ initial, embedded = false, profileId }, ref) {
  const router = useRouter();
  const [rows, setRows] = useState<SkillGroupInput[]>(initial.length ? initial : [{ ...EMPTY }]);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<SkillGroupInput>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  useImperativeHandle(ref, () => ({ save: () => saveSkills(rows, profileId).then(() => undefined) }), [rows]);

  function handleSave() {
    startTransition(async () => {
      await saveSkills(rows, profileId);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div>
      {!embedded && (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-900">Skills</h2>
          <SaveStatus isPending={isPending} saved={saved} />
        </div>
      )}
      <p className="mt-1 text-xs text-neutral-500">Group skills by category. Separate individual skills with commas.</p>

      <div className="mt-6 flex flex-col gap-4">
        {rows.map((row, i) => (
          <div key={i} className="rounded-2xl border border-neutral-200 p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Group {i + 1}</p>
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
              <div>
                <Label>Category</Label>
                <TextField value={row.category} onChange={(e) => update(i, { category: e.target.value })} placeholder="Languages" />
              </div>
              <div>
                <Label>Skills (comma-separated)</Label>
                <TextField
                  value={row.skills.join(', ')}
                  onChange={(e) => update(i, { skills: e.target.value.split(',').map((s) => s.trimStart()) })}
                  placeholder="TypeScript, Go, Python, SQL"
                />
              </div>
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
          <Plus className="h-3.5 w-3.5" /> Add group
        </button>
        {!embedded && <SaveButton isPending={isPending} onClick={handleSave} />}
      </div>
    </div>
  );
});

export default SkillsForm;
