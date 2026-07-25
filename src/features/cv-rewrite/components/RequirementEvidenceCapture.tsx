'use client';

import { useEffect, useState } from 'react';
import type { ProfileCandidate, ProfileEvidenceRef, ProfileEvidenceRequirement } from '@/shared/types/profile-reasoning';
const STRUCTURED_EVIDENCE_KINDS = ['skill_tool', 'employment', 'project', 'education', 'training', 'certification', 'licence', 'registration', 'language', 'volunteering', 'other'] as const;
type StructuredEvidenceKind = (typeof STRUCTURED_EVIDENCE_KINDS)[number];

const fieldSets: Record<StructuredEvidenceKind, { key: string; label: string; list?: boolean }[]> = {
  skill_tool: [{ key: 'name', label: 'Skill or tool' }, { key: 'level', label: 'Level (professional, project, limited exposure, training, learning)' }, { key: 'contextType', label: 'Context type' }, { key: 'activity', label: 'What you did' }, { key: 'period', label: 'Period' }, { key: 'outcome', label: 'Outcome (optional)' }],
  employment: [{ key: 'employer', label: 'Employer' }, { key: 'role', label: 'Role' }, { key: 'startDate', label: 'Start (YYYY or YYYY-MM)' }, { key: 'endDate', label: 'End (optional)' }, { key: 'responsibility', label: 'Responsibility or achievement' }, { key: 'skillsTools', label: 'Skills/tools used (comma-separated)', list: true }, { key: 'outcome', label: 'Outcome (optional)' }],
  project: [{ key: 'projectName', label: 'Project name' }, { key: 'context', label: 'Context' }, { key: 'description', label: 'Description' }, { key: 'contribution', label: 'Your contribution' }, { key: 'skillsTools', label: 'Skills/tools (comma-separated)', list: true }, { key: 'startDate', label: 'Start (optional)' }, { key: 'endDate', label: 'End (optional)' }, { key: 'outcomeOrLink', label: 'Outcome or link (optional)' }],
  education: [{ key: 'qualification', label: 'Qualification' }, { key: 'institution', label: 'Institution' }, { key: 'field', label: 'Field (optional)' }, { key: 'status', label: 'Status (optional)' }, { key: 'startDate', label: 'Start (optional)' }, { key: 'endDate', label: 'End (optional)' }, { key: 'result', label: 'Result (optional)' }],
  training: [{ key: 'course', label: 'Course' }, { key: 'provider', label: 'Provider (optional)' }, { key: 'field', label: 'Field (optional)' }, { key: 'status', label: 'Status (optional)' }, { key: 'startDate', label: 'Start (optional)' }, { key: 'endDate', label: 'End (optional)' }, { key: 'result', label: 'Result (optional)' }],
  certification: [{ key: 'officialName', label: 'Official name' }, { key: 'issuingBody', label: 'Issuing body (optional)' }, { key: 'issueDate', label: 'Issue date (optional)' }, { key: 'expiryDate', label: 'Expiry date (optional)' }, { key: 'credentialNumber', label: 'Credential number (optional)' }, { key: 'status', label: 'Status (optional)' }, { key: 'verificationUrl', label: 'Verification URL (optional)' }],
  licence: [{ key: 'officialName', label: 'Official name' }, { key: 'issuingBody', label: 'Issuing body (optional)' }, { key: 'issueDate', label: 'Issue date (optional)' }, { key: 'expiryDate', label: 'Expiry date (optional)' }, { key: 'credentialNumber', label: 'Licence number (optional)' }, { key: 'status', label: 'Status (optional)' }, { key: 'verificationUrl', label: 'Verification URL (optional)' }],
  registration: [{ key: 'officialName', label: 'Official name' }, { key: 'issuingBody', label: 'Registering body' }, { key: 'issueDate', label: 'Registration date (optional)' }, { key: 'expiryDate', label: 'Expiry date (optional)' }, { key: 'credentialNumber', label: 'Registration number (optional)' }, { key: 'status', label: 'Status (optional)' }, { key: 'verificationUrl', label: 'Verification URL (optional)' }],
  language: [{ key: 'language', label: 'Language' }, { key: 'speaking', label: 'Speaking (give at least one ability)' }, { key: 'reading', label: 'Reading' }, { key: 'writing', label: 'Writing' }, { key: 'professionalUseContext', label: 'Professional-use context (optional)' }, { key: 'formalTest', label: 'Formal test/certification (optional)' }],
  volunteering: [{ key: 'organisation', label: 'Organisation' }, { key: 'role', label: 'Role' }, { key: 'startDate', label: 'Start (optional)' }, { key: 'endDate', label: 'End (optional)' }, { key: 'contribution', label: 'Contribution (optional)' }, { key: 'skillsTools', label: 'Skills/tools (comma-separated)', list: true }, { key: 'outcome', label: 'Outcome (optional)' }],
  other: [{ key: 'title', label: 'Title' }, { key: 'context', label: 'Context (optional)' }, { key: 'description', label: 'Description' }, { key: 'period', label: 'Period (optional)' }, { key: 'outcome', label: 'Outcome (optional)' }],
};

export default function RequirementEvidenceCapture({ analysisId, profileId, requirement, onApproveRef, onApplicationContext, onClose }: {
  analysisId: string; profileId: string; requirement: ProfileEvidenceRequirement;
  onApproveRef: (ref: ProfileEvidenceRef) => void; onApplicationContext: (id: string) => void; onClose: () => void;
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [candidates, setCandidates] = useState<ProfileCandidate[]>([]);
  const [selected, setSelected] = useState('');
  const [kind, setKind] = useState<StructuredEvidenceKind>('skill_tool');
  const [values, setValues] = useState<Record<string, string>>({ level: 'project' });
  const [reuseInProfile, setReuseInProfile] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch(`/api/profile-evidence?profileId=${encodeURIComponent(profileId)}`).then(async (r) => r.ok ? r.json() : Promise.reject()).then((json) => setCandidates(json.candidates ?? [])).catch(() => setError('Could not load saved profile evidence.')); }, [profileId]);
  const details = Object.fromEntries(fieldSets[kind].map((field) => [field.key, field.list ? (values[field.key] ?? '').split(',').map((v) => v.trim()).filter(Boolean) : values[field.key] ?? '']));
  if (['certification', 'licence', 'registration'].includes(kind)) Object.assign(details, { verificationStatus: 'user_confirmed_unverified' });

  async function save() {
    setError('');
    if (mode === 'existing') { const candidate = candidates.find((item) => `${item.evidenceRef.type}:${item.evidenceRef.id}` === selected); if (!candidate || !confirmed) return setError('Select evidence and confirm that it is accurate.'); onApproveRef(candidate.evidenceRef); return onClose(); }
    if (!confirmed) return setError('Confirm that this evidence is accurate before approving it.');
    setSaving(true);
    try {
      const response = await fetch('/api/profile-evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysisId, profileId, requirementId: requirement.id, reuseInProfile, kind, details, confirmed }) });
      const json = await response.json().catch(() => ({})); if (!response.ok) throw new Error(json.error || 'Could not save evidence.');
      if (json.evidenceRef) onApproveRef(json.evidenceRef); else onApplicationContext(json.applicationEvidenceContextId);
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save evidence.'); } finally { setSaving(false); }
  }

  return <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50 p-4">
    <p className="text-sm font-semibold text-slate-800">Evidence for: {requirement.text}</p>
    <div className="mt-3 flex gap-3 text-xs"><label><input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} /> Use saved evidence</label><label><input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} /> Add structured evidence</label></div>
    {mode === 'existing' ? <select className="mt-3 w-full rounded border p-2 text-sm" value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Select profile evidence</option>{candidates.map((candidate) => <option key={`${candidate.evidenceRef.type}:${candidate.evidenceRef.id}`} value={`${candidate.evidenceRef.type}:${candidate.evidenceRef.id}`}>{candidate.evidenceLocation}: {candidate.evidenceText}</option>)}</select> : <>
      <label className="mt-3 block text-xs font-medium">Evidence type<select className="mt-1 w-full rounded border p-2 text-sm" value={kind} onChange={(e) => { setKind(e.target.value as StructuredEvidenceKind); setValues({ level: 'project' }); }}>{STRUCTURED_EVIDENCE_KINDS.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
      {fieldSets[kind].map((field) => <label key={field.key} className="mt-2 block text-xs font-medium">{field.label}<input className="mt-1 w-full rounded border p-2 text-sm" value={values[field.key] ?? ''} onChange={(e) => setValues((previous) => ({ ...previous, [field.key]: e.target.value }))} /></label>)}
      <label className="mt-3 block text-xs"><input type="checkbox" checked={reuseInProfile} onChange={(e) => setReuseInProfile(e.target.checked)} /> Save as reusable Career Profile evidence (leave off for this application only)</label>
    </>}
    <label className="mt-3 block text-xs"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I confirm this is accurate and approve it for this requirement.</label>
    {error && <p className="mt-2 text-xs text-red-700">{error}</p>}<div className="mt-3 flex gap-2"><button type="button" className="rounded border px-3 py-1.5 text-xs" onClick={onClose}>Cancel</button><button type="button" className="rounded bg-accent-purple px-3 py-1.5 text-xs text-white disabled:opacity-60" disabled={saving} onClick={save}>Approve evidence</button></div>
  </div>;
}
