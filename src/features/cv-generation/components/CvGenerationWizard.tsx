'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronLeft, Download, Loader2, Plus, ShieldCheck, X } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import { cn } from '@/shared/utils/cn';
import type { AnalysisRow } from '@/features/dashboard/components/DashboardShell';
import type {
  CvAtsStrategy,
  CvGenerationSourceMode,
  HitlEvidenceEntityKind,
  ProposedCvPlan,
  SemanticGapGroup,
  UnifiedCandidateEvidence,
} from '@/shared/cv-generation/types';
import { DEFAULT_TEMPLATE_ID, TEMPLATE_IDS, type TemplateId } from '@/shared/constants/templates';
import { EMPLOYMENT_TYPES } from '@/shared/constants/employment-type';

type Step = 'SOURCE' | 'GAPS' | 'REVIEW' | 'DESIGN' | 'GENERATING' | 'DONE';
type Scope = 'CAREER_PROFILE_AND_APPLICATION' | 'APPLICATION_ONLY';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  analyses?: AnalysisRow[];
  profileComplete?: boolean;
  activeProfileId?: string;
  initialJobMatchId?: string;
  onGenerated?: () => void;
}

interface SessionResponse {
  generationId: string;
  gaps: SemanticGapGroup[];
  evidence: UnifiedCandidateEvidence;
  remaining: number;
}

const STEP_ORDER: Step[] = ['SOURCE', 'GAPS', 'REVIEW', 'DESIGN'];
const ENTITY_LABELS: Record<HitlEvidenceEntityKind, string> = {
  EXPERIENCE: 'Work experience', PROJECT: 'Project', EDUCATION: 'Education', CERTIFICATION: 'Certification',
  TRAINING: 'Training', VOLUNTEERING: 'Volunteering', OPEN_SOURCE: 'Open source', OTHER: 'Other evidence',
};
const TEMPLATE_LABELS: Record<TemplateId, string> = {
  architect: 'Architect', editorial_refined: 'Editorial Refined', technical_precision: 'Technical Precision', academic_latex: 'Academic Research',
};

function collectionFor(kind: HitlEvidenceEntityKind, evidence: UnifiedCandidateEvidence | null) {
  if (!evidence) return [];
  const collection = kind === 'EXPERIENCE' ? evidence.employment
    : kind === 'PROJECT' ? evidence.projects
      : kind === 'EDUCATION' ? evidence.education
        : kind === 'CERTIFICATION' ? evidence.certifications
          : kind === 'TRAINING' ? evidence.training
            : kind === 'VOLUNTEERING' ? evidence.volunteerExperience
              : kind === 'OPEN_SOURCE' ? evidence.openSource : evidence.otherEvidence;
  return collection.filter((item) => item.sourceEntityId);
}

const NEW_ENTITY_FIELDS: Record<HitlEvidenceEntityKind, Array<{ key: string; label: string; required?: boolean; type?: 'date' | 'url' | 'list'; options?: ReadonlyArray<{ value: string; label: string }> }>> = {
  EXPERIENCE: [{ key: 'company', label: 'Employer', required: true }, { key: 'title', label: 'Job title', required: true }, { key: 'employmentType', label: 'Employment type', options: EMPLOYMENT_TYPES }, { key: 'startDate', label: 'Start date (YYYY or YYYY-MM)', required: true, type: 'date' }, { key: 'endDate', label: 'End date', type: 'date' }, { key: 'location', label: 'Location' }],
  PROJECT: [{ key: 'name', label: 'Project name', required: true }, { key: 'role', label: 'Role / contribution' }, { key: 'startDate', label: 'Start date', type: 'date' }, { key: 'endDate', label: 'End date', type: 'date' }, { key: 'technologies', label: 'Technologies (comma-separated)', type: 'list' }, { key: 'description', label: 'Purpose / description' }, { key: 'liveUrl', label: 'Live URL', type: 'url' }, { key: 'repositoryUrl', label: 'Repository URL', type: 'url' }],
  EDUCATION: [{ key: 'institution', label: 'Institution', required: true }, { key: 'qualification', label: 'Qualification', required: true }, { key: 'startDate', label: 'Start date', type: 'date' }, { key: 'endDate', label: 'End date', type: 'date' }, { key: 'grade', label: 'Grade / result' }],
  CERTIFICATION: [{ key: 'name', label: 'Certification name', required: true }, { key: 'issuer', label: 'Issuer' }, { key: 'issueDate', label: 'Issue date', type: 'date' }, { key: 'expiryDate', label: 'Expiry date', type: 'date' }, { key: 'credentialId', label: 'Credential ID' }, { key: 'credentialUrl', label: 'Credential URL', type: 'url' }],
  TRAINING: [{ key: 'course', label: 'Course', required: true }, { key: 'provider', label: 'Provider' }, { key: 'field', label: 'Field' }, { key: 'status', label: 'Status' }, { key: 'startDate', label: 'Start date', type: 'date' }, { key: 'endDate', label: 'End date', type: 'date' }, { key: 'result', label: 'Result' }],
  VOLUNTEERING: [{ key: 'organisation', label: 'Organisation', required: true }, { key: 'role', label: 'Role', required: true }, { key: 'startDate', label: 'Start date', type: 'date' }, { key: 'endDate', label: 'End date', type: 'date' }],
  OPEN_SOURCE: [{ key: 'projectName', label: 'Project name', required: true }, { key: 'role', label: 'Role / contribution' }, { key: 'repositoryUrl', label: 'Repository URL', type: 'url' }, { key: 'projectUrl', label: 'Project URL', type: 'url' }, { key: 'startDate', label: 'Start date', type: 'date' }, { key: 'endDate', label: 'End date', type: 'date' }, { key: 'description', label: 'Description' }, { key: 'technologies', label: 'Technologies (comma-separated)', type: 'list' }],
  OTHER: [{ key: 'title', label: 'Evidence title', required: true }, { key: 'context', label: 'Context' }, { key: 'period', label: 'Period' }],
};

function newEntityData(kind: HitlEvidenceEntityKind, fields: Record<string, string>): Record<string, unknown> {
  const data: Record<string, unknown> = Object.fromEntries(NEW_ENTITY_FIELDS[kind].flatMap((field) => {
    const value = fields[field.key]?.trim();
    if (!value) return [];
    return [[field.key, field.type === 'list' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value]];
  }));
  if (kind === 'EXPERIENCE' || kind === 'EDUCATION') data.current = false;
  if (kind === 'PROJECT' || kind === 'OPEN_SOURCE') data.technologies ??= [];
  return data;
}

function evidenceFieldKind(kind: HitlEvidenceEntityKind) {
  return kind === 'EXPERIENCE' || kind === 'PROJECT' ? 'ACHIEVEMENT'
    : kind === 'EDUCATION' || kind === 'TRAINING' ? 'COURSEWORK'
      : kind === 'CERTIFICATION' ? 'CREDENTIAL_EVIDENCE'
        : kind === 'VOLUNTEERING' || kind === 'OPEN_SOURCE' ? 'CONTRIBUTION'
          : 'DESCRIPTION';
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload?.message === 'string' ? payload.message : 'The request could not be completed.');
  return payload as T;
}

export default function CvGenerationWizard({
  isOpen, onClose, analyses = [], profileComplete = false, activeProfileId, initialJobMatchId, onGenerated,
}: Props) {
  const [step, setStep] = useState<Step>('SOURCE');
  const [sourceMode, setSourceMode] = useState<CvGenerationSourceMode>(initialJobMatchId ? 'JOB_MATCH' : 'CAREER_PROFILE');
  const [jobMatchId, setJobMatchId] = useState(initialJobMatchId ?? analyses[0]?.id ?? '');
  const [atsStrategy, setAtsStrategy] = useState<CvAtsStrategy>('STANDARD');
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [gaps, setGaps] = useState<SemanticGapGroup[]>([]);
  const [evidence, setEvidence] = useState<UnifiedCandidateEvidence | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [plan, setPlan] = useState<ProposedCvPlan | null>(null);
  const [excludedOptional, setExcludedOptional] = useState<string[]>([]);
  const [template, setTemplate] = useState<TemplateId>(DEFAULT_TEMPLATE_ID);
  const [captureGap, setCaptureGap] = useState<SemanticGapGroup | null>(null);
  const [entityKind, setEntityKind] = useState<HitlEvidenceEntityKind>('EXPERIENCE');
  const [entityId, setEntityId] = useState('');
  const [newEntityFields, setNewEntityFields] = useState<Record<string, string>>({});
  const [evidenceText, setEvidenceText] = useState('');
  const [scope, setScope] = useState<Scope>('CAREER_PROFILE_AND_APPLICATION');
  const [relatedIds, setRelatedIds] = useState<string[]>([]);
  const [relatedSuggestions, setRelatedSuggestions] = useState<Array<{ requirementId: string; confidence: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const entities = useMemo(() => collectionFor(entityKind, evidence), [entityKind, evidence]);
  const progress = step === 'DONE' ? 100 : step === 'GENERATING' ? 95 : ((STEP_ORDER.indexOf(step) + 1) / STEP_ORDER.length) * 100;

  if (!isOpen) return null;

  function resetAndClose() {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setStep('SOURCE'); setGenerationId(null); setPlan(null); setError(null); setDownloadUrl(null);
    onClose();
  }

  async function startSession() {
    setBusy(true); setError(null);
    try {
      const result = await jsonRequest<SessionResponse>('/api/cv-generations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: crypto.randomUUID(), sourceMode, atsStrategy,
          ...(sourceMode === 'JOB_MATCH' ? { jobMatchId } : { profileId: activeProfileId }),
        }),
      });
      setGenerationId(result.generationId); setGaps(result.gaps); setEvidence(result.evidence); setRemaining(result.remaining); setStep('GAPS');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start CV generation.'); }
    finally { setBusy(false); }
  }

  async function saveEvidence() {
    if (!generationId || !captureGap || !evidenceText.trim()) return;
    const existing = entities.find((item) => item.sourceEntityId === entityId);
    const missingField = !existing && NEW_ENTITY_FIELDS[entityKind].find((field) => field.required && !newEntityFields[field.key]?.trim());
    if (missingField) { setError(`${missingField.label} is required for the new record.`); return; }
    setBusy(true); setError(null);
    try {
      const requirementIds = [...new Set([...captureGap.requirementIds, ...relatedIds])];
      const result = await jsonRequest<SessionResponse>(`/api/cv-generations/${generationId}/evidence`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityKind,
          entity: existing
            ? { mode: 'EXISTING', entityId: existing.sourceEntityId, label: existing.label }
            : { mode: 'NEW', data: newEntityData(entityKind, newEntityFields) },
          evidenceItems: [{ fieldKind: evidenceFieldKind(entityKind), text: evidenceText, requirementIds }],
          persistenceScope: scope,
        }),
      });
      setGaps(result.gaps); setEvidence(result.evidence); setRemaining(result.remaining);
      setCaptureGap(null); setEvidenceText(''); setNewEntityFields({}); setEntityId(''); setRelatedIds([]); setRelatedSuggestions([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save evidence.'); }
    finally { setBusy(false); }
  }

  async function findRelated() {
    if (!generationId || !evidenceText.trim() || !captureGap) return;
    try {
      const result = await jsonRequest<{ suggestions: Array<{ requirementId: string; confidence: number }> }>(`/api/cv-generations/${generationId}/related-gaps`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: evidenceText, excludeRequirementIds: captureGap.requirementIds }),
      });
      setRelatedSuggestions(result.suggestions);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not check related gaps.'); }
  }

  async function confirmMissing(group: SemanticGapGroup) {
    if (!generationId) return;
    setBusy(true); setError(null);
    try {
      await jsonRequest(`/api/cv-generations/${generationId}/confirmed-missing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requirementIds: group.requirementIds }),
      });
      setGaps((items) => items.filter((item) => item.id !== group.id));
      setRemaining((value) => Math.max(0, value - group.requirementIds.length));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not confirm the gap.'); }
    finally { setBusy(false); }
  }

  async function createPlan() {
    if (!generationId) return;
    setBusy(true); setError(null);
    try {
      const result = await jsonRequest<{ plan: ProposedCvPlan }>(`/api/cv-generations/${generationId}/plan`, { method: 'POST' });
      setPlan(result.plan); setStep('REVIEW');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare the plan.'); }
    finally { setBusy(false); }
  }

  async function approvePlan() {
    if (!generationId || !plan) return;
    setBusy(true); setError(null);
    try {
      await jsonRequest(`/api/cv-generations/${generationId}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, excludedOptionalEvidenceIds: excludedOptional }),
      });
      setStep('GENERATING');
      const response = await fetch(`/api/cv-generations/${generationId}/generate`, { method: 'POST' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload?.message === 'string' ? payload.message : 'CV generation failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob); setDownloadUrl(url); setStep('DONE'); onGenerated?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'CV generation failed.'); setStep('DESIGN'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="cv-generation-title" className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="border-b border-slate-200 px-5 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-700">CV generation</p>
              <h2 id="cv-generation-title" className="mt-1 text-xl font-bold text-slate-950">Build from verified evidence</h2>
            </div>
            <button type="button" onClick={resetAndClose} disabled={step === 'GENERATING'} aria-label="Close CV generation" className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"><X size={19} /></button>
          </div>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-600 transition-[width] duration-300" style={{ width: `${progress}%` }} /></div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

          {step === 'SOURCE' && <div className="space-y-7">
            <div><h3 className="text-lg font-bold text-slate-900">Choose the evidence source</h3><p className="mt-1 text-sm text-slate-600">Both routes use the same evidence, review, and rendering pipeline.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Choice selected={sourceMode === 'CAREER_PROFILE'} disabled={!profileComplete || !activeProfileId} title="Career Profile" body="Create a complete CV from your saved, structured career evidence." onClick={() => setSourceMode('CAREER_PROFILE')} />
              <Choice selected={sourceMode === 'JOB_MATCH'} disabled={!initialJobMatchId && analyses.length === 0} title="Job Match" body="Tailor approved evidence to a stored job and its exact requirement ledger." onClick={() => setSourceMode('JOB_MATCH')} />
            </div>
            {sourceMode === 'JOB_MATCH' && !initialJobMatchId && <label className="block text-sm font-semibold text-slate-800">Job analysis<select value={jobMatchId} onChange={(event) => setJobMatchId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm">{analyses.map((item) => <option key={item.id} value={item.id}>{item.jobTitle} · {item.jobCompany}</option>)}</select></label>}
            <fieldset><legend className="text-sm font-semibold text-slate-800">ATS strategy</legend><div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Choice selected={atsStrategy === 'STANDARD'} title="Standard" body="Clear headings and faithful terminology. No keyword stuffing or score guarantee." onClick={() => setAtsStrategy('STANDARD')} />
              <Choice selected={atsStrategy === 'COMPOSITE'} title="Composite" body="Adds a concise expertise layer while keeping every claim tied to evidence." onClick={() => setAtsStrategy('COMPOSITE')} />
            </div></fieldset>
          </div>}

          {step === 'GAPS' && <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-900">Evidence reconciliation</h3><p className="mt-1 text-sm text-slate-600">{remaining ? `${remaining} requirements still need evidence or confirmation.` : 'Every requirement has been reconciled.'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{gaps.length} material gaps</span></div>
            {gaps.length === 0 ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900"><Check className="mr-2 inline h-4 w-4" />Reconciliation complete. Continue to review the proposed CV.</div> : <div className="space-y-3">{gaps.map((gap) => <div key={gap.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-slate-900">{gap.label}</p><p className="mt-1 text-xs text-slate-500">{gap.importance === 'MANDATORY' ? 'Required by the role' : 'Desirable'} · {gap.requirementIds.length} linked {gap.requirementIds.length === 1 ? 'requirement' : 'requirements'}</p></div><div className="flex gap-2"><button type="button" onClick={() => confirmMissing(gap)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">I don’t have this</button><button type="button" onClick={() => { setCaptureGap(gap); setRelatedIds([]); }} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"><Plus size={13} />Add evidence</button></div></div></div>)}</div>}
            {captureGap && <div className="rounded-2xl border border-cyan-200 bg-cyan-50/40 p-4 sm:p-5"><div className="flex items-center justify-between"><h4 className="font-bold text-slate-900">Evidence for {captureGap.label}</h4><button type="button" aria-label="Cancel evidence capture" onClick={() => setCaptureGap(null)}><X size={17} /></button></div><div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700">Record type<select value={entityKind} onChange={(event) => { setEntityKind(event.target.value as HitlEvidenceEntityKind); setEntityId(''); setNewEntityFields({}); }} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">{Object.entries(ENTITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="text-xs font-bold text-slate-700">Attach to<select value={entityId} onChange={(event) => setEntityId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Create a new record</option>{entities.map((item) => <option key={item.id} value={item.sourceEntityId}>{item.label}</option>)}</select></label>
            </div>{!entityId && <div className="mt-4 grid gap-3 sm:grid-cols-2">{NEW_ENTITY_FIELDS[entityKind].map((field) => <label key={field.key} className="block text-xs font-bold text-slate-700">{field.label}{field.required ? ' *' : ''}{field.options ? <select value={newEntityFields[field.key] ?? ''} onChange={(event) => setNewEntityFields((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Not specified</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type={field.type === 'url' ? 'url' : 'text'} value={newEntityFields[field.key] ?? ''} onChange={(event) => setNewEntityFields((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" />}</label>)}</div>}
              <label className="mt-4 block text-xs font-bold text-slate-700">What did you do, and what changed?<textarea value={evidenceText} onChange={(event) => setEvidenceText(event.target.value)} rows={4} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" placeholder="Use specific, factual detail. Metrics are helpful when you can verify them." /></label>
              <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" onClick={findRelated} className="text-xs font-semibold text-cyan-800 hover:underline">Check for related gaps</button><label className="text-xs text-slate-600"><input type="checkbox" checked={scope === 'CAREER_PROFILE_AND_APPLICATION'} onChange={(event) => setScope(event.target.checked ? 'CAREER_PROFILE_AND_APPLICATION' : 'APPLICATION_ONLY')} className="mr-2" />Save to my Career Profile</label></div>
              {relatedSuggestions.length > 0 && <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-bold text-slate-700">This evidence may also support:</p>{relatedSuggestions.map((item) => <label key={item.requirementId} className="mt-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={relatedIds.includes(item.requirementId)} onChange={(event) => setRelatedIds((ids) => event.target.checked ? [...ids, item.requirementId] : ids.filter((id) => id !== item.requirementId))} />Requirement {item.requirementId.slice(0, 8)} · {Math.round(item.confidence * 100)}% match</label>)}</div>}
              <div className="mt-4 flex justify-end"><Button onClick={saveEvidence} isLoading={busy} disabled={!evidenceText.trim()}>Save and re-check all requirements</Button></div>
            </div>}
          </div>}

          {step === 'REVIEW' && plan && <div className="space-y-6"><div><h3 className="text-lg font-bold text-slate-900">Review the CV plan</h3><p className="mt-1 text-sm text-slate-600">This is the exact evidence and structure the generator will receive. Core facts cannot be removed.</p></div><div className="grid gap-3 sm:grid-cols-3"><Stat label="Strategy" value={plan.targetStrategy.replaceAll('_', ' ')} /><Stat label="Length" value={plan.targetLength.replaceAll('_', ' ')} /><Stat label="Density" value={plan.density} /></div><div><h4 className="text-sm font-bold text-slate-900">Section order</h4><div className="mt-2 flex flex-wrap gap-2">{plan.sectionOrder.map((section, index) => <span key={section} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{index + 1}. {section.replaceAll('_', ' ')}</span>)}</div></div><div><h4 className="text-sm font-bold text-slate-900">Optional supporting evidence</h4><p className="mt-1 text-xs text-slate-500">Optional items are included by default. Excluding one is recorded in the approved plan.</p><div className="mt-3 max-h-52 space-y-2 overflow-y-auto">{plan.optionalEvidenceIds.length ? plan.optionalEvidenceIds.map((id) => <label key={id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700"><input type="checkbox" checked={!excludedOptional.includes(id)} onChange={(event) => setExcludedOptional((items) => event.target.checked ? items.filter((item) => item !== id) : [...items, id])} className="mt-0.5" /><span>{evidence?.evidenceById[id]?.canonicalText ?? id}</span></label>) : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No optional items need a decision.</p>}</div></div></div>}

          {step === 'DESIGN' && <div className="space-y-6"><div><h3 className="text-lg font-bold text-slate-900">Choose the presentation</h3><p className="mt-1 text-sm text-slate-600">Templates change layout, not the approved evidence selection.</p></div><div className="grid gap-3 sm:grid-cols-2">{TEMPLATE_IDS.map((id) => <Choice key={id} selected={template === id} title={TEMPLATE_LABELS[id]} body="Single-column, readable headings, live links, and evidence-preserving sections." onClick={() => setTemplate(id)} />)}</div><div className="flex gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>Evidence-safe generation:</strong> wording may be tightened for the target, but unsupported claims, invented metrics, and guaranteed ATS outcomes are not permitted.</p></div></div>}
          {step === 'GENERATING' && <div className="flex min-h-64 flex-col items-center justify-center text-center"><Loader2 className="h-8 w-8 animate-spin text-cyan-700" /><h3 className="mt-5 text-lg font-bold text-slate-900">Building your approved CV</h3><p className="mt-2 max-w-md text-sm text-slate-600">Rewriting approved evidence, validating preservation, and rendering the document.</p></div>}
          {step === 'DONE' && <div className="flex min-h-64 flex-col items-center justify-center text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check /></span><h3 className="mt-5 text-xl font-bold text-slate-900">Your CV is ready</h3><p className="mt-2 text-sm text-slate-600">The saved document was built from the plan you approved.</p>{downloadUrl && <a href={downloadUrl} download="CV.docx" className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-bold text-white"><Download size={16} />Download DOCX</a>}</div>}
        </div>

        {!['GENERATING', 'DONE'].includes(step) && <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-7"><button type="button" onClick={() => setStep(step === 'DESIGN' ? 'REVIEW' : step === 'REVIEW' ? 'GAPS' : 'SOURCE')} disabled={step === 'SOURCE' || busy} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 disabled:invisible"><ChevronLeft size={16} />Back</button>{step === 'SOURCE' ? <Button onClick={startSession} isLoading={busy} disabled={sourceMode === 'JOB_MATCH' ? !jobMatchId : !activeProfileId}>Start reconciliation</Button> : step === 'GAPS' ? <Button onClick={createPlan} isLoading={busy}>Review CV plan</Button> : step === 'REVIEW' ? <Button onClick={() => setStep('DESIGN')}>Choose template</Button> : <Button onClick={approvePlan} isLoading={busy}>Approve plan and generate</Button>}</footer>}
        {step === 'DONE' && <footer className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-7"><Button variant="outline" onClick={resetAndClose}>Close</Button></footer>}
      </section>
    </div>
  );
}

function Choice({ selected, disabled, title, body, onClick }: { selected: boolean; disabled?: boolean; title: string; body: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} className={cn('relative rounded-2xl border p-4 text-left transition-colors', selected ? 'border-cyan-600 bg-cyan-50 ring-1 ring-cyan-600' : 'border-slate-200 hover:border-slate-400', disabled && 'cursor-not-allowed opacity-45')}><span className="block pr-7 text-sm font-bold text-slate-900">{title}</span><span className="mt-1.5 block text-xs leading-5 text-slate-600">{body}</span>{selected && <Check className="absolute right-4 top-4 h-4 w-4 text-cyan-700" />}</button>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-sm font-bold capitalize text-slate-900">{value.toLocaleLowerCase('en-GB')}</p></div>;
}
