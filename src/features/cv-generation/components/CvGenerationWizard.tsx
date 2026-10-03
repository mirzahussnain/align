'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronUp, Download, GripVertical, Loader2, RotateCcw, ShieldCheck, X } from 'lucide-react';
import Button from '@/shared/components/ui/Button';
import { cn } from '@/shared/utils/cn';
import type { AnalysisRow } from '@/features/dashboard/components/DashboardShell';
import type {
  CvAtsStrategy,
  CvGenerationSourceMode,
  CvPlanSection,
  EvidenceCaptureInput,
  ProposedCvPlan,
  SemanticGapGroup,
  UnifiedCandidateEvidence,
} from '@/shared/cv-generation/types';
import { DEFAULT_TEMPLATE_ID, TEMPLATE_IDS, type TemplateId } from '@/shared/constants/templates';
import EvidenceReconciliationStep from './EvidenceReconciliationStep';

type Step = 'SOURCE' | 'GAPS' | 'REVIEW' | 'DESIGN' | 'GENERATING' | 'DONE';

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

const WIZARD_STEPS = ['Source / Target', 'Evidence reconciliation', 'Review CV plan', 'Generate'] as const;
const TEMPLATE_LABELS: Record<TemplateId, string> = {
  architect: 'Architect', editorial_refined: 'Editorial Refined', technical_precision: 'Technical Precision', academic_latex: 'Academic Research',
};
const SECTION_LABELS: Record<CvPlanSection, string> = {
  PROFILE: 'Professional Summary', EXECUTIVE_SUMMARY: 'Executive Summary', CORE_EXPERTISE: 'Core Expertise',
  EXPERIENCE: 'Professional Experience', SELECTED_IMPACT: 'Selected Impact', SKILLS: 'Technical Skills',
  PROJECTS: 'Selected Projects', EDUCATION: 'Education', CERTIFICATIONS: 'Certifications', TRAINING: 'Training',
  VOLUNTEERING: 'Volunteering', OPEN_SOURCE: 'Open Source', OTHER: 'Additional Evidence',
};

function wizardStepFor(step: Step): number {
  if (step === 'SOURCE') return 1;
  if (step === 'GAPS') return 2;
  if (step === 'REVIEW' || step === 'DESIGN') return 3;
  return 4;
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
  const [sectionOrder, setSectionOrder] = useState<CvPlanSection[]>([]);
  const [excludedOptional, setExcludedOptional] = useState<string[]>([]);
  const [template, setTemplate] = useState<TemplateId>(DEFAULT_TEMPLATE_ID);
  const [resolvedRequirementIds, setResolvedRequirementIds] = useState<string[]>([]);
  const [mainBusy, setMainBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const wizardStep = wizardStepFor(step);

  if (!isOpen) return null;

  function resetAndClose() {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setStep('SOURCE'); setGenerationId(null); setPlan(null); setSectionOrder([]); setError(null); setDownloadUrl(null);
    onClose();
  }

  async function startSession() {
    setMainBusy(true); setError(null);
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
    finally { setMainBusy(false); }
  }

  async function saveEvidence(input: EvidenceCaptureInput) {
    if (!generationId) return;
    setError(null);
    try {
      const result = await jsonRequest<SessionResponse & { resolvedRequirementIds: string[] }>(`/api/cv-generations/${generationId}/evidence`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
      setGaps(result.gaps); setEvidence(result.evidence); setRemaining(result.remaining);
      setResolvedRequirementIds(result.resolvedRequirementIds);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save evidence.'); throw cause; }
  }

  async function confirmRequirement(group: SemanticGapGroup, decision: 'MEETS' | 'DOES_NOT_MEET') {
    if (!generationId) return;
    setError(null);
    try {
      const result = await jsonRequest<{ gaps: SemanticGapGroup[]; remaining: number }>(`/api/cv-generations/${generationId}/confirmations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requirementIds: group.requirementIds, decision }),
      });
      setGaps(result.gaps); setRemaining(result.remaining);
      setResolvedRequirementIds(decision === 'MEETS' ? group.requirementIds : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the confirmation.'); throw cause; }
  }
  async function createPlan() {
    if (!generationId) return;
    setMainBusy(true); setError(null);
    try {
      const result = await jsonRequest<{ plan: ProposedCvPlan }>(`/api/cv-generations/${generationId}/plan`, { method: 'POST' });
      setPlan(result.plan); setSectionOrder([...result.plan.sectionOrder]); setStep('REVIEW');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare the plan.'); }
    finally { setMainBusy(false); }
  }

  async function approvePlan() {
    if (!generationId || !plan) return;
    setMainBusy(true); setError(null);
    try {
      await jsonRequest(`/api/cv-generations/${generationId}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, excludedOptionalEvidenceIds: excludedOptional, sectionOrder }),
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
    finally { setMainBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-primary/90 p-3 backdrop-blur-sm" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="cv-generation-title" className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border-subtle bg-bg-secondary shadow-2xl">
        <header className="border-b border-border-subtle px-5 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-4">
            <h2 id="cv-generation-title" className="text-xl font-bold text-text-primary">Build from verified evidence</h2>
            <button type="button" onClick={resetAndClose} disabled={step === 'GENERATING'} aria-label="Close CV generation" className="rounded-full p-2 text-text-tertiary hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-40"><X size={19} /></button>
          </div>
          <ol aria-label="CV generation progress" className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">{WIZARD_STEPS.map((label, index) => { const number = index + 1; const current = number === wizardStep; const complete = number < wizardStep; return <li key={label} aria-current={current ? 'step' : undefined} className={cn('flex items-center gap-2 text-[11px] font-semibold', current ? 'text-accent-cyan' : complete ? 'text-text-primary' : 'text-text-tertiary')}><span aria-label={complete ? `${label} complete` : undefined} className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs', current ? 'bg-accent-cyan text-brand-primary' : complete ? 'bg-brand-primary text-bg-secondary' : 'bg-bg-tertiary text-text-tertiary')}>{complete ? <Check className="h-3 w-3" /> : number}</span><span>{label}</span></li>; })}</ol>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          {error && <div role="alert" className="mb-5 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>}

          {step === 'SOURCE' && <div className="space-y-7">
            <div><h3 className="text-lg font-bold text-text-primary">Choose the evidence source</h3><p className="mt-1 text-sm text-text-secondary">Both routes use the same evidence, review, and rendering pipeline.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Choice selected={sourceMode === 'CAREER_PROFILE'} disabled={!profileComplete || !activeProfileId} title="Career Profile" body="Create a complete CV from your saved, structured career evidence." onClick={() => setSourceMode('CAREER_PROFILE')} />
              <Choice selected={sourceMode === 'JOB_MATCH'} disabled={!initialJobMatchId && analyses.length === 0} title="Job Match" body="Tailor approved evidence to a stored job and its exact requirement ledger." onClick={() => setSourceMode('JOB_MATCH')} />
            </div>
            {sourceMode === 'JOB_MATCH' && !initialJobMatchId && <label className="block text-sm font-semibold text-text-secondary">Job analysis<select value={jobMatchId} onChange={(event) => setJobMatchId(event.target.value)} className="mt-2 w-full rounded-xl border border-border-default bg-bg-secondary px-3 py-3 text-sm">{analyses.map((item) => <option key={item.id} value={item.id}>{item.jobTitle} · {item.jobCompany}</option>)}</select></label>}
            <fieldset><legend className="text-sm font-semibold text-text-secondary">ATS strategy</legend><div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Choice selected={atsStrategy === 'STANDARD'} title="Standard" body="Clear headings and faithful terminology. No keyword stuffing or score guarantee." onClick={() => setAtsStrategy('STANDARD')} />
              <Choice selected={atsStrategy === 'COMPOSITE'} title="Composite" body="Adds a concise expertise layer while keeping every claim tied to evidence." onClick={() => setAtsStrategy('COMPOSITE')} />
            </div></fieldset>
          </div>}

          {step === 'GAPS' && generationId && evidence && <EvidenceReconciliationStep
            generationId={generationId}
            gaps={gaps}
            evidence={evidence}
            remaining={remaining}
            resolvedRequirementIds={resolvedRequirementIds}
            onSave={saveEvidence}
            onConfirm={confirmRequirement}
          />}
          {step === 'REVIEW' && plan && <div className="space-y-6"><div><h3 className="text-lg font-bold text-text-primary">Review the CV plan</h3><p className="mt-1 text-sm text-text-secondary">This is the exact evidence and structure the generator will receive. Core facts cannot be removed.</p></div><div className="grid gap-3 sm:grid-cols-3"><Stat label="Strategy" value={plan.targetStrategy.replaceAll('_', ' ')} /><Stat label="Length" value={plan.targetLength.replaceAll('_', ' ')} /><Stat label="Density" value={plan.density} /></div><SectionOrderEditor order={sectionOrder} recommended={plan.sectionOrder} onChange={setSectionOrder} /><div><h4 className="text-sm font-bold text-text-primary">Optional supporting evidence</h4><p className="mt-1 text-xs text-text-tertiary">Optional items are included by default. Excluding one is recorded in the approved plan.</p><div className="mt-3 max-h-52 space-y-2 overflow-y-auto">{plan.optionalEvidenceIds.length ? plan.optionalEvidenceIds.map((id) => <label key={id} className="flex items-start gap-3 rounded-xl border border-border-subtle p-3 text-sm text-text-secondary"><input type="checkbox" checked={!excludedOptional.includes(id)} onChange={(event) => setExcludedOptional((items) => event.target.checked ? items.filter((item) => item !== id) : [...items, id])} className="mt-0.5" /><span>{evidence?.evidenceById[id]?.canonicalText ?? id}</span></label>) : <p className="rounded-xl bg-bg-primary p-3 text-sm text-text-tertiary">No optional items need a decision.</p>}</div></div></div>}

          {step === 'DESIGN' && <div className="space-y-6"><div><h3 className="text-lg font-bold text-text-primary">Choose the presentation</h3><p className="mt-1 text-sm text-text-secondary">Templates change layout, not the approved evidence selection.</p></div><div className="grid gap-3 sm:grid-cols-2">{TEMPLATE_IDS.map((id) => <Choice key={id} selected={template === id} title={TEMPLATE_LABELS[id]} body="Single-column, readable headings, live links, and evidence-preserving sections." onClick={() => setTemplate(id)} />)}</div><div className="flex gap-3 rounded-2xl border border-accent-cyan/30 bg-accent-cyan/10 p-4 text-sm text-text-primary"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>Evidence-safe generation:</strong> wording may be tightened for the target, but unsupported claims, invented metrics, and guaranteed ATS outcomes are not permitted.</p></div></div>}
          {step === 'GENERATING' && <div className="flex min-h-64 flex-col items-center justify-center text-center"><Loader2 className="h-8 w-8 animate-spin text-accent-cyan" /><h3 className="mt-5 text-lg font-bold text-text-primary">Building your approved CV</h3><p className="mt-2 max-w-md text-sm text-text-secondary">Rewriting approved evidence, validating preservation, and rendering the document.</p></div>}
          {step === 'DONE' && <div className="flex min-h-64 flex-col items-center justify-center text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success"><Check /></span><h3 className="mt-5 text-xl font-bold text-text-primary">Your CV is ready</h3><p className="mt-2 text-sm text-text-secondary">The saved document was built from the plan you approved.</p>{downloadUrl && <a href={downloadUrl} download="CV.docx" className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-primary px-5 py-3 text-sm font-bold text-bg-secondary"><Download size={16} />Download DOCX</a>}</div>}
        </div>

        {!['GENERATING', 'DONE'].includes(step) && <footer className="flex items-center justify-between border-t border-border-subtle bg-bg-primary px-5 py-4 sm:px-7"><button type="button" onClick={() => setStep(step === 'DESIGN' ? 'REVIEW' : step === 'REVIEW' ? 'GAPS' : 'SOURCE')} disabled={step === 'SOURCE' || mainBusy} className="inline-flex items-center gap-1 text-sm font-semibold text-text-secondary disabled:invisible"><ChevronLeft size={16} />Back</button>{step === 'SOURCE' ? <Button onClick={startSession} isLoading={mainBusy} disabled={sourceMode === 'JOB_MATCH' ? !jobMatchId : !activeProfileId}>Start reconciliation</Button> : step === 'GAPS' ? <Button onClick={createPlan} isLoading={mainBusy}>Review CV plan</Button> : step === 'REVIEW' ? <Button onClick={() => setStep('DESIGN')}>Choose template</Button> : <Button onClick={approvePlan} isLoading={mainBusy}>Approve plan and generate</Button>}</footer>}
        {step === 'DONE' && <footer className="flex justify-end border-t border-border-subtle bg-bg-primary px-5 py-4 sm:px-7"><Button variant="outline" onClick={resetAndClose}>Close</Button></footer>}
      </section>
    </div>
  );
}

function SectionOrderEditor({ order, recommended, onChange }: { order: CvPlanSection[]; recommended: CvPlanSection[]; onChange: (order: CvPlanSection[]) => void }) {
  const move = (index: number, offset: -1 | 1) => {
    const destination = index + offset;
    if (destination < 0 || destination >= order.length) return;
    const next = [...order];
    [next[index], next[destination]] = [next[destination], next[index]];
    onChange(next);
  };
  const drop = (source: CvPlanSection, destination: CvPlanSection) => {
    if (source === destination || !order.includes(source) || !order.includes(destination)) return;
    const next = order.filter((section) => section !== source);
    next.splice(next.indexOf(destination), 0, source);
    onChange(next);
  };
  const isRecommended = order.length === recommended.length && order.every((section, index) => section === recommended[index]);
  return <div><div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-bold text-text-primary">Section order</h4><p className="mt-1 text-xs text-text-tertiary">Drag sections or use the accessible move controls.</p></div><button type="button" onClick={() => onChange([...recommended])} disabled={isRecommended} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"><RotateCcw size={14} />Reset to recommended order</button></div><ol aria-label="CV section order" className="mt-3 space-y-2">{order.map((section, index) => { const label = SECTION_LABELS[section]; return <li key={section} aria-label={label} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', section); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={(event) => { event.preventDefault(); drop(event.dataTransfer.getData('text/plain') as CvPlanSection, section); }} className="flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-primary px-3 py-2.5"><GripVertical className="h-4 w-4 shrink-0 cursor-grab text-text-tertiary" aria-hidden="true" /><span className="min-w-0 flex-1 text-sm font-semibold text-text-primary">{label}</span><button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${label} up`} className="rounded-lg p-1.5 text-text-secondary hover:bg-bg-tertiary disabled:opacity-30"><ChevronUp size={16} /></button><button type="button" onClick={() => move(index, 1)} disabled={index === order.length - 1} aria-label={`Move ${label} down`} className="rounded-lg p-1.5 text-text-secondary hover:bg-bg-tertiary disabled:opacity-30"><ChevronDown size={16} /></button></li>; })}</ol></div>;
}

function Choice({ selected, disabled, title, body, onClick }: { selected: boolean; disabled?: boolean; title: string; body: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} className={cn('relative rounded-2xl border p-4 text-left transition-colors', selected ? 'border-accent-cyan bg-accent-cyan/10 ring-1 ring-accent-cyan' : 'border-border-subtle hover:border-border-default', disabled && 'cursor-not-allowed opacity-45')}><span className="block pr-7 text-sm font-bold text-text-primary">{title}</span><span className="mt-1.5 block text-xs leading-5 text-text-secondary">{body}</span>{selected && <Check className="absolute right-4 top-4 h-4 w-4 text-accent-cyan" />}</button>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-border-subtle bg-bg-primary p-4"><p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">{label}</p><p className="mt-1 text-sm font-bold capitalize text-text-primary">{value.toLocaleLowerCase('en-GB')}</p></div>;
}
