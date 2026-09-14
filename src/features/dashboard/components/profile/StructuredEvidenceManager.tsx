'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { Label, MonthField, SelectField, TextArea, TextField } from './Field';
import { CERTIFICATION_STATUS_OPTIONS, LANGUAGE_PROFICIENCY_OPTIONS, LICENCE_STATUS_OPTIONS, optionLabel, REGISTRATION_STATUS_OPTIONS, TRAINING_STATUS_OPTIONS, VERIFICATION_STATUS_OPTIONS, type ProfileFieldOption } from '@/shared/constants/profile-field-options';
import { deleteManagedEvidence, saveManagedEvidence, type ManagedEvidenceKind } from '@/features/dashboard/actions/profile-actions';
import { ENTITLEMENTS_REFRESH_EVENT } from '@/shared/entitlements/registry';
import { formatDateRange, formatProfileDate } from '@/shared/utils/date';

type Row = Record<string, string | string[]> & { id?: string };
// `date` swaps in the shared month/year control; `hideOnCard` keeps sensitive
// values (credential/licence/registration numbers, verification URLs) out of
// the summary line even though they remain editable in the form.
type Field = { key: string; label: string; required?: boolean; multiline?: boolean; list?: boolean; hint?: string; date?: boolean; hideOnCard?: boolean; options?: readonly ProfileFieldOption[] };

export type EvidenceEditorState =
  | { mode: 'closed' }
  | { mode: 'create'; evidenceType: ManagedEvidenceKind; draftId: string; draft: Row }
  | { mode: 'edit'; evidenceType: ManagedEvidenceKind; recordId: string; draft: Row };

export const CLOSED_EDITOR: EvidenceEditorState = { mode: 'closed' };
export const STRUCTURED_EVIDENCE_EDITOR_KINDS = ['certification', 'training', 'licence', 'registration', 'language', 'volunteering', 'other'] as const;
type OpenEvidenceEditor = Exclude<EvidenceEditorState, { mode: 'closed' }>;
export function editorMatchesType(editor: EvidenceEditorState, evidenceType: ManagedEvidenceKind): editor is OpenEvidenceEditor { return editor.mode !== 'closed' && editor.evidenceType === evidenceType; }
export function evidenceRecordKey(evidenceType: ManagedEvidenceKind, recordId: string) { return `${evidenceType}:${recordId}`; }
export function evidenceFormFieldId(evidenceType: ManagedEvidenceKind, recordKey: string, fieldName: string) { return `${evidenceType}-${recordKey}-${fieldName}`; }

// Only the fields the server also requires carry `required`. Everything else is
// optional: a missing qualifier means "not provided", never "expired" or
// "unverified", so valid evidence is saved with whatever detail the user has.
// Lifecycle status ("Certification status") and evidence status ("Evidence
// status") are deliberately distinct: one records where the credential is in
// its own life (active/expired/…), the other records how well the product can
// stand behind it. Neither is inferred from the other, or from a date.
const CONFIG: Record<ManagedEvidenceKind, { singular: string; fields: Field[] }> = {
  training: { singular: 'training', fields: [{ key: 'course', label: 'Training name', required: true }, { key: 'provider', label: 'Provider' }, { key: 'field', label: 'Training topic' }, { key: 'status', label: 'Training status', options: TRAINING_STATUS_OPTIONS }, { key: 'startDate', label: 'Start date', date: true }, { key: 'endDate', label: 'Completion date', date: true }, { key: 'result', label: 'Result or outcome' }] },
  licence: { singular: 'licence', fields: [{ key: 'officialName', label: 'Licence name or type', required: true }, { key: 'issuingBody', label: 'Issuing authority' }, { key: 'credentialNumber', label: 'Licence number', hideOnCard: true }, { key: 'issueDate', label: 'Issue date', date: true }, { key: 'expiryDate', label: 'Expiry date', date: true }, { key: 'status', label: 'Licence status', options: LICENCE_STATUS_OPTIONS }, { key: 'verificationUrl', label: 'Evidence URL', hideOnCard: true }, { key: 'verificationStatus', label: 'Evidence status', options: VERIFICATION_STATUS_OPTIONS }] },
  registration: { singular: 'professional registration', fields: [{ key: 'officialName', label: 'Registration type or profession', required: true }, { key: 'issuingBody', label: 'Regulatory body', required: true }, { key: 'credentialNumber', label: 'Registration number', hideOnCard: true }, { key: 'issueDate', label: 'Issue / start date', date: true }, { key: 'expiryDate', label: 'Expiry / renewal date', date: true }, { key: 'status', label: 'Registration status', options: REGISTRATION_STATUS_OPTIONS }, { key: 'verificationUrl', label: 'Evidence URL', hideOnCard: true }, { key: 'verificationStatus', label: 'Evidence status', options: VERIFICATION_STATUS_OPTIONS }] },
  language: { singular: 'language', fields: [{ key: 'language', label: 'Language', required: true }, { key: 'speaking', label: 'Speaking proficiency', options: LANGUAGE_PROFICIENCY_OPTIONS, hint: 'Give at least one of speaking, reading, or writing.' }, { key: 'reading', label: 'Reading proficiency', options: LANGUAGE_PROFICIENCY_OPTIONS }, { key: 'writing', label: 'Writing proficiency', options: LANGUAGE_PROFICIENCY_OPTIONS }, { key: 'professionalUseContext', label: 'Professional-use context', multiline: true }, { key: 'formalTest', label: 'Formal test / certification' }] },
  volunteering: { singular: 'volunteering role', fields: [{ key: 'organisation', label: 'Organisation', required: true }, { key: 'role', label: 'Role', required: true }, { key: 'startDate', label: 'Start date', date: true }, { key: 'endDate', label: 'End date', date: true }, { key: 'contribution', label: 'Responsibilities', multiline: true }, { key: 'skillsTools', label: 'Skills used (comma-separated)', list: true }, { key: 'outcome', label: 'Achievements', multiline: true }] },
  other: { singular: 'reusable evidence record', fields: [{ key: 'title', label: 'Title', required: true }, { key: 'context', label: 'Category / context', hint: 'Do not use this for skills, credentials, work, education, languages, or training.' }, { key: 'description', label: 'Description', required: true, multiline: true }, { key: 'period', label: 'Date', date: true }, { key: 'outcome', label: 'Source, link, or outcome', multiline: true }] },
  certification: { singular: 'certification', fields: [{ key: 'officialName', label: 'Certification name', required: true }, { key: 'issuingBody', label: 'Issuing body' }, { key: 'credentialNumber', label: 'Credential number', hideOnCard: true }, { key: 'issueDate', label: 'Issue date', date: true }, { key: 'expiryDate', label: 'Expiry date', date: true }, { key: 'status', label: 'Certification status', options: CERTIFICATION_STATUS_OPTIONS }, { key: 'verificationUrl', label: 'Evidence URL', hideOnCard: true }, { key: 'verificationStatus', label: 'Evidence status', options: VERIFICATION_STATUS_OPTIONS }] },
};

function blank(kind: ManagedEvidenceKind): Row { return Object.fromEntries(CONFIG[kind].fields.map((field) => [field.key, field.list ? [] : ''])); }
function draftId() { return globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}`; }
// "Training" is uncountable; `other` is the reusable evidence library and is
// named for what it holds, not for its record shape. Everything else pluralises.
function heading(kind: ManagedEvidenceKind) { if (kind === 'other') return 'Reusable evidence'; const singular = CONFIG[kind].singular; return `${singular[0].toUpperCase()}${singular.slice(1)}${kind === 'training' ? '' : 's'}`; }

/**
 * Concise, code-free card subtitle. Option-backed values map to their human
 * label, list values join cleanly, sensitive numbers/URLs are omitted, and
 * empty fields never leave a dangling separator. Never shows a raw enum code.
 */
function dateSubtitle(kind: ManagedEvidenceKind, record: Row): string {
  if (kind === 'other') return formatProfileDate(String(record.period ?? ''));
  const [startKey, endKey] = ['certification', 'licence', 'registration'].includes(kind)
    ? ['issueDate', 'expiryDate']
    : ['startDate', 'endDate'];
  return formatDateRange(String(record[startKey] ?? ''), String(record[endKey] ?? ''));
}

export function cardSubtitle(kind: ManagedEvidenceKind, record: Row): string {
  const details = CONFIG[kind].fields
    .slice(1)
    .filter((field) => !field.hideOnCard && !field.date)
    .map((field) => {
      const raw = record[field.key];
      if (field.list) return Array.isArray(raw) ? raw.join(', ') : '';
      const value = String(raw ?? '');
      return field.options ? optionLabel(field.options, value) : value;
    });

  return [...details, dateSubtitle(kind, record)]
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ');
}

export default function StructuredEvidenceManager({ kind, initial, profileId }: { kind: ManagedEvidenceKind; initial: Row[]; profileId: string }) {
  const config = CONFIG[kind];
  const [records, setRecords] = useState<Row[]>(initial);
  const [editor, setEditor] = useState<EvidenceEditorState>(CLOSED_EDITOR);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ text: string; failed: boolean }>({ text: '', failed: false });
  const fail = (text: string) => setFeedback({ text, failed: true });
  const succeed = (text: string) => setFeedback({ text, failed: false });
  const clearFeedback = () => setFeedback({ text: '', failed: false });
  // Only this section is governed by the reusable-evidence allowance, so only it
  // needs the shared usage snapshot re-read after a create or delete.
  const refreshUsage = () => { if (kind === 'other') window.dispatchEvent(new Event(ENTITLEMENTS_REFRESH_EVENT)); };
  const openCreate = () => { setEditor({ mode: 'create', evidenceType: kind, draftId: draftId(), draft: blank(kind) }); clearFeedback(); };
  const openEdit = (record: Row) => { if (!record.id) return; setEditor({ mode: 'edit', evidenceType: kind, recordId: record.id, draft: { ...record } }); clearFeedback(); };
  const closeEditor = () => setEditor(CLOSED_EDITOR);
  const activeEditor = editorMatchesType(editor, kind) ? editor : null;
  const updateDraft = (field: Field, value: string) => { if (!activeEditor) return; setEditor({ ...activeEditor, draft: { ...activeEditor.draft, [field.key]: field.list ? value.split(',').map((item) => item.trim()).filter(Boolean) : value } }); };
  function save() {
    if (!activeEditor) return;
    startTransition(async () => {
      const result = await saveManagedEvidence({ kind, id: activeEditor.mode === 'edit' ? activeEditor.recordId : undefined, details: activeEditor.draft }, profileId);
      if (!result.ok) return fail(result.error);
      const saved = { ...activeEditor.draft, id: result.id };
      setRecords((current) => activeEditor.mode === 'edit' ? current.map((record) => record.id === result.id ? saved : record) : [...current, saved]);
      if (activeEditor.mode === 'create') refreshUsage();
      closeEditor(); succeed(`${config.singular[0].toUpperCase()}${config.singular.slice(1)} saved.`);
    });
  }
  function remove(record: Row) {
    if (!record.id || !window.confirm('Delete this record? If it was approved as CV evidence, a future generation using that approval will safely require you to choose evidence again.')) return;
    startTransition(async () => { const result = await deleteManagedEvidence(kind, record.id!, profileId); if (!result.ok) return fail(result.error); setRecords((current) => current.filter((item) => item.id !== record.id)); refreshUsage(); succeed(result.mayHaveStaleApprovals ? 'Deleted. Previous evidence approvals were not remapped.' : 'Deleted.'); });
  }
  return <div><div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"><div><h2 className="text-lg font-bold text-neutral-900">{heading(kind)}</h2><p className="mt-1 text-xs text-neutral-500">These reusable records are available in the evidence selector when tailoring a CV.</p></div></div>
    {!activeEditor && records.length === 0 && <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 p-6 text-sm text-neutral-500">No {config.singular}s yet. Add one whenever it is relevant to your career track.</div>}
    {!activeEditor && <div className="mt-4"><button type="button" onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" /> Add {config.singular}</button></div>}
    {!activeEditor && <div className="mt-5 flex flex-col gap-3">{records.map((record) => <div key={evidenceRecordKey(kind, record.id!)} className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-neutral-900">{String(record[config.fields[0].key] ?? config.singular)}</p><p className="mt-1 text-xs text-neutral-500">{cardSubtitle(kind, record)}</p></div><div className="flex shrink-0 gap-3"><button type="button" onClick={() => openEdit(record)} className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-neutral-900"><Pencil className="h-3.5 w-3.5" /> Edit</button><button type="button" onClick={() => remove(record)} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /> Delete</button></div></div>)}</div>}
    {activeEditor && <div key={activeEditor.mode === 'edit' ? evidenceRecordKey(kind, activeEditor.recordId) : `${kind}:draft:${activeEditor.draftId}`} className="mt-6 rounded-2xl border border-neutral-200 p-4 sm:p-5"><p className="mb-4 text-xs font-bold uppercase tracking-wider text-neutral-400">{activeEditor.mode === 'edit' ? `Edit ${config.singular}` : `Add ${config.singular}`}</p><div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{config.fields.map((field) => { const fieldId = evidenceFormFieldId(kind, activeEditor.mode === 'edit' ? activeEditor.recordId : activeEditor.draftId, field.key); const hintId = field.hint ? `${fieldId}-hint` : undefined; return <div key={field.key} className={field.multiline ? 'sm:col-span-2' : ''}><Label htmlFor={fieldId} required={field.required}>{field.label}</Label>{field.multiline ? <TextArea id={fieldId} required={field.required} aria-describedby={hintId} value={String(activeEditor.draft[field.key] ?? '')} onChange={(event) => updateDraft(field, event.target.value)} /> : field.date ? <MonthField id={fieldId} required={field.required} aria-describedby={hintId} value={String(activeEditor.draft[field.key] ?? '')} onChange={(event) => updateDraft(field, event.target.value)} /> : field.options ? <SelectField id={fieldId} required={field.required} aria-describedby={hintId} value={String(activeEditor.draft[field.key] ?? '')} onChange={(event) => updateDraft(field, event.target.value)} options={field.options} placeholder="Select" /> : <TextField id={fieldId} required={field.required} aria-describedby={hintId} value={field.list ? (activeEditor.draft[field.key] as string[] ?? []).join(', ') : String(activeEditor.draft[field.key] ?? '')} onChange={(event) => updateDraft(field, event.target.value)} />}{field.hint && <p id={hintId} className="mt-1 text-[10px] text-neutral-400">{field.hint}</p>}</div>; })}</div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3"><button type="button" onClick={closeEditor} disabled={isPending} className="w-full rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:w-auto">Cancel</button><button type="button" onClick={save} disabled={isPending} className="w-full rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-50 sm:w-auto">{isPending ? 'Saving…' : `Save ${config.singular}`}</button></div></div>}
    {feedback.text && <p role="status" className={`mt-4 text-xs font-medium ${feedback.failed ? 'text-rose-600' : 'text-emerald-600'}`}>{feedback.text}</p>}
  </div>;
}
