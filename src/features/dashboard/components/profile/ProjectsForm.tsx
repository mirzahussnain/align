'use client';

import { forwardRef, useImperativeHandle, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { Label, TextField, TextArea, MonthField } from './Field';
import { SaveStatus, SaveButton } from './PersonalInfoForm';
import { saveProjects, type ProjectInput } from '@/features/dashboard/actions/profile-actions';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import type { ProfileStepHandle } from './step-handle';

const EMPTY: ProjectInput = { name: '', stack: '', startDate: '', endDate: '', achievements: [''] };

const ProjectsForm = forwardRef<ProfileStepHandle, { initial: ProfileData['projects']; embedded?: boolean; profileId?: string }>(
  function ProjectsForm({ initial, embedded = false, profileId }, ref) {
  const router = useRouter();
  const [rows, setRows] = useState<ProjectInput[]>(
    initial.length ? initial.map((r) => ({ ...r, achievements: r.achievements.length ? r.achievements : [''] })) : [{ ...EMPTY }]
  );
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<ProjectInput>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  useImperativeHandle(ref, () => ({ save: () => saveProjects(rows, profileId).then(() => undefined) }), [rows]);

  function handleSave() {
    startTransition(async () => {
      await saveProjects(rows, profileId);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div>
      {!embedded && (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-neutral-900">Projects</h2>
          <SaveStatus isPending={isPending} saved={saved} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {rows.map((row, i) => (
          <div key={i} className="rounded-2xl border border-neutral-200 p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Project {i + 1}</p>
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
                <Label>Name</Label>
                <TextField value={row.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Realtime pricing engine" />
              </div>
              <div>
                <Label>Stack</Label>
                <TextField value={row.stack} onChange={(e) => update(i, { stack: e.target.value })} placeholder="Go, Kafka, Postgres" />
              </div>
              {/*
                Optional on both ends, unlike experience and education: a side
                project often has no meaningful start or finish, and demanding
                one only produces invented dates.
              */}
              <div>
                <Label>Start date (optional)</Label>
                <MonthField
                  value={row.startDate}
                  max={row.endDate || undefined}
                  onChange={(e) => update(i, { startDate: e.target.value })}
                />
              </div>
              <div>
                <Label>End date (optional)</Label>
                <MonthField
                  value={row.endDate}
                  min={row.startDate || undefined}
                  onChange={(e) => update(i, { endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="mt-4">
              <Label>Achievements (one per line)</Label>
              <TextArea
                value={row.achievements.join('\n')}
                onChange={(e) => update(i, { achievements: e.target.value.split('\n') })}
                placeholder={'Handled 12k requests/sec…\nReduced infra cost by…'}
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
          <Plus className="h-3.5 w-3.5" /> Add project
        </button>
        {!embedded && <SaveButton isPending={isPending} onClick={handleSave} />}
      </div>
    </div>
  );
});

export default ProjectsForm;
