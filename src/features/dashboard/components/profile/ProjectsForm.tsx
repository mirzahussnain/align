'use client';

import { forwardRef, useImperativeHandle, useMemo, useState, useTransition } from 'react';
import { ExternalLink, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Label, TextArea, TextField, MonthField, FieldHint, isErrorFeedback } from './Field';
import { createProjectSkill, deleteProjectRecord, saveProjectRecord, type ProjectRecordInput } from '@/features/dashboard/actions/profile-actions';
import { formatDateRange } from '@/shared/utils/date';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import type { ProfileStepHandle } from './step-handle';
import SkillTaxonomyPicker from './SkillTaxonomyPicker';

type Editor = { mode: 'closed' } | { mode: 'create'; draftId: string; draft: ProjectRecordInput } | { mode: 'edit'; recordId: string; draft: ProjectRecordInput };
type ProfileSkill = { id: string; name: string; level: string; category: string };
const EMPTY: ProjectRecordInput = { name: '', skillIds: [], liveUrl: '', repositoryUrl: '', startDate: '', endDate: '', achievements: [''] };
const draftId = () => globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}`;

const ProjectsForm = forwardRef<ProfileStepHandle, { initial: ProfileData['projects']; skills: ProfileData['skills']; embedded?: boolean; profileId?: string }>(function ProjectsForm({ initial, skills, profileId }, ref) {
  const initialSkills = useMemo(() => skills.flatMap((group) => group.skillItems.map((skill) => ({ id: skill.id, name: skill.name, level: skill.level ?? '', category: group.id === 'ungrouped' ? '' : group.category }))).sort((a, b) => a.name.localeCompare(b.name, 'en-GB')), [skills]);
  const [knownSkills, setKnownSkills] = useState<ProfileSkill[]>(initialSkills);
  const [records, setRecords] = useState<ProjectRecordInput[]>(initial.map((item) => ({ ...item, skillIds: item.skillIds ?? [], achievements: item.achievements.length ? item.achievements : [''] })));
  const [editor, setEditor] = useState<Editor>({ mode: 'closed' });
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newSkill, setNewSkill] = useState({ name: '', category: '', level: '', taxonomyTermId: '' });
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState('');
  const active = editor.mode === 'closed' ? null : editor;
  const selectedIds = active?.draft.skillIds ?? [];
  const selectedSkills = knownSkills.filter((skill) => selectedIds.includes(skill.id));
  const shownSkills = knownSkills.filter((skill) => skill.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const update = (patch: Partial<ProjectRecordInput>) => active && setEditor({ ...active, draft: { ...active.draft, ...patch } });
  const close = () => { setEditor({ mode: 'closed' }); setCreating(false); setQuery(''); };
  const toggleSkill = (id: string) => update({ skillIds: selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id] });
  const save = () => {
    if (!active) return;
    if (!active.draft.name.trim() || !active.draft.achievements.some((line) => line.trim())) { setFeedback('Add a project name and at least one project evidence or achievement line.'); return; }
    startTransition(async () => {
      const result = await saveProjectRecord({ ...active.draft, id: active.mode === 'edit' ? active.recordId : undefined }, profileId);
      if (!result.ok) return setFeedback(result.error);
      const saved = { ...active.draft, id: result.id };
      setRecords((items) => active.mode === 'edit' ? items.map((item) => item.id === result.id ? saved : item) : [...items, saved]);
      close(); setFeedback('Project saved.');
    });
  };
  const createSkill = () => {
    if (!newSkill.name.trim()) return setFeedback('Give the new skill a name.');
    startTransition(async () => {
      const result = await createProjectSkill(newSkill, profileId);
      if (!result.ok) return setFeedback(result.error);
      setKnownSkills((items) => [...items, result.skill].sort((a, b) => a.name.localeCompare(b.name, 'en-GB')));
      update({ skillIds: [...selectedIds, result.skill.id] });
      setNewSkill({ name: '', category: '', level: '', taxonomyTermId: '' }); setCreating(false); setQuery('');
    });
  };
  const remove = (record: ProjectRecordInput) => {
    if (!record.id || !window.confirm('Delete this project? Previously approved evidence will not be remapped.')) return;
    startTransition(async () => { const result = await deleteProjectRecord(record.id!, profileId); if (!result.ok) return setFeedback(result.error); setRecords((items) => items.filter((item) => item.id !== record.id)); setFeedback(result.mayHaveStaleApprovals ? 'Deleted. Previous approvals were not remapped.' : 'Deleted.'); });
  };
  useImperativeHandle(ref, () => ({ save: async () => { if (active) save(); } }), [active]);

  return <div><h2 className="text-lg font-bold text-neutral-900">Projects</h2>{!active && !records.length && <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 p-6 text-sm text-neutral-500">No projects yet. Add project evidence or an achievement.</div>}{!active && <button type="button" onClick={() => { setEditor({ mode: 'create', draftId: draftId(), draft: { ...EMPTY, skillIds: [] } }); setFeedback(''); }} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"><Plus className="h-3.5 w-3.5" /> Add project</button>}{!active && <div className="mt-5 flex flex-col gap-3">{records.map((record) => <div key={`project:${record.id}`} className="rounded-2xl border border-neutral-200 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-semibold text-neutral-900">{record.name}</p><p className="mt-1 text-xs text-neutral-500">{[knownSkills.filter((skill) => record.skillIds?.includes(skill.id)).map((skill) => skill.name).join(', '), formatDateRange(record.startDate, record.endDate)].filter(Boolean).join(' · ')}</p>{record.achievements[0] && <p className="mt-2 text-xs text-neutral-600">{record.achievements[0]}</p>}{(record.liveUrl || record.repositoryUrl) && <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-accent-purple">{record.liveUrl && <a href={record.liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">View project <ExternalLink className="h-3 w-3" /></a>}{record.repositoryUrl && <a href={record.repositoryUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">View repository <ExternalLink className="h-3 w-3" /></a>}</p>}</div><div className="flex gap-3"><button type="button" onClick={() => setEditor({ mode: 'edit', recordId: record.id!, draft: { ...record, skillIds: record.skillIds ?? [] } })} className="text-xs font-semibold"><Pencil className="mr-1 inline h-3.5 w-3.5" />Edit</button><button type="button" onClick={() => remove(record)} className="text-xs font-semibold text-rose-500"><Trash2 className="mr-1 inline h-3.5 w-3.5" />Delete</button></div></div></div>)}</div>}{active && (() => { const fid = active.mode === 'edit' ? active.recordId : active.draftId; const id = (name: string) => `project-${fid}-${name}`; return <div className="mt-6 rounded-2xl border border-neutral-200 p-4 sm:p-5"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><Label htmlFor={id('name')} required>Project name</Label><TextField id={id('name')} required value={active.draft.name} onChange={(event) => update({ name: event.target.value })} /></div><div><Label htmlFor={id('startDate')} optional>Start date</Label><MonthField id={id('startDate')} value={active.draft.startDate} onChange={(event) => update({ startDate: event.target.value })} /></div><div><Label htmlFor={id('endDate')} optional>End date</Label><MonthField id={id('endDate')} value={active.draft.endDate} onChange={(event) => update({ endDate: event.target.value })} /></div><div><Label htmlFor={id('liveUrl')} optional>Live project URL</Label><TextField id={id('liveUrl')} type="url" value={active.draft.liveUrl ?? ''} onChange={(event) => update({ liveUrl: event.target.value })} placeholder="https://…" /></div><div><Label htmlFor={id('repositoryUrl')} optional>Repository URL</Label><TextField id={id('repositoryUrl')} type="url" value={active.draft.repositoryUrl ?? ''} onChange={(event) => update({ repositoryUrl: event.target.value })} placeholder="https://…" /></div></div><div className="mt-4"><Label htmlFor={id('skills')} optional>Linked canonical Skills</Label><TextField id={id('skills')} value={query} onChange={(event) => { setQuery(event.target.value); setCreating(false); }} placeholder="Search your saved skills" aria-describedby={id('skills-hint')} /><FieldHint id={id('skills-hint')}>Projects can only link Skills already saved in this profile.</FieldHint>{selectedSkills.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{selectedSkills.map((skill) => <button type="button" key={skill.id} onClick={() => toggleSkill(skill.id)} className="inline-flex items-center gap-1 rounded-full bg-accent-purple/10 px-2 py-1 text-xs font-medium text-accent-purple">{skill.name}<X className="h-3 w-3" /></button>)}</div>}<div role="listbox" className="mt-2 max-h-36 overflow-auto rounded-xl border border-neutral-200">{shownSkills.filter((skill) => !selectedIds.includes(skill.id)).map((skill) => <button type="button" role="option" aria-selected={false} key={skill.id} onClick={() => toggleSkill(skill.id)} className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50">{skill.name}{skill.category && <span className="ml-2 text-xs text-neutral-400">{skill.category}</span>}</button>)}{query.trim() && shownSkills.length === 0 && <button type="button" onClick={() => { setCreating(true); setNewSkill({ name: query.trim(), category: '', level: '', taxonomyTermId: '' }); }} className="block w-full px-3 py-2 text-left text-sm font-medium text-accent-purple hover:bg-neutral-50">Create “{query.trim()}” as a new skill</button>}</div>{creating && <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"><p className="text-xs font-semibold text-neutral-700">Create a new canonical Skill</p><div className="mt-2 grid gap-2 sm:grid-cols-3"><SkillTaxonomyPicker id={id('inlineSkill')} value={newSkill.name} taxonomyTermId={newSkill.taxonomyTermId} onChange={(name) => setNewSkill((skill) => ({ ...skill, name }))} onTaxonomyTermChange={(taxonomyTermId) => setNewSkill((skill) => ({ ...skill, taxonomyTermId }))} /><TextField value={newSkill.category} onChange={(event) => setNewSkill((skill) => ({ ...skill, category: event.target.value }))} placeholder="Group (optional)" /><TextField value={newSkill.level} onChange={(event) => setNewSkill((skill) => ({ ...skill, level: event.target.value }))} placeholder="Level (optional)" /></div><button type="button" onClick={createSkill} disabled={pending} className="mt-2 rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-semibold">Create and link skill</button></div>}</div><div className="mt-4"><Label htmlFor={id('achievements')} required>Project evidence or achievements</Label><TextArea id={id('achievements')} required aria-describedby={id('achievements-hint')} value={active.draft.achievements.join('\n')} onChange={(event) => update({ achievements: event.target.value.split('\n') })} /><FieldHint id={id('achievements-hint')}>Include responsibilities, features delivered, improvements, outcomes, or measurable achievements.</FieldHint></div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3"><button type="button" onClick={close} disabled={pending} className="w-full rounded-full border border-neutral-300 px-4 py-2 text-xs font-bold sm:w-auto">Cancel</button><button type="button" onClick={save} disabled={pending} className="w-full rounded-full bg-accent-purple px-4 py-2 text-xs font-bold text-white sm:w-auto">{pending ? 'Saving…' : active.mode === 'edit' ? 'Save changes' : 'Save project'}</button></div></div>; })()}{feedback && <p role="status" className={`mt-4 text-xs font-medium ${isErrorFeedback(feedback) ? 'text-rose-600' : 'text-emerald-600'}`}>{feedback}</p>}</div>;
});
export default ProjectsForm;